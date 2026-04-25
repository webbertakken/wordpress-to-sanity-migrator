import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import { promisify } from 'util'

const { execMock, spawnMock, createReadStreamMock } = vi.hoisted(() => {
  const fn = vi.fn()
  // execAsync = promisify(exec) in the source. Tag the mock so promisify
  // uses the same { stdout, stderr } shape that the real exec exposes.
  ;(fn as unknown as Record<symbol, unknown>)[Symbol.for('nodejs.util.promisify.custom')] = (
    cmd: string,
  ) =>
    new Promise((resolve, reject) => {
      fn(cmd, (err: unknown, stdout: string, stderr: string) => {
        if (err) reject(err)
        else resolve({ stdout, stderr })
      })
    })
  return { execMock: fn, spawnMock: vi.fn(), createReadStreamMock: vi.fn() }
})

// Sanity check that promisify will pick the custom shape up.
void promisify

vi.mock('child_process', () => ({
  exec: execMock,
  spawn: spawnMock,
  default: { exec: execMock, spawn: spawnMock },
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    default: { ...actual, createReadStream: createReadStreamMock },
    createReadStream: createReadStreamMock,
  }
})

import { executeContainerCommand } from '../execute-container-command'

beforeEach(() => {
  vi.clearAllMocks()
})

function mockExecResolve(stdout = 'ok', stderr = ''): void {
  // util.promisify(exec) returns { stdout, stderr } and the underlying exec
  // signature is `(cmd, opts?, cb)` where cb(err, stdout, stderr).
  execMock.mockImplementationOnce(
    (_cmd: string, cb: (e: unknown, so: string, se: string) => void) => {
      cb(null, stdout, stderr)
      return undefined
    },
  )
}

function mockExecReject(error: Error): void {
  execMock.mockImplementationOnce((_cmd: string, cb: (e: unknown) => void) => {
    cb(error)
    return undefined
  })
}

function fakeSpawnSuccess(): void {
  spawnMock.mockImplementationOnce(() => {
    const proc = new EventEmitter() as EventEmitter & {
      stdin: EventEmitter
      stdout: EventEmitter
      stderr: EventEmitter
    }
    proc.stdin = new EventEmitter()
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    queueMicrotask(() => {
      proc.stdout.emit('data', Buffer.from('imported'))
      proc.emit('close', 0)
    })
    return proc
  })
}

function fakeSpawnFailure(stderr = 'failed'): void {
  spawnMock.mockImplementationOnce(() => {
    const proc = new EventEmitter() as EventEmitter & {
      stdin: EventEmitter
      stdout: EventEmitter
      stderr: EventEmitter
    }
    proc.stdin = new EventEmitter()
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    queueMicrotask(() => {
      proc.stderr.emit('data', Buffer.from(stderr))
      proc.emit('close', 1)
    })
    return proc
  })
}

function stubReadStream(): void {
  createReadStreamMock.mockReturnValue({
    pipe: vi.fn(),
    on: vi.fn(),
  } as never)
}

describe('executeContainerCommand("start")', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('runs the full happy-path sequence and returns success', async () => {
    // 1. start container
    mockExecResolve('container-id', '')
    // 2. wait happens via setTimeout (fake timers)
    // 3. create db
    mockExecResolve('done', '')
    // 4. import dump uses spawn
    fakeSpawnSuccess()
    stubReadStream()
    // 5. inspect databases
    mockExecResolve('databases listed', '')
    // 6. list tables
    mockExecResolve('tables', '')
    // 7. count posts
    mockExecResolve('counts', '')

    const promise = executeContainerCommand('start')
    await vi.advanceTimersByTimeAsync(12000)
    const result = await promise

    expect(result.success).toBe(true)
    expect(result.steps.map((s) => s.step)).toEqual([
      'Start container',
      'Wait for MariaDB to initialize',
      'Create database',
      'Import dump',
      'Inspect databases',
      'List tables',
      'Count posts by type',
    ])
    expect(result.steps.every((s) => s.success)).toBe(true)
  })

  it('reports a port-conflict guidance when start fails with bind: address already in use', async () => {
    const err = Object.assign(new Error('docker: bind: address already in use'), {
      stderr: 'docker: bind: address already in use',
    })
    mockExecReject(err)
    const result = await executeContainerCommand('start')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Port 3306 is already in use/)
    expect((result.details as { guidance: string }).guidance).toMatch(/lsof -i :3306/)
  })

  it('reports a name-conflict guidance when the container name is already taken', async () => {
    const err = Object.assign(new Error('docker error'), {
      stderr: 'Conflict. The container name "/temp-mariadb" is already in use',
    })
    mockExecReject(err)
    const result = await executeContainerCommand('start')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/already exists/i)
  })

  it('returns a generic failure when start exits with stderr but no thrown error', async () => {
    execMock.mockImplementationOnce(
      (_cmd: string, cb: (e: unknown, so: string, se: string) => void) => {
        cb(null, '', 'something bad')
        return undefined
      },
    )
    const result = await executeContainerCommand('start')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to start container')
  })

  it('returns a failure when create-database fails (rejection path)', async () => {
    mockExecResolve('container-id', '')
    mockExecReject(new Error('mysql is down'))
    const promise = executeContainerCommand('start')
    await vi.advanceTimersByTimeAsync(12000)
    const result = await promise
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to create database')
  })

  it('returns a failure when create-database resolves with stderr', async () => {
    mockExecResolve('container-id', '')
    mockExecResolve('', 'access denied')
    const promise = executeContainerCommand('start')
    await vi.advanceTimersByTimeAsync(12000)
    const result = await promise
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to create database')
  })

  it('falls back to "Exited with code N" when spawn fails with empty stderr', async () => {
    mockExecResolve('container-id', '')
    mockExecResolve('done', '')
    spawnMock.mockImplementationOnce(() => {
      const proc = new EventEmitter() as EventEmitter & {
        stdin: EventEmitter
        stdout: EventEmitter
        stderr: EventEmitter
      }
      proc.stdin = new EventEmitter()
      proc.stdout = new EventEmitter()
      proc.stderr = new EventEmitter()
      queueMicrotask(() => proc.emit('close', 137))
      return proc
    })
    stubReadStream()
    const promise = executeContainerCommand('start')
    await vi.advanceTimersByTimeAsync(12000)
    const result = await promise
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to import dump')
    expect(result.steps.find((s) => s.step === 'Import dump')!.stderr).toContain(
      'Exited with code 137',
    )
  })

  it('treats spawn resolving with non-empty stderr as a failed import (covers the if-success false branch)', async () => {
    mockExecResolve('container-id', '')
    mockExecResolve('done', '')
    spawnMock.mockImplementationOnce(() => {
      const proc = new EventEmitter() as EventEmitter & {
        stdin: EventEmitter
        stdout: EventEmitter
        stderr: EventEmitter
      }
      proc.stdin = new EventEmitter()
      proc.stdout = new EventEmitter()
      proc.stderr = new EventEmitter()
      queueMicrotask(() => {
        proc.stderr.emit('data', Buffer.from('mariadb warning'))
        proc.emit('close', 0)
      })
      return proc
    })
    stubReadStream()
    const promise = executeContainerCommand('start')
    await vi.advanceTimersByTimeAsync(12000)
    const result = await promise
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to import dump')
  })

  it('returns a failure when inspect databases resolves with stderr', async () => {
    mockExecResolve('container-id', '')
    mockExecResolve('done', '')
    fakeSpawnSuccess()
    stubReadStream()
    mockExecResolve('', 'inspect failed')
    const promise = executeContainerCommand('start')
    await vi.advanceTimersByTimeAsync(12000)
    const result = await promise
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to inspect databases')
  })

  it('returns a failure when count posts resolves with stderr', async () => {
    mockExecResolve('container-id', '')
    mockExecResolve('done', '')
    fakeSpawnSuccess()
    stubReadStream()
    mockExecResolve('databases', '')
    mockExecResolve('tables', '')
    mockExecResolve('', 'count failed')
    const promise = executeContainerCommand('start')
    await vi.advanceTimersByTimeAsync(12000)
    const result = await promise
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to count posts')
  })

  it('returns a failure when the spawn import process exits non-zero', async () => {
    mockExecResolve('container-id', '')
    mockExecResolve('done', '')
    fakeSpawnFailure('mariadb error')
    stubReadStream()
    const promise = executeContainerCommand('start')
    await vi.advanceTimersByTimeAsync(12000)
    const result = await promise
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to import dump')
  })

  it('returns a failure when inspect databases fails', async () => {
    mockExecResolve('container-id', '')
    mockExecResolve('done', '')
    fakeSpawnSuccess()
    stubReadStream()
    mockExecReject(new Error('inspect bang'))
    const promise = executeContainerCommand('start')
    await vi.advanceTimersByTimeAsync(12000)
    const result = await promise
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to inspect databases')
  })

  it('returns a failure when list tables resolves with stderr', async () => {
    mockExecResolve('container-id', '')
    mockExecResolve('done', '')
    fakeSpawnSuccess()
    stubReadStream()
    mockExecResolve('databases', '')
    mockExecResolve('', 'no permission')
    const promise = executeContainerCommand('start')
    await vi.advanceTimersByTimeAsync(12000)
    const result = await promise
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to list tables')
  })

  it('returns a failure when list tables fails (rejection path)', async () => {
    mockExecResolve('container-id', '')
    mockExecResolve('done', '')
    fakeSpawnSuccess()
    stubReadStream()
    mockExecResolve('databases', '')
    mockExecReject(new Error('list bang'))
    const promise = executeContainerCommand('start')
    await vi.advanceTimersByTimeAsync(12000)
    const result = await promise
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to list tables')
  })

  it('returns a failure when count posts fails (rejection path)', async () => {
    mockExecResolve('container-id', '')
    mockExecResolve('done', '')
    fakeSpawnSuccess()
    stubReadStream()
    mockExecResolve('databases', '')
    mockExecResolve('tables', '')
    mockExecReject(new Error('count bang'))
    const promise = executeContainerCommand('start')
    await vi.advanceTimersByTimeAsync(12000)
    const result = await promise
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to count posts')
  })

  it('reports the import dump rejection from the spawn promise', async () => {
    mockExecResolve('container-id', '')
    mockExecResolve('done', '')
    spawnMock.mockImplementationOnce(() => {
      const proc = new EventEmitter() as EventEmitter & {
        stdin: EventEmitter
        stdout: EventEmitter
        stderr: EventEmitter
      }
      proc.stdin = new EventEmitter()
      proc.stdout = new EventEmitter()
      proc.stderr = new EventEmitter()
      queueMicrotask(() => proc.emit('error', new Error('spawn EACCES')))
      return proc
    })
    stubReadStream()
    const promise = executeContainerCommand('start')
    await vi.advanceTimersByTimeAsync(12000)
    const result = await promise
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to import dump')
  })

  it('emits per-step callbacks with the step lifecycle', async () => {
    mockExecResolve('container-id', '')
    mockExecResolve('done', '')
    fakeSpawnSuccess()
    stubReadStream()
    mockExecResolve('databases', '')
    mockExecResolve('tables', '')
    mockExecResolve('counts', '')

    const onStep = vi.fn()
    const promise = executeContainerCommand('start', onStep)
    await vi.advanceTimersByTimeAsync(12000)
    await promise
    expect(onStep).toHaveBeenCalled()
  })

  it('routes a synchronous exec throw into the inner catch (still a structured failure)', async () => {
    execMock.mockImplementationOnce(() => {
      throw new Error('boom from exec')
    })
    const result = await executeContainerCommand('start')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to start container')
  })

  it('routes an onStep throw (Error) into the outer catch as an Unexpected error step', async () => {
    let calls = 0
    const onStep = () => {
      calls += 1
      // Only throw on the first call so the recovery pushStep call inside
      // the outer catch can still emit the Unexpected error step.
      if (calls === 1) throw new Error('onStep boom')
    }
    const result = await executeContainerCommand('start', onStep)
    expect(result.success).toBe(false)
    expect(result.steps[result.steps.length - 1].step).toBe('Unexpected error')
    expect(result.error).toMatch(/onStep boom/)
  })

  it('routes an onStep throw (non-Error) into the outer catch (covers String(error) and ?? {} branches)', async () => {
    let calls = 0
    const onStep = () => {
      calls += 1
      // eslint-disable-next-line no-throw-literal
      if (calls === 1) throw 'string-throw'
    }
    const result = await executeContainerCommand('start', onStep)
    expect(result.success).toBe(false)
    expect(result.error).toBe('string-throw')
  })
})

describe('executeContainerCommand("stop")', () => {
  it('reports success when both stop and remove succeed cleanly', async () => {
    mockExecResolve('stopped', '')
    mockExecResolve('removed', '')
    const result = await executeContainerCommand('stop')
    expect(result.success).toBe(true)
    expect(result.message).toMatch(/torn down/)
  })

  it('treats "No such container" as informational on stop', async () => {
    execMock.mockImplementationOnce((_cmd: string, cb) =>
      (cb as (e: unknown, so: string, se: string) => void)(null, '', 'No such container'),
    )
    mockExecResolve('removed', '')
    const result = await executeContainerCommand('stop')
    expect(result.success).toBe(true)
    expect(result.message).toMatch(/already not running/)
    expect(result.steps[0].info).toBe(true)
  })

  it('treats "No such container" as informational when stop throws', async () => {
    const err = Object.assign(new Error('boom'), { stderr: 'No such container' })
    mockExecReject(err)
    mockExecResolve('removed', '')
    const result = await executeContainerCommand('stop')
    expect(result.success).toBe(true)
    expect(result.steps[0].info).toBe(true)
  })

  it('treats a non-Error stop rejection as a regular stop failure (no info flag) and continues to remove', async () => {
    execMock.mockImplementationOnce((_cmd: string, cb) =>
      (cb as (e: unknown) => void)('weird-string'),
    )
    mockExecResolve('removed', '')
    const result = await executeContainerCommand('stop')
    expect(result.success).toBe(true)
    expect(result.steps[0].success).toBe(false)
    expect(result.steps[0].info).toBe(false)
  })

  it('reports a failure when remove throws (and not "No such container")', async () => {
    mockExecResolve('stopped', '')
    mockExecReject(new Error('docker daemon stopped'))
    const result = await executeContainerCommand('stop')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to remove container')
  })

  it('treats "No such container" as informational on remove (rejection path)', async () => {
    mockExecResolve('stopped', '')
    const err = Object.assign(new Error('boom'), { stderr: 'No such container' })
    mockExecReject(err)
    const result = await executeContainerCommand('stop')
    expect(result.success).toBe(true)
    expect(result.steps[1].info).toBe(true)
  })

  it('returns a failure when remove resolves with stderr', async () => {
    mockExecResolve('stopped', '')
    execMock.mockImplementationOnce((_cmd: string, cb) =>
      (cb as (e: unknown, so: string, se: string) => void)(null, '', 'fatal error'),
    )
    const result = await executeContainerCommand('stop')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to remove container')
  })

  it('updates the stop step with a regular Error rejection (no info flag) and continues to remove', async () => {
    mockExecReject(new Error('docker daemon hiccup'))
    mockExecResolve('removed', '')
    const result = await executeContainerCommand('stop')
    expect(result.success).toBe(true)
    expect(result.steps[0].success).toBe(false)
  })

  it('treats a non-Error remove rejection as a regular remove failure', async () => {
    mockExecResolve('stopped', '')
    execMock.mockImplementationOnce((_cmd: string, cb) =>
      (cb as (e: unknown) => void)('weird-string'),
    )
    const result = await executeContainerCommand('stop')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to remove container')
  })
})

describe('executeContainerCommand — invalid command', () => {
  it('returns a structured "Unknown command" response', async () => {
    const result = await executeContainerCommand('flop' as unknown as 'start')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Unknown command')
    expect(result.steps).toEqual([])
  })
})
