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

export async function executeContainerCommand(
  command: ContainerCommand,
  onStep?: (step: ContainerCommandStep) => void,
): Promise<ContainerCommandResult> {
  const steps: ContainerCommandStep[] = []

  function extractOutput(
    res: { stdout?: string; stderr?: string; message?: string } | Error,
  ): ExecResult {
    if (res instanceof Error) {
      const errObj = res as Error & { stdout?: string; stderr?: string; message?: string }
      return {
        stdout: typeof errObj.stdout === 'string' ? errObj.stdout : '',
        stderr:
          typeof errObj.stderr === 'string'
            ? errObj.stderr
            : typeof errObj.message === 'string'
              ? errObj.message
              : res.message,
      }
    }
    return {
      stdout: res.stdout ?? '',
      stderr: res.stderr ?? res.message ?? '',
    }
  }

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

  function updateStep(
    index: number,
    res: { stdout?: string; stderr?: string; message?: string; info?: boolean } | Error,
    success: boolean,
  ): void {
    const { stdout, stderr } = extractOutput(res)
    const infoValue = 'info' in res && typeof res.info === 'boolean' ? res.info : undefined
    const stepData = {
      ...steps[index],
      stdout,
      stderr,
      success,
      ...(infoValue !== undefined ? { info: infoValue } : {}),
    }
    steps[index] = stepData
    onStep?.(stepData)
  }

  function pushStep(
    step: string,
    cmd: string,
    res: { stdout?: string; stderr?: string; message?: string; info?: boolean } | Error,
    success: boolean,
  ): void {
    const { stdout, stderr } = extractOutput(res)
    const infoValue = 'info' in res && typeof res.info === 'boolean' ? res.info : undefined
    const stepData = {
      step,
      cmd,
      stdout,
      stderr,
      success,
      ...(infoValue !== undefined ? { info: infoValue } : {}),
    }
    steps.push(stepData)
    onStep?.(stepData)
  }

  function getErrorDetails(
    error: unknown,
  ): { stack?: string; stdout?: string; stderr?: string; code?: string | number } | undefined {
    if (typeof error === 'object' && error !== null) {
      const e = error as Partial<
        Error & { stdout?: string; stderr?: string; code?: string | number }
      >
      return {
        stack: typeof e.stack === 'string' ? e.stack : undefined,
        stdout: typeof e.stdout === 'string' ? e.stdout : undefined,
        stderr: typeof e.stderr === 'string' ? e.stderr : undefined,
        code: typeof e.code === 'string' || typeof e.code === 'number' ? e.code : undefined,
      }
    }
    return undefined
  }

  try {
    if (command === 'start') {
      // 1. Start MariaDB container
      const startCmd = `docker run --name ${CONTAINER_NAME} -e MARIADB_ROOT_PASSWORD=\"${DB_PASSWORD}\" -d -p 3306:3306 mariadb:latest`
      const startIndex = pushInitialStep('Start container', startCmd)

      let res: { stdout: string; stderr: string } | Error
      try {
        res = await execAsync(startCmd)
        const isSuccess = !(res.stderr && res.stderr.trim())
        updateStep(startIndex, res, isSuccess)
        if (!isSuccess) return { success: false, error: 'Failed to start container', steps }
      } catch (err: unknown) {
        updateStep(startIndex, err as Error, false)
        return { success: false, error: 'Failed to start container', steps }
      }
      // 2. Wait for MariaDB to initialize
      const waitIndex = pushInitialStep('Wait for MariaDB to initialize', 'sleep 12s')
      await new Promise((resolve) => setTimeout(resolve, 12000))
      updateStep(waitIndex, { stdout: 'Waited 12s' }, true)
      // 3. Create the target database
      const createDbCmd = `docker exec ${CONTAINER_NAME} mariadb -uroot -p\"${DB_PASSWORD}\" -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME};"`
      const createDbIndex = pushInitialStep('Create database', createDbCmd)

      try {
        res = await execAsync(createDbCmd)
        const isSuccess = !(res.stderr && res.stderr.trim())
        updateStep(createDbIndex, res, isSuccess)
        if (!isSuccess) return { success: false, error: 'Failed to create database', steps }
      } catch (err: unknown) {
        updateStep(createDbIndex, err as Error, false)
        return { success: false, error: 'Failed to create database', steps }
      }
      // 4. Import the dump
      const importCmd = `docker exec -i ${CONTAINER_NAME} mariadb -uroot -p\"${DB_PASSWORD}\" ${DB_NAME} < backup.sql`
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
        const isSuccess = !(importResult.stderr && importResult.stderr.trim())
        updateStep(importIndex, importResult, isSuccess)
        if (!isSuccess) return { success: false, error: 'Failed to import dump', steps }
      } catch (err: unknown) {
        updateStep(importIndex, err as Error, false)
        return { success: false, error: 'Failed to import dump', steps }
      }
      // 5. Inspect databases
      const inspectCmd = `docker exec ${CONTAINER_NAME} mariadb -uroot -p\"${DB_PASSWORD}\" -e "SHOW DATABASES;"`
      const inspectIndex = pushInitialStep('Inspect databases', inspectCmd)

      try {
        res = await execAsync(inspectCmd)
        const isSuccess = !(res.stderr && res.stderr.trim())
        updateStep(inspectIndex, res, isSuccess)
        if (!isSuccess) return { success: false, error: 'Failed to inspect databases', steps }
      } catch (err: unknown) {
        updateStep(inspectIndex, err as Error, false)
        return { success: false, error: 'Failed to inspect databases', steps }
      }

      // Show all tables in the database
      const listTablesCmd = `docker exec ${CONTAINER_NAME} mariadb -uroot -p\"${DB_PASSWORD}\" -e "USE ${DB_NAME}; SHOW TABLES;"`
      const listTablesIndex = pushInitialStep('List tables', listTablesCmd)

      try {
        res = await execAsync(listTablesCmd)
        const isSuccess = !(res.stderr && res.stderr.trim())
        updateStep(listTablesIndex, res, isSuccess)
        if (!isSuccess) return { success: false, error: 'Failed to list tables', steps }
      } catch (err: unknown) {
        updateStep(listTablesIndex, err as Error, false)
        return { success: false, error: 'Failed to list tables', steps }
      }

      // Count posts by type
      const countPostsCmd = `docker exec ${CONTAINER_NAME} mariadb -uroot -p\"${DB_PASSWORD}\" -e "USE ${DB_NAME}; SELECT post_type, COUNT(*) as count FROM wp_posts GROUP BY post_type ORDER BY count DESC;"`
      const countPostsIndex = pushInitialStep('Count posts by type', countPostsCmd)

      try {
        res = await execAsync(countPostsCmd)
        const isSuccess = !(res.stderr && res.stderr.trim())
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
        const isNoSuchContainer = Boolean(res.stderr && res.stderr.includes('No such container'))
        const isSuccess = !(res.stderr && res.stderr.trim()) || isNoSuchContainer
        updateStep(stopIndex, { ...res, info: isNoSuchContainer }, isSuccess)
      } catch (err: unknown) {
        if (err instanceof Error) {
          const dockerError = err as DockerError
          if (dockerError.stderr && dockerError.stderr.includes('No such container')) {
            updateStep(stopIndex, { ...dockerError, info: true }, true)
          } else {
            updateStep(stopIndex, dockerError, false)
          }
        } else {
          updateStep(stopIndex, err as Error, false)
        }
      }

      // 2. Remove container
      const removeCmd = `docker rm ${CONTAINER_NAME}`
      const removeIndex = pushInitialStep('Remove container', removeCmd)

      try {
        res = await execAsync(removeCmd)
        const isNoSuchContainer = Boolean(res.stderr && res.stderr.includes('No such container'))
        const isSuccess = !(res.stderr && res.stderr.trim()) || isNoSuchContainer
        updateStep(removeIndex, { ...res, info: isNoSuchContainer }, isSuccess)
        if (!isSuccess) return { success: false, error: 'Failed to remove container', steps }
      } catch (err: unknown) {
        if (err instanceof Error) {
          const dockerError = err as DockerError
          if (dockerError.stderr && dockerError.stderr.includes('No such container')) {
            updateStep(removeIndex, { ...dockerError, info: true }, true)
          } else {
            updateStep(removeIndex, dockerError, false)
            return { success: false, error: 'Failed to remove container', steps }
          }
        } else {
          updateStep(removeIndex, err as Error, false)
          return { success: false, error: 'Failed to remove container', steps }
        }
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
