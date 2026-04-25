import { NextResponse } from 'next/server'
import { createClient } from '@sanity/client'

export interface PrerequisiteCheck {
  id: 'projectId' | 'datasetExists' | 'writeToken' | 'postSchema'
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
      id: 'datasetExists',
      label: `Dataset '${dataset}' exists`,
      ok: false,
      detail: 'Cannot verify without project ID and write token',
    })
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
    return json({ checks, allOk: false })
  }

  // 2. Dataset exists in the project
  let datasetOk = false
  try {
    const r = await fetch(`https://api.sanity.io/v${apiVersion}/projects/${projectId}/datasets`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (r.ok) {
      const datasets = (await r.json()) as Array<{ name: string }>
      const names = datasets.map((d) => d.name)
      if (names.includes(dataset)) {
        datasetOk = true
        checks.push({
          id: 'datasetExists',
          label: `Dataset '${dataset}' exists`,
          ok: true,
          detail: `${datasets.length} dataset${datasets.length === 1 ? '' : 's'} on project: ${names.join(', ')}`,
        })
      } else {
        checks.push({
          id: 'datasetExists',
          label: `Dataset '${dataset}' exists`,
          ok: false,
          detail: `Project has ${datasets.length} dataset${datasets.length === 1 ? '' : 's'} (${names.join(', ') || 'none'}), but not '${dataset}'`,
        })
      }
    } else if (r.status === 401 || r.status === 403) {
      checks.push({
        id: 'datasetExists',
        label: `Dataset '${dataset}' exists`,
        ok: false,
        detail: `Token cannot list datasets (HTTP ${r.status}) — verify the token belongs to project ${projectId}`,
      })
    } else if (r.status === 404) {
      checks.push({
        id: 'datasetExists',
        label: `Dataset '${dataset}' exists`,
        ok: false,
        detail: `Project '${projectId}' not found (HTTP 404)`,
      })
    } else {
      checks.push({
        id: 'datasetExists',
        label: `Dataset '${dataset}' exists`,
        ok: false,
        detail: `Datasets endpoint returned HTTP ${r.status}`,
      })
    }
  } catch (error) {
    checks.push({
      id: 'datasetExists',
      label: `Dataset '${dataset}' exists`,
      ok: false,
      detail: `Failed to reach Sanity: ${error instanceof Error ? error.message : String(error)}`,
    })
  }

  const client = createClient({ projectId, dataset, token, apiVersion, useCdn: false })

  // 3. SANITY_API_WRITE_TOKEN with write permissions — dry-run mutation
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

  // 4. 'post' schema in use — content heuristic (Content Lake is schemaless)
  if (writeOk && datasetOk) {
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
      detail: !datasetOk
        ? 'Cannot verify without a valid dataset'
        : 'Cannot verify without a working write token',
    })
  }

  return json({ checks, allOk: checks.every((c) => c.ok) })
}

function json(body: PrerequisitesResponse) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
}
