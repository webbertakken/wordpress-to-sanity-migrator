import { describe, it, expect, vi, beforeEach } from 'vitest'

const { execMock } = vi.hoisted(() => {
  const fn = vi.fn()
  ;(fn as unknown as Record<symbol, unknown>)[Symbol.for('nodejs.util.promisify.custom')] = (
    cmd: string,
  ) =>
    new Promise((resolve, reject) => {
      fn(cmd, (err: unknown, stdout: string, stderr: string) => {
        if (err) reject(err)
        else resolve({ stdout, stderr })
      })
    })
  return { execMock: fn }
})

vi.mock('child_process', () => ({
  exec: execMock,
  spawn: vi.fn(),
  default: { exec: execMock, spawn: vi.fn() },
}))

import { GET } from '../route'

beforeEach(() => {
  execMock.mockReset()
})

function mockExecResolve(stdout = '', stderr = ''): void {
  execMock.mockImplementationOnce(
    (_cmd: string, cb: (e: unknown, so: string, se: string) => void) => {
      cb(null, stdout, stderr)
      return undefined
    },
  )
}

describe('GET /api/docker/container-running', () => {
  it('reports running=false when docker ps returns no matching container', async () => {
    mockExecResolve('', '')
    const response = await GET()
    const body = await response.json()
    expect(body).toEqual({ running: false, containerName: 'temp-mariadb' })
  })

  it('reports running=true with status when docker ps returns a row', async () => {
    mockExecResolve('temp-mariadb\tUp 2 minutes', '')
    const response = await GET()
    const body = await response.json()
    expect(body).toEqual({
      running: true,
      containerName: 'temp-mariadb',
      status: 'Up 2 minutes',
    })
  })

  it('reports running=false with the error message when docker ps fails', async () => {
    execMock.mockImplementationOnce((_cmd: string, cb: (e: unknown) => void) => {
      cb(new Error('docker daemon not reachable'))
      return undefined
    })
    const response = await GET()
    const body = await response.json()
    expect(body.running).toBe(false)
    expect(body.error).toMatch(/docker daemon not reachable/)
  })

  it('falls back to String(error) for non-Error rejections', async () => {
    execMock.mockImplementationOnce((_cmd: string, cb: (e: unknown) => void) => {
      cb('weird')
      return undefined
    })
    const response = await GET()
    const body = await response.json()
    expect(body.error).toBe('weird')
  })

  it('attaches Cache-Control: no-store on the response', async () => {
    mockExecResolve('', '')
    const response = await GET()
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})
