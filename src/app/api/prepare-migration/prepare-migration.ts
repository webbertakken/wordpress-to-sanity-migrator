import mysql2 from 'mysql2/promise'
import fs from 'fs'
import path from 'path'
import { RowDataPacket } from 'mysql2'
import { WordPressPost, SanityContent, MigrationRecord } from '@/types/migration'
import { extractMediaFromContent, mapMediaToLocalPaths, replaceMediaUrls, generateMediaStats } from '@/utils/media-processor'

// Load environment variables if needed
// require('dotenv').config();

// MySQL connection configuration
const dbConfig = {
  host: 'localhost',
  port: 3306,
  user: 'root', // Update with your WordPress DB credentials
  password: 'P@ssw0rd!', // Update with your WordPress DB credentials
  database: 'wordpress', // Update with your WordPress DB name
}


function buildWordPressPageHierarchy(
  pages: WordPressPost[], 
  onProgress?: (update: { step: string; message: string; progress?: number }) => void
): void {
  const pageMap = new Map<number, WordPressPost>()
  
  // Create a map of all pages by ID
  pages.forEach(page => {
    pageMap.set(page.ID, page)
  })

  // Log page hierarchy information
  const topLevelPages = pages.filter(page => page.post_parent === 0)
  const childPages = pages.filter(page => page.post_parent > 0)
  
  onProgress?.({ step: 'page-hierarchy', message: 'Page hierarchy analysis:' })
  onProgress?.({ step: 'page-hierarchy', message: `- Top-level pages: ${topLevelPages.length}` })
  onProgress?.({ step: 'page-hierarchy', message: `- Child pages: ${childPages.length}` })
  
  // Log parent-child relationships
  childPages.forEach(child => {
    const parent = pageMap.get(child.post_parent)
    if (parent) {
      onProgress?.({ step: 'page-hierarchy', message: `  └─ "${child.post_title}" is child of "${parent.post_title}"` })
    } else {
      onProgress?.({ step: 'page-hierarchy', message: `  └─ "${child.post_title}" has missing parent ID: ${child.post_parent}` })
    }
  })
}

export async function prepareMigration(
  dryRun: boolean = false,
  onProgress?: (update: { step: string; message: string; progress?: number }) => void,
): Promise<{ migrationRecords: MigrationRecord[]; missingMedia: { url: string; foundIn: string; type: string }[] }> {
  try {
    onProgress?.({ step: 'connecting', message: 'Connecting to WordPress database...', progress: 10 })
    // Connect to WordPress database
    const connection = await mysql2.createConnection(dbConfig)

    onProgress?.({ step: 'fetching', message: 'Fetching WordPress posts and pages...', progress: 15 })
    // Fetch all published posts and pages
    const [content] = await connection.execute<RowDataPacket[]>(
      'SELECT * FROM wp_posts WHERE post_type IN ("post", "page") AND post_status = "publish" ORDER BY post_type, post_date DESC LIMIT 10000',
    )
    const typedContent = content as WordPressPost[]

    const posts = typedContent.filter(item => item.post_type === 'post')
    const pages = typedContent.filter(item => item.post_type === 'page')
    
    onProgress?.({ step: 'found-content', message: `Found ${typedContent.length} items to migrate`, progress: 20 })
    onProgress?.({ step: 'content-breakdown', message: `- Posts: ${posts.length}` })
    onProgress?.({ step: 'content-breakdown', message: `- Pages: ${pages.length}` })
    onProgress?.({ step: 'processing', message: `Processing ${typedContent.length} items (${posts.length} posts, ${pages.length} pages)...`, progress: 25 })

    // Analyze page hierarchy
    if (pages.length > 0) {
      buildWordPressPageHierarchy(pages, onProgress)
    }

    const migrationRecords: MigrationRecord[] = []
    const totalMediaStats = { totalImages: 0, totalAudio: 0, totalVideo: 0, totalFound: 0, totalMissing: 0 }
    const missingMediaFiles: { url: string; foundIn: string; type: string }[] = []

    // Process each piece of content
    for (let i = 0; i < typedContent.length; i++) {
      const item = typedContent[i]
      const progressPercent = 30 + Math.floor((i / typedContent.length) * 40)
      onProgress?.({ step: 'processing-item', message: `Processing ${item.post_type}: ${item.post_title}`, progress: progressPercent })
      
      // Small delay to ensure streaming works properly
      await new Promise(resolve => setTimeout(resolve, 10))

      // Extract media references from content
      const mediaRefs = extractMediaFromContent(item.post_content)

      // Map URLs to local file paths
      const mappedMediaRefs = mapMediaToLocalPaths(mediaRefs)

      // Replace URLs in content with local references
      const updatedContent = replaceMediaUrls(item.post_content, mappedMediaRefs)

      // Generate stats for this item
      const itemStats = generateMediaStats(mappedMediaRefs)
      totalMediaStats.totalImages += itemStats.totalImages
      totalMediaStats.totalAudio += itemStats.totalAudio  
      totalMediaStats.totalVideo += itemStats.totalVideo
      totalMediaStats.totalFound += itemStats.totalFound
      totalMediaStats.totalMissing += itemStats.totalMissing

      if (mappedMediaRefs.length > 0) {
        onProgress?.({ step: 'media-processing', message: `  - Found ${mappedMediaRefs.length} media references (${itemStats.totalFound} found, ${itemStats.totalMissing} missing)` })
        
        // Collect missing media files
        mappedMediaRefs.filter(ref => !ref.found).forEach(ref => {
          missingMediaFiles.push({
            url: ref.url,
            foundIn: `${item.post_type}: ${item.post_title}`,
            type: ref.type
          })
        })
      }

      // Build Sanity content object
      const sanityContent: SanityContent = {
        title: item.post_title,
        slug: item.post_name,
        publishedAt: item.post_date,
        body: updatedContent,
        excerpt: item.post_excerpt,
        media: mappedMediaRefs,
        contentType: item.post_type,
        parentId: item.post_parent > 0 ? item.post_parent : undefined,
        menuOrder: item.post_type === 'page' ? item.menu_order : undefined,
      }

      migrationRecords.push({
        original: item,
        transformed: sanityContent,
      })
    }

    // Send media statistics summary
    onProgress?.({ step: 'media-summary', message: 'Media Processing Summary:', progress: 75 })
    onProgress?.({ step: 'media-summary', message: `- Images: ${totalMediaStats.totalImages}` })
    onProgress?.({ step: 'media-summary', message: `- Audio: ${totalMediaStats.totalAudio}` })
    onProgress?.({ step: 'media-summary', message: `- Video: ${totalMediaStats.totalVideo}` })
    onProgress?.({ step: 'media-summary', message: `- Found locally: ${totalMediaStats.totalFound}` })
    onProgress?.({ step: 'media-summary', message: `- Missing: ${totalMediaStats.totalMissing}` })

    onProgress?.({ step: 'writing', message: 'Writing migration data to file...', progress: 85 })
    // Write to JSON file if not in dry run mode
    if (!dryRun) {
      const outputPath = path.join(process.cwd(), 'input', 'sanity-migration.json')
      fs.writeFileSync(outputPath, JSON.stringify(migrationRecords, null, 2))
      onProgress?.({ step: 'file-written', message: `Migration data written to ${outputPath}`, progress: 90 })
    } else {
      onProgress?.({ step: 'dry-run', message: 'Dry run completed. No files written.', progress: 90 })
    }

    await connection.end()
    onProgress?.({ step: 'completed', message: 'Migration preparation completed successfully', progress: 95 })
    
    return {
      migrationRecords,
      missingMedia: missingMediaFiles
    }
  } catch (error) {
    console.error('Migration preparation failed:', error)
    throw error
  }
}
