export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly details: {
      guidance?: string
      stack?: string
      cwd?: string
    } = {},
  ) {
    super(message)
    this.name = 'MigrationError'
  }
}

export class DatabaseConnectionError extends MigrationError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, {
      ...details,
      guidance: getDatabaseErrorGuidance(message),
    })
    this.name = 'DatabaseConnectionError'
  }
}

export class MigrationFileError extends MigrationError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, details)
    this.name = 'MigrationFileError'
  }
}

function getDatabaseErrorGuidance(errorMessage: string): string {
  if (errorMessage.includes('ECONNREFUSED')) {
    return `Database connection refused. Please check that:\n1. MySQL server is running on localhost:3306\n2. You can connect using these credentials:\n   - Host: localhost\n   - Port: 3306\n   - User: root\n   - Password: P@ssw0rd!\n   - Database: wordpress`
  }
  if (errorMessage.includes('ER_ACCESS_DENIED_ERROR')) {
    return `Database access denied. Please verify these credentials:\n1. User: root\n2. Password: P@ssw0rd!\n3. Database: wordpress`
  }
  if (errorMessage.includes('ER_BAD_DB_ERROR')) {
    return `Database 'wordpress' does not exist. Please:\n1. Create a database named 'wordpress'\n2. Import your WordPress database if you haven't already`
  }
  if (errorMessage.includes('ETIMEDOUT')) {
    return `Database connection timed out. Please check:\n1. MySQL server is running\n2. No firewall is blocking port 3306\n3. MySQL server is accepting connections from localhost`
  }
  return 'An unexpected database error occurred'
}

export function handleMigrationError(error: unknown): MigrationError {
  if (error instanceof MigrationError) {
    return error
  }

  const message = extractErrorMessage(error)

  if (isDatabaseError(message)) {
    return new DatabaseConnectionError(message, {
      stack: error instanceof Error ? error.stack : undefined,
      cwd: process.cwd(),
    })
  }

  return new MigrationError(message, {
    stack: error instanceof Error ? error.stack : undefined,
    cwd: process.cwd(),
  })
}

function isDatabaseError(message: string): boolean {
  return (
    message.includes('ECONNREFUSED') ||
    message.includes('ER_ACCESS_DENIED_ERROR') ||
    message.includes('ER_BAD_DB_ERROR') ||
    message.includes('ETIMEDOUT')
  )
}

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    if (
      'message' in error &&
      typeof (error as { message: unknown }).message === 'string' &&
      (error as { message: string }).message
    ) {
      return (error as { message: string }).message
    }
    if (
      'sqlMessage' in error &&
      typeof (error as { sqlMessage: unknown }).sqlMessage === 'string'
    ) {
      return (error as { sqlMessage: string }).sqlMessage
    }
    if ('code' in error && typeof (error as { code: unknown }).code === 'string') {
      return (error as { code: string }).code
    }
    if (
      'toString' in error &&
      typeof (error as { toString: () => string }).toString === 'function'
    ) {
      return (error as { toString: () => string }).toString()
    }
  }
  if (typeof error === 'string') return error
  return 'Unknown error'
}
