import { exec } from 'child_process'
import { NextResponse } from 'next/server'
import { promisify } from 'util'

const execAsync = promisify(exec)

// Must stay in sync with CONTAINER_NAME in execute-container-command.ts
const CONTAINER_NAME = 'temp-mariadb'

export interface ContainerRunningResponse {
  running: boolean
  containerName: string
  status?: string
  error?: string
}

export async function GET() {
  try {
    const { stdout } = await execAsync(
      `docker ps --filter "name=^/${CONTAINER_NAME}$" --format "{{.Names}}\t{{.Status}}"`,
    )
    const line = stdout.trim()
    if (!line) {
      return json({ running: false, containerName: CONTAINER_NAME })
    }
    const [, status] = line.split('\t')
    return json({ running: true, containerName: CONTAINER_NAME, status })
  } catch (error) {
    // Docker daemon not running, docker not installed, etc.
    return json({
      running: false,
      containerName: CONTAINER_NAME,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function json(body: ContainerRunningResponse) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
}
