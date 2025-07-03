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
        // Analyze the error to provide specific guidance
        let error = 'Docker is not running'
        let guidance = 'Please start Docker Desktop and try again.'

        const errorOutput = stderr?.toLowerCase() || ''
        const errorMessage = err.message?.toLowerCase() || ''

        if (
          errorOutput.includes('permission denied') ||
          errorMessage.includes('permission denied')
        ) {
          error = 'Permission denied accessing Docker'
          guidance =
            'You may need to run this command with elevated permissions or add your user to the docker group.\n' +
            'On Linux: sudo usermod -aG docker $USER (then log out and back in)\n' +
            'On macOS/Windows: Ensure Docker Desktop is running'
        } else if (
          errorOutput.includes('cannot connect to the docker daemon') ||
          errorMessage.includes('docker daemon') ||
          errorOutput.includes('is the docker daemon running')
        ) {
          error = 'Docker Desktop is not running'
          guidance =
            'Docker Desktop is not running. Please start Docker Desktop and try again.\n' +
            'On Windows/macOS: Open Docker Desktop from your applications\n' +
            'On Linux: Start the Docker daemon with: sudo systemctl start docker'
        } else if (
          errorOutput.includes('command not found') ||
          errorMessage.includes('command not found')
        ) {
          error = 'Docker is not installed'
          guidance =
            'Docker does not appear to be installed on your system.\n' +
            'Please install Docker Desktop from https://www.docker.com/products/docker-desktop'
        }

        resolve({
          success: false,
          error,
          details: {
            guidance,
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
