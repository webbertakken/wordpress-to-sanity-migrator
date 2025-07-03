import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@sanity/client'
import fs from 'fs/promises'
import path from 'path'
import { MigrationRecord, getContentTitle, MigrationBlockContent } from '@/types/migration'
import type { Post, Page, BlockContent } from '@/../input/sanity.types'

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
  maxRetries: number = 3,
): Promise<string | null> {
  const absolutePath = path.resolve(mediaPath)
  const fileName = path.basename(absolutePath)

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const fileBuffer = await fs.readFile(absolutePath)

      // Sanity only accepts 'image' or 'file' as asset types
      // Audio and video files should be uploaded as 'file'
      const sanityAssetType = mediaType === 'image' ? 'image' : 'file'

      const asset = await client.assets.upload(sanityAssetType, fileBuffer, {
        filename: fileName,
      })

      return asset._id
    } catch (error) {
      const isLastAttempt = attempt === maxRetries
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      console.error(
        `Failed to upload media (attempt ${attempt}/${maxRetries}): ${mediaPath}`,
        errorMessage,
      )

      // Don't retry on certain errors
      if (
        errorMessage.includes('File too large') ||
        errorMessage.includes('Invalid file type') ||
        errorMessage.includes('ENOENT')
      ) {
        return null
      }

      if (!isLastAttempt) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  return null
}

// Document types that match the actual Sanity schema
type SanityDocumentPost = Omit<Post, '_id' | '_createdAt' | '_updatedAt' | '_rev'>
type SanityDocumentPage = Omit<Page, '_id' | '_createdAt' | '_updatedAt' | '_rev' | 'pageBuilder'>
type SanityDocument = SanityDocumentPost | SanityDocumentPage

function createSanityDocument(
  record: MigrationRecord,
  mediaAssets: Map<string, string>,
): SanityDocument {
  const { transformed } = record
  const media = transformed.media

  if (transformed._type === 'post') {
    // Process the content to replace media URLs with Sanity asset references
    const processedContent = transformed.content
      ? processMediaInContent(transformed.content, media, mediaAssets)
      : undefined

    // Find the first image in content to use as cover image if needed
    const firstImageAssetId = findFirstImageAssetId(media, mediaAssets)

    const postDoc: SanityDocumentPost = {
      _type: 'post',
      title: transformed.title,
      slug: transformed.slug,
      content: processedContent,
      excerpt: transformed.excerpt,
      coverImage: {
        _type: 'image',
        asset: firstImageAssetId
          ? {
              _type: 'reference',
              _ref: firstImageAssetId,
            }
          : undefined,
        alt: transformed.coverImage?.alt,
      },
      date: transformed.date,
    }
    return postDoc
  } else {
    // Page type
    const pageDoc: SanityDocumentPage = {
      _type: 'page',
      name: transformed.name,
      slug: transformed.slug,
      heading: transformed.heading,
      subheading: transformed.subheading,
    }
    return pageDoc
  }
}

// Helper function to process media references in content
function processMediaInContent(
  content: MigrationBlockContent,
  media: Array<{ type: string; url: string; localPath: string; found: boolean }>,
  mediaAssets: Map<string, string>,
): BlockContent {
  return content.map((block) => {
    if (block._type === 'image' && 'url' in block && 'localPath' in block) {
      const assetId = block.localPath ? mediaAssets.get(block.localPath) : undefined
      if (assetId) {
        // Return proper Sanity image block without temporary properties
        const imageBlock = { ...block }
        delete (imageBlock as Record<string, unknown>).url
        delete (imageBlock as Record<string, unknown>).localPath
        return {
          ...imageBlock,
          asset: {
            _type: 'reference' as const,
            _ref: assetId,
          },
        }
      }
      // If no asset found, return without the temporary properties
      const imageBlock = { ...block }
      delete (imageBlock as Record<string, unknown>).url
      delete (imageBlock as Record<string, unknown>).localPath
      return imageBlock
    } else if (block._type === 'audio' && 'url' in block && 'localPath' in block) {
      const assetId = block.localPath ? mediaAssets.get(block.localPath) : undefined
      if (assetId) {
        // Return proper Sanity audio block without temporary properties
        const audioBlock = { ...block }
        delete (audioBlock as Record<string, unknown>).url
        delete (audioBlock as Record<string, unknown>).localPath
        return {
          ...audioBlock,
          audioFile: {
            ...audioBlock.audioFile,
            asset: {
              _type: 'reference' as const,
              _ref: assetId,
            },
          },
        }
      }
      // If no asset found, return without the temporary properties
      const audioBlock = { ...block }
      delete (audioBlock as Record<string, unknown>).url
      delete (audioBlock as Record<string, unknown>).localPath
      return audioBlock
    } else if (block._type === 'video' && 'localPath' in block) {
      // For video blocks, just remove the localPath property
      const videoBlock = { ...block }
      delete (videoBlock as Record<string, unknown>).localPath
      return videoBlock
    }
    return block
  }) as BlockContent
}

// Helper function to find first image asset for cover image
function findFirstImageAssetId(
  media: Array<{ type: string; url: string; localPath: string; found: boolean }>,
  mediaAssets: Map<string, string>,
): string | null {
  const firstImage = media?.find((m) => m.type === 'image' && m.found)
  if (firstImage) {
    return mediaAssets.get(firstImage.localPath) || null
  }
  return null
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
            message: `${testRun ? 'Test run: importing' : 'Importing'} single record "${getContentTitle(selectedRecord.transformed)}"`,
          })
        } else if (testRun) {
          // Find a record with both image and audio media for test
          const recordWithMixedMedia = migrationData.find((record) => {
            const media = record.transformed.media || []
            const hasImage = media.some((m) => m.type === 'image' && m.found)
            const hasAudio = media.some((m) => m.type === 'audio' && m.found)
            return hasImage && hasAudio
          })

          if (recordWithMixedMedia) {
            recordsToImport = [recordWithMixedMedia]
            send({
              type: 'info',
              message: `Test run: importing record with mixed media "${getContentTitle(recordWithMixedMedia.transformed)}"`,
            })
          } else {
            // Fallback to first record with any media
            const recordWithMedia = migrationData.find((record) => {
              const media = record.transformed.media || []
              return media.some((m) => m.found)
            })

            if (recordWithMedia) {
              recordsToImport = [recordWithMedia]
              send({
                type: 'info',
                message: `Test run: importing record with media "${getContentTitle(recordWithMedia.transformed)}"`,
              })
            } else {
              recordsToImport = [migrationData[0]]
              send({
                type: 'info',
                message: `Test run: importing first record "${getContentTitle(migrationData[0].transformed)}"`,
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
            message: `Processing record: ${getContentTitle(record.transformed)}`,
            step: 'processing',
            current: processedRecords,
            total: recordsToImport.length,
          })

          // Process media files (upload in production, simulate in test)
          const media = record.transformed.media
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
                _type: sanityDoc._type,
                title: sanityDoc._type === 'post' ? sanityDoc.title : sanityDoc.name,
                slug: sanityDoc.slug.current,
                hasContent:
                  sanityDoc._type === 'post'
                    ? !!sanityDoc.content && sanityDoc.content.length > 0
                    : false,
                contentBlocks: sanityDoc._type === 'post' ? sanityDoc.content?.length || 0 : 0,
                hasExcerpt: sanityDoc._type === 'post' ? !!sanityDoc.excerpt : false,
                hasCoverImage: sanityDoc._type === 'post' ? !!sanityDoc.coverImage.asset : false,
                mediaInContent: record.transformed.media?.length || 0,
                mediaTypes: [...new Set(record.transformed.media?.map((m) => m.type) || [])],
              },
            })
          } else {
            // Actually create the document
            // The client.create method accepts any document shape, but we need to cast
            // to satisfy TypeScript's strict type checking
            const result = await client.create(sanityDoc as Parameters<typeof client.create>[0])
            send({
              type: 'success',
              message: `Created document: ${getContentTitle(record.transformed)}`,
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
