import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@sanity/client'
import fs from 'fs/promises'
import path from 'path'
import { MigrationRecord } from '@/types/migration'

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || '',
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  token: process.env.SANITY_API_WRITE_TOKEN || '',
  apiVersion: '2024-01-01',
  useCdn: false,
})

interface ImportProgress {
  type: 'progress' | 'success' | 'error' | 'info'
  message: string
  step?: string
  current?: number
  total?: number
  details?: unknown
}

async function uploadMedia(
  mediaPath: string,
  mediaType: 'image' | 'audio' | 'video',
): Promise<string | null> {
  try {
    const absolutePath = path.resolve(mediaPath)
    const fileBuffer = await fs.readFile(absolutePath)
    const fileName = path.basename(absolutePath)

    // Sanity only accepts 'image' or 'file' as asset types
    // Audio and video files should be uploaded as 'file'
    const sanityAssetType = mediaType === 'image' ? 'image' : 'file'

    const asset = await client.assets.upload(sanityAssetType, fileBuffer, {
      filename: fileName,
    })

    return asset._id
  } catch (error) {
    console.error(`Failed to upload media: ${mediaPath}`, error)
    return null
  }
}

function createSanityDocument(record: MigrationRecord, mediaAssets: Map<string, string>) {
  const { original, transformed } = record
  const media = record.media || record.transformed?.media

  // Process media references and replace URLs with Sanity asset references
  let processedBody = transformed.body

  media?.forEach((mediaRef) => {
    const assetId = mediaAssets.get(mediaRef.localPath)
    if (assetId && mediaRef.found) {
      // Replace local path with Sanity asset reference in the body
      const sanityImageRef = `<img src="https://cdn.sanity.io/images/${process.env.NEXT_PUBLIC_SANITY_PROJECT_ID}/${process.env.NEXT_PUBLIC_SANITY_DATASET}/${assetId}" />`
      processedBody = processedBody.replace(
        new RegExp(mediaRef.localPath.replace(/\\/g, '\\\\'), 'g'),
        sanityImageRef,
      )
    }
  })

  return {
    _type: 'post',
    title: transformed.title,
    slug: {
      _type: 'slug',
      current: transformed.slug,
    },
    publishedAt: transformed.publishedAt,
    body: processedBody,
    excerpt: transformed.excerpt || '',
    originalWordPressId: original.ID,
    postType: original.post_type,
    media:
      media
        ?.filter((m) => m.found)
        .map((mediaRef) => {
          const assetId = mediaAssets.get(mediaRef.localPath)
          return assetId
            ? {
                _type: mediaRef.type === 'image' ? 'image' : 'file',
                asset: {
                  _type: 'reference',
                  _ref: assetId,
                },
                originalUrl: mediaRef.url,
              }
            : null
        })
        .filter(Boolean) || [],
  }
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: ImportProgress) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const body = await request.json()
        const { testRun = false, selectedRecordId = null } = body

        send({ type: 'info', message: 'Starting Sanity import process...' })

        // Validate Sanity configuration
        if (!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || !process.env.SANITY_API_WRITE_TOKEN) {
          throw new Error(
            'Missing Sanity configuration. Please set NEXT_PUBLIC_SANITY_PROJECT_ID and SANITY_API_WRITE_TOKEN environment variables.',
          )
        }

        // Test Sanity connection
        send({ type: 'info', message: 'Testing Sanity connection...' })
        try {
          await client.fetch('*[_type == "post"][0]')
          send({ type: 'success', message: 'Connected to Sanity successfully' })
        } catch (error) {
          throw new Error(
            `Failed to connect to Sanity: ${error instanceof Error ? error.message : 'Unknown error'}`,
          )
        }

        // Load migration data
        send({ type: 'info', message: 'Loading migration data...' })
        const migrationDataPath = path.join(process.cwd(), 'input', 'sanity-migration.json')
        const migrationData = JSON.parse(
          await fs.readFile(migrationDataPath, 'utf-8'),
        ) as MigrationRecord[]

        let recordsToImport = migrationData

        if (selectedRecordId) {
          // Find specific record (works for both test and production)
          const selectedRecord = migrationData.find(
            (record) => record.original.ID === parseInt(selectedRecordId),
          )
          if (!selectedRecord) {
            throw new Error(`Record with ID ${selectedRecordId} not found`)
          }
          recordsToImport = [selectedRecord]
          send({
            type: 'info',
            message: `${testRun ? 'Test run: importing' : 'Importing'} single record "${selectedRecord.transformed.title}"`,
          })
        } else if (testRun) {
          // Find a record with both image and audio media for test
          const recordWithMixedMedia = migrationData.find((record) => {
            const media = record.media || []
            const hasImage = media.some((m) => m.type === 'image' && m.found)
            const hasAudio = media.some((m) => m.type === 'audio' && m.found)
            return hasImage && hasAudio
          })

          if (recordWithMixedMedia) {
            recordsToImport = [recordWithMixedMedia]
            send({
              type: 'info',
              message: `Test run: importing record with mixed media "${recordWithMixedMedia.transformed.title}"`,
            })
          } else {
            // Fallback to first record with any media
            const recordWithMedia = migrationData.find((record) => {
              const media = record.media || []
              return media.some((m) => m.found)
            })

            if (recordWithMedia) {
              recordsToImport = [recordWithMedia]
              send({
                type: 'info',
                message: `Test run: importing record with media "${recordWithMedia.transformed.title}"`,
              })
            } else {
              recordsToImport = [migrationData[0]]
              send({
                type: 'info',
                message: `Test run: importing first record "${migrationData[0].transformed.title}"`,
              })
            }
          }
        }

        send({
          type: 'info',
          message: `Processing ${recordsToImport.length} record${recordsToImport.length === 1 ? '' : 's'}`,
        })

        const mediaAssets = new Map<string, string>()
        let processedRecords = 0

        for (const record of recordsToImport) {
          processedRecords++
          send({
            type: 'progress',
            message: `Processing record: ${record.transformed.title}`,
            step: 'processing',
            current: processedRecords,
            total: recordsToImport.length,
          })

          // Process media files (upload in production, simulate in test)
          const media = record.media || record.transformed?.media
          if (media && media.length > 0) {
            send({
              type: 'info',
              message: `${testRun ? 'Simulating upload of' : 'Uploading'} ${media.length} media files...`,
            })

            for (const mediaRef of media) {
              if (mediaRef.found && !mediaAssets.has(mediaRef.localPath)) {
                send({
                  type: 'info',
                  message: `${testRun ? 'Would upload' : 'Uploading'} ${mediaRef.type}: ${path.basename(mediaRef.localPath)}`,
                })

                if (testRun) {
                  // In test mode, simulate upload without actually uploading
                  const mockAssetId = `mock-asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                  mediaAssets.set(mediaRef.localPath, mockAssetId)
                  send({
                    type: 'success',
                    message: `Test: Would upload ${path.basename(mediaRef.localPath)} → ${mockAssetId}`,
                  })
                } else {
                  // Production mode: actually upload
                  const assetId = await uploadMedia(
                    mediaRef.localPath,
                    mediaRef.type as 'image' | 'audio' | 'video',
                  )
                  if (assetId) {
                    mediaAssets.set(mediaRef.localPath, assetId)
                    send({
                      type: 'success',
                      message: `Uploaded: ${path.basename(mediaRef.localPath)} → ${assetId}`,
                    })
                  } else {
                    send({
                      type: 'error',
                      message: `Failed to upload: ${path.basename(mediaRef.localPath)}`,
                    })
                  }
                }
              } else if (!mediaRef.found) {
                send({
                  type: 'error',
                  message: `Missing file: ${path.basename(mediaRef.localPath)}`,
                })
              }
            }
          }

          // Create Sanity document
          send({ type: 'info', message: 'Creating Sanity document...' })
          const sanityDoc = createSanityDocument(record, mediaAssets)

          if (testRun) {
            // In test run, just show what would be created
            send({
              type: 'info',
              message: 'Test run - Document preview:',
              details: {
                title: sanityDoc.title,
                slug: sanityDoc.slug.current,
                mediaCount: sanityDoc.media.length,
                bodyLength: sanityDoc.body.length,
                hasMedia: sanityDoc.media.length > 0,
                mediaTypes: [...new Set(record.media?.map((m) => m.type) || [])],
              },
            })
          } else {
            // Actually create the document
            const result = await client.create(sanityDoc)
            send({
              type: 'success',
              message: `Created document: ${result.title}`,
              details: { documentId: result._id },
            })
          }
        }

        if (testRun) {
          send({
            type: 'success',
            message: `Test run completed successfully! Processed ${recordsToImport.length} record${recordsToImport.length === 1 ? '' : 's'}.`,
            details: {
              recordsProcessed: recordsToImport.length,
              mediaUploaded: mediaAssets.size,
              testMode: true,
            },
          })
        } else {
          send({
            type: 'success',
            message: `Import completed successfully! Created ${recordsToImport.length} document${recordsToImport.length === 1 ? '' : 's'} in Sanity.`,
            details: {
              documentsCreated: recordsToImport.length,
              mediaUploaded: mediaAssets.size,
            },
          })
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        send({
          type: 'error',
          message: `Import failed: ${errorMessage}`,
          details: { error: errorMessage },
        })
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
