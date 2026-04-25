import { NextResponse } from 'next/server'
import { createClient } from '@sanity/client'

export interface PrerequisiteCheck {
  id: 'projectId' | 'writeToken' | 'postSchema'
  label: string
  ok: boolean
  detail?: string
}

export interface PrerequisitesResponse {
  checks: PrerequisiteCheck[]
  allOk: boolean
}

export async function GET() {
  const checks: PrerequisiteCheck[] = []

  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production'
  const token = process.env.SANITY_API_WRITE_TOKEN
  const apiVersion = process.env.SANITY_API_VERSION || '2024-01-01'

  // 1. NEXT_PUBLIC_SANITY_PROJECT_ID is set
  checks.push({
    id: 'projectId',
    label: 'NEXT_PUBLIC_SANITY_PROJECT_ID is set',
    ok: Boolean(projectId),
    detail: projectId
      ? `Project: ${projectId} · Dataset: ${dataset}`
      : 'Environment variable is empty',
  })

  if (!projectId || !token) {
    checks.push({
      id: 'writeToken',
      label: 'SANITY_API_WRITE_TOKEN with write permissions',
      ok: false,
      detail: !token ? 'Environment variable is empty' : 'Cannot verify without project ID',
    })
    checks.push({
      id: 'postSchema',
      label: "Sanity project has a 'post' schema",
      ok: false,
      detail: 'Cannot verify without project ID and write token',
    })
    return NextResponse.json({ checks, allOk: false } satisfies PrerequisitesResponse, {
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const client = createClient({ projectId, dataset, token, apiVersion, useCdn: false })

  // 2. SANITY_API_WRITE_TOKEN with write permissions
  // Verified by performing a dry-run mutation. Sanity returns auth errors before
  // executing the (no-op) mutation, so this is a safe way to verify write access
  // without touching the dataset.
  let writeOk = false
  let writeDetail = ''
  try {
    await client
      .transaction()
      .createOrReplace({
        _id: 'drafts._prereq-check',
        _type: 'post',
        title: 'Prerequisite check (dry run)',
      })
      .commit({ dryRun: true, returnDocuments: false })
    writeOk = true
    writeDetail = 'Token accepted by Sanity (dry-run mutation succeeded)'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    writeOk = false
    writeDetail = `Token rejected: ${message}`
  }
  checks.push({
    id: 'writeToken',
    label: 'SANITY_API_WRITE_TOKEN with write permissions',
    ok: writeOk,
    detail: writeDetail,
  })

  // 3. Sanity project has a 'post' schema
  // The Content Lake API is schemaless, so we can't ask "does the schema have a
  // post type?" directly without studio-level auth. Instead we look at what's
  // already in the dataset:
  //   - 'post' documents exist  → schema in use, ✅
  //   - dataset is empty        → can't verify, give benefit of the doubt, ✅
  //   - other types but no post → likely missing post type, ❌
  if (writeOk) {
    try {
      const [postCount, otherCount] = (await client.fetch(
        '[count(*[_type == "post"]), count(*[!(_type match "sanity.*") && _type != "post"])]',
      )) as [number, number]

      if (postCount > 0) {
        checks.push({
          id: 'postSchema',
          label: "Sanity project has a 'post' schema",
          ok: true,
          detail: `${postCount} existing 'post' document${postCount === 1 ? '' : 's'} in dataset`,
        })
      } else if (otherCount === 0) {
        checks.push({
          id: 'postSchema',
          label: "Sanity project has a 'post' schema",
          ok: true,
          detail: 'Dataset is empty — schema will be verified on first import',
        })
      } else {
        checks.push({
          id: 'postSchema',
          label: "Sanity project has a 'post' schema",
          ok: false,
          detail: `No 'post' documents found (dataset has ${otherCount} other document${otherCount === 1 ? '' : 's'}). Make sure the studio defines a 'post' type and is deployed.`,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      checks.push({
        id: 'postSchema',
        label: "Sanity project has a 'post' schema",
        ok: false,
        detail: `Schema probe failed: ${message}`,
      })
    }
  } else {
    checks.push({
      id: 'postSchema',
      label: "Sanity project has a 'post' schema",
      ok: false,
      detail: 'Cannot verify without a working write token',
    })
  }

  return NextResponse.json(
    { checks, allOk: checks.every((c) => c.ok) } satisfies PrerequisitesResponse,
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
