import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { spawn } from 'child_process'
import fs from 'fs'

const execAsync = promisify(exec)

export type ContainerCommand = 'start' | 'stop'

export interface ContainerCommandStep {
  step: string
  cmd: string
  stdout: string
  stderr: string
  success: boolean
  info?: boolean
}

export interface ContainerCommandResult {
  success: boolean
  message?: string
  error?: string
  details?: unknown
  steps: ContainerCommandStep[]
}

interface DockerError extends Error {
  stderr?: string
  stdout?: string
  info?: boolean
}

interface ExecResult {
  stdout: string
  stderr: string
}

const DB_PASSWORD = 'P@ssw0rd!'
const CONTAINER_NAME = 'temp-mariadb'
const DB_NAME = 'wordpress'
const BACKUP_FILE = path.resolve(process.cwd(), 'input/database/backup.sql')

/**
 * Step input shape. Mirrors the shape execAsync resolves with on success and
 * the shape Errors thrown by execAsync expose (stdout/stderr from child_process).
 * `info` is set by the caller when a step needs to be flagged as informational.
 */
type StepInput = { stdout?: string; stderr?: string; message?: string; info?: boolean }

/** Pull stdout/stderr from a step input, falling back to message for thrown Errors. */
function extractOutput(res: StepInput | Error): ExecResult {
  const r = res as StepInput
  return {
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? r.message ?? '',
  }
}

interface ErrorDetails {
  stack?: string
  stdout?: string
  stderr?: string
  code?: string | number
}

/**
 * Pluck the diagnostic fields off an unknown error value. Errors thrown by
 * `child_process.exec` carry stdout/stderr/code in addition to stack.
 * `Object(error)` boxes primitives and turns null/undefined into `{}`, so
 * property access is always safe.
 */
function getErrorDetails(error: unknown): ErrorDetails {
  const e = Object(error) as Partial<ErrorDetails>
  return { stack: e.stack, stdout: e.stdout, stderr: e.stderr, code: e.code }
}

export async function executeContainerCommand(
  command: ContainerCommand,
  onStep?: (step: ContainerCommandStep) => void,
): Promise<ContainerCommandResult> {
  const steps: ContainerCommandStep[] = []

  function pushInitialStep(step: string, cmd: string): number {
    const stepData = {
      step,
      cmd,
      stdout: '',
      stderr: '',
      success: false,
    }
    steps.push(stepData)
    onStep?.(stepData)
    return steps.length - 1
  }

  function buildStep(
    base: { step: string; cmd: string },
    res: StepInput | Error,
    success: boolean,
  ): ContainerCommandStep {
    const { stdout, stderr } = extractOutput(res)
    const info = (res as StepInput).info
    return {
      ...base,
      stdout,
      stderr,
      success,
      ...(typeof info === 'boolean' ? { info } : {}),
    }
  }

  function updateStep(index: number, res: StepInput | Error, success: boolean): void {
    const stepData = buildStep(steps[index], res, success)
    steps[index] = stepData
    onStep?.(stepData)
  }

  function pushStep(step: string, cmd: string, res: StepInput | Error, success: boolean): void {
    const stepData = buildStep({ step, cmd }, res, success)
    steps.push(stepData)
    onStep?.(stepData)
  }

  try {
    if (command === 'start') {
      // 1. Start MariaDB container
      const startCmd = `docker run --name ${CONTAINER_NAME} -e MARIADB_ROOT_PASSWORD="${DB_PASSWORD}" -d -p 3306:3306 mariadb:latest`
      const startIndex = pushInitialStep('Start container', startCmd)

      let res: { stdout: string; stderr: string } | Error
      try {
        res = await execAsync(startCmd)
        const isSuccess = res.stderr.trim() === ''
        updateStep(startIndex, res, isSuccess)
        if (!isSuccess) return { success: false, error: 'Failed to start container', steps }
      } catch (err: unknown) {
        updateStep(startIndex, err as Error, false)

        // Provide specific error messages based on the error
        let errorMessage = 'Failed to start container'
        const errorDetails: ErrorDetails & { guidance?: string } = getErrorDetails(err)
        const errMsg = (err as Error).message.toLowerCase()
        const stderr = ((err as DockerError).stderr ?? '').toLowerCase()

        if (
          stderr.includes('bind: address already in use') ||
          errMsg.includes('port is already allocated')
        ) {
          errorMessage = 'Port 3306 is already in use'
          errorDetails.guidance =
            'Another application or container is already using port 3306.\n' +
            'Please stop any existing MySQL/MariaDB services or containers.\n' +
            "You can check what's using the port with: lsof -i :3306 (on Mac/Linux) or netstat -ano | findstr :3306 (on Windows)"
        } else if (stderr.includes('conflict') && stderr.includes('name')) {
          errorMessage = 'Container with this name already exists'
          errorDetails.guidance =
            `A container named "${CONTAINER_NAME}" already exists.\n` +
            'Try stopping the migration first, or remove the existing container with:\n' +
            `docker rm -f ${CONTAINER_NAME}`
        }

        return { success: false, error: errorMessage, details: errorDetails, steps }
      }
      // 2. Wait for MariaDB to initialize
      const waitIndex = pushInitialStep('Wait for MariaDB to initialize', 'sleep 12s')
      await new Promise((resolve) => setTimeout(resolve, 12000))
      updateStep(waitIndex, { stdout: 'Waited 12s' }, true)
      // 3. Create the target database
      const createDbCmd = `docker exec ${CONTAINER_NAME} mariadb -uroot -p"${DB_PASSWORD}" -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME};"`
      const createDbIndex = pushInitialStep('Create database', createDbCmd)

      try {
        res = await execAsync(createDbCmd)
        const isSuccess = res.stderr.trim() === ''
        updateStep(createDbIndex, res, isSuccess)
        if (!isSuccess) return { success: false, error: 'Failed to create database', steps }
      } catch (err: unknown) {
        updateStep(createDbIndex, err as Error, false)
        return { success: false, error: 'Failed to create database', steps }
      }
      // 4. Import the dump
      const importCmd = `docker exec -i ${CONTAINER_NAME} mariadb -uroot -p"${DB_PASSWORD}" ${DB_NAME} < backup.sql`
      const importIndex = pushInitialStep('Import dump', importCmd)

      try {
        const importResult = await new Promise<{ stdout: string; stderr: string }>(
          (resolve, reject) => {
            const stream = fs.createReadStream(BACKUP_FILE)
            const child = spawn('docker', [
              'exec',
              '-i',
              CONTAINER_NAME,
              'mariadb',
              '-uroot',
              `-p${DB_PASSWORD}`,
              DB_NAME,
            ])
            let stdout = '',
              stderr = ''
            child.stdout.on('data', (data) => {
              stdout += data.toString()
            })
            child.stderr.on('data', (data) => {
              stderr += data.toString()
            })
            child.on('close', (code) => {
              if (code === 0) resolve({ stdout, stderr })
              else reject(new Error(stderr || `Exited with code ${code}`))
            })
            child.on('error', reject)
            stream.pipe(child.stdin)
          },
        )
        const isSuccess = importResult.stderr.trim() === ''
        updateStep(importIndex, importResult, isSuccess)
        if (!isSuccess) return { success: false, error: 'Failed to import dump', steps }
      } catch (err: unknown) {
        updateStep(importIndex, err as Error, false)
        return { success: false, error: 'Failed to import dump', steps }
      }
      // 5. Inspect databases
      const inspectCmd = `docker exec ${CONTAINER_NAME} mariadb -uroot -p"${DB_PASSWORD}" -e "SHOW DATABASES;"`
      const inspectIndex = pushInitialStep('Inspect databases', inspectCmd)

      try {
        res = await execAsync(inspectCmd)
        const isSuccess = res.stderr.trim() === ''
        updateStep(inspectIndex, res, isSuccess)
        if (!isSuccess) return { success: false, error: 'Failed to inspect databases', steps }
      } catch (err: unknown) {
        updateStep(inspectIndex, err as Error, false)
        return { success: false, error: 'Failed to inspect databases', steps }
      }

      // Show all tables in the database
      const listTablesCmd = `docker exec ${CONTAINER_NAME} mariadb -uroot -p"${DB_PASSWORD}" -e "USE ${DB_NAME}; SHOW TABLES;"`
      const listTablesIndex = pushInitialStep('List tables', listTablesCmd)

      try {
        res = await execAsync(listTablesCmd)
        const isSuccess = res.stderr.trim() === ''
        updateStep(listTablesIndex, res, isSuccess)
        if (!isSuccess) return { success: false, error: 'Failed to list tables', steps }
      } catch (err: unknown) {
        updateStep(listTablesIndex, err as Error, false)
        return { success: false, error: 'Failed to list tables', steps }
      }

      // Count posts by type
      const countPostsCmd = `docker exec ${CONTAINER_NAME} mariadb -uroot -p"${DB_PASSWORD}" -e "USE ${DB_NAME}; SELECT post_type, COUNT(*) as count FROM wp_posts GROUP BY post_type ORDER BY count DESC;"`
      const countPostsIndex = pushInitialStep('Count posts by type', countPostsCmd)

      try {
        res = await execAsync(countPostsCmd)
        const isSuccess = res.stderr.trim() === ''
        updateStep(countPostsIndex, res, isSuccess)
        if (!isSuccess) return { success: false, error: 'Failed to count posts', steps }
      } catch (err: unknown) {
        updateStep(countPostsIndex, err as Error, false)
        return { success: false, error: 'Failed to count posts', steps }
      }

      return {
        success: true,
        message: 'MariaDB container started and database imported.',
        steps,
      }
    } else if (command === 'stop') {
      // 1. Stop container
      const stopCmd = `docker stop ${CONTAINER_NAME}`
      const stopIndex = pushInitialStep('Stop container', stopCmd)

      let res: ExecResult | Error
      try {
        res = await execAsync(stopCmd)
        const isNoSuchContainer = res.stderr.includes('No such container')
        const isSuccess = res.stderr.trim() === '' || isNoSuchContainer
        updateStep(stopIndex, { ...res, info: isNoSuchContainer }, isSuccess)
      } catch (err: unknown) {
        const stderr = (err as DockerError).stderr ?? ''
        const isNoSuchContainer = stderr.includes('No such container')
        updateStep(
          stopIndex,
          { ...(err as DockerError), info: isNoSuchContainer },
          isNoSuchContainer,
        )
      }

      // 2. Remove container
      const removeCmd = `docker rm ${CONTAINER_NAME}`
      const removeIndex = pushInitialStep('Remove container', removeCmd)

      try {
        res = await execAsync(removeCmd)
        const isNoSuchContainer = res.stderr.includes('No such container')
        const isSuccess = res.stderr.trim() === '' || isNoSuchContainer
        updateStep(removeIndex, { ...res, info: isNoSuchContainer }, isSuccess)
        if (!isSuccess) return { success: false, error: 'Failed to remove container', steps }
      } catch (err: unknown) {
        const stderr = (err as DockerError).stderr ?? ''
        const isNoSuchContainer = stderr.includes('No such container')
        updateStep(
          removeIndex,
          { ...(err as DockerError), info: isNoSuchContainer },
          isNoSuchContainer,
        )
        if (!isNoSuchContainer)
          return { success: false, error: 'Failed to remove container', steps }
      }

      return {
        success: true,
        message: steps.some((step) => step.info)
          ? `Container '${CONTAINER_NAME}' was already not running.`
          : `MariaDB container '${CONTAINER_NAME}' torn down.`,
        steps,
      }
    } else {
      return {
        success: false,
        error: 'Unknown command',
        steps,
      }
    }
  } catch (error: unknown) {
    pushStep('Unexpected error', '', error as Error, false)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      details: getErrorDetails(error),
      steps,
    }
  }
}
