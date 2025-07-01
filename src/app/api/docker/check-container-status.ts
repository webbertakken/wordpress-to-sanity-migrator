import { exec } from 'child_process'

export interface ContainerStatusError {
  success: false
  error: string
  details: {
    guidance: string
    stdout?: string
    stderr?: string
    code?: number
  }
}

export interface ContainerStatusSuccess {
  success: true
  isRunning: boolean
}

export type ContainerStatusResponse = ContainerStatusError | ContainerStatusSuccess

export async function checkContainerStatus(): Promise<ContainerStatusResponse> {
  return new Promise((resolve) => {
    exec('docker info', (err, stdout, stderr) => {
      if (!err) {
        resolve({ success: true, isRunning: true })
      } else {
        resolve({
          success: false,
          error: 'Docker is not running',
          details: {
            guidance: 'Please start Docker Desktop and try again.',
            stdout,
            stderr,
            code:
              typeof (err as unknown & { code?: number }).code === 'number'
                ? (err as { code?: number }).code
                : undefined,
          },
        })
      }
    })
  })
}
