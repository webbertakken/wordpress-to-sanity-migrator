import { describe, it, expect, vi, beforeEach } from 'vitest'

const { execMock } = vi.hoisted(() => ({ execMock: vi.fn() }))

vi.mock('child_process', () => ({
  exec: execMock,
  spawn: vi.fn(),
  default: { exec: execMock, spawn: vi.fn() },
}))

import { checkContainerStatus } from '../check-container-status'

beforeEach(() => {
  execMock.mockReset()
})

function callExecCallback(err: Error | null, stdout = '', stderr = ''): void {
  expect(execMock).toHaveBeenCalled()
  const callback = execMock.mock.calls[0][1] as (e: Error | null, so: string, se: string) => void
  callback(err, stdout, stderr)
}

describe('checkContainerStatus', () => {
  it('reports running=true when docker info succeeds', async () => {
    const promise = checkContainerStatus()
    callExecCallback(null, 'info', '')
    await expect(promise).resolves.toEqual({ success: true, isRunning: true })
  })

  it('reports a permission-denied error with admin guidance', async () => {
    const promise = checkContainerStatus()
    callExecCallback(new Error('permission denied'), '', 'permission denied')
    const result = await promise
    expect(result.success).toBe(false)
    if (result.success === true) throw new Error('expected failure')
    expect(result.error).toMatch(/Permission denied/i)
    expect(result.details.guidance).toMatch(/docker group/i)
  })

  it('reports daemon-not-running when stderr complains about the daemon', async () => {
    const promise = checkContainerStatus()
    callExecCallback(
      new Error('error'),
      '',
      'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?',
    )
    const result = await promise
    expect(result.success).toBe(false)
    if (result.success === true) throw new Error('expected failure')
    expect(result.error).toMatch(/Docker Desktop is not running/i)
  })

  it('reports docker-not-installed when stderr says command not found', async () => {
    const promise = checkContainerStatus()
    callExecCallback(new Error('command not found'), '', 'command not found')
    const result = await promise
    if (result.success === true) throw new Error('expected failure')
    expect(result.error).toMatch(/Docker is not installed/i)
  })

  it('reports the generic Docker-not-running message for unrecognised failures', async () => {
    const promise = checkContainerStatus()
    callExecCallback(new Error('something else'), '', '')
    const result = await promise
    if (result.success === true) throw new Error('expected failure')
    expect(result.error).toBe('Docker is not running')
    expect(result.details.guidance).toMatch(/Docker Desktop/)
  })

  it('passes the numeric exit code through when the error carries one', async () => {
    const promise = checkContainerStatus()
    const err = Object.assign(new Error('error'), { code: 137 })
    callExecCallback(err, '', '')
    const result = await promise
    if (result.success === true) throw new Error('expected failure')
    expect(result.details.code).toBe(137)
  })

  it('omits the exit code when the error carries a non-numeric code', async () => {
    const promise = checkContainerStatus()
    const err = Object.assign(new Error('error'), { code: 'STRING-CODE' })
    callExecCallback(err, '', '')
    const result = await promise
    if (result.success === true) throw new Error('expected failure')
    expect(result.details.code).toBeUndefined()
  })

  it('falls back to the error message when stderr is empty', async () => {
    const promise = checkContainerStatus()
    callExecCallback(new Error('PERMISSION DENIED'), '', '')
    const result = await promise
    if (result.success === true) throw new Error('expected failure')
    expect(result.error).toMatch(/Permission denied/)
  })

  it('handles undefined stderr/stdout from the callback', async () => {
    const promise = checkContainerStatus()
    expect(execMock).toHaveBeenCalled()
    const callback = execMock.mock.calls[0][1] as (
      e: Error | null,
      so?: string,
      se?: string,
    ) => void
    callback(new Error('boom'))
    const result = await promise
    if (result.success === true) throw new Error('expected failure')
    expect(result.error).toBe('Docker is not running')
  })

  it('handles an error whose message is undefined', async () => {
    const promise = checkContainerStatus()
    const err = new Error()
    Object.defineProperty(err, 'message', { value: undefined })
    callExecCallback(err, '', '')
    const result = await promise
    if (result.success === true) throw new Error('expected failure')
    expect(result.error).toBe('Docker is not running')
  })
})
