import { NextResponse } from 'next/server'
import { getMigrationData } from './migration-service'

export async function GET() {
  const result = await getMigrationData()
  return NextResponse.json(result, { status: result.success ? 200 : 500 })
}
