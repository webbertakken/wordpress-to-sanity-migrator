import fs from 'fs'
import path from 'path'
import { parse } from 'node-html-parser'
import { MigrationRecord } from '@/types/migration'

export interface TagAnalysis {
  allTags: Set<string>
  mediaTags: Set<string>
  uncoveredMediaTags: Set<string>
  tagFrequency: Map<string, number>
  mediaWithSrc: Map<string, string[]>
}

// Tags that are already covered by our current media processor
const COVERED_TAGS = new Set([
  'img',
  'audio',
  'video',
  'source' // within audio/video elements
])

// Non-media tags that don't need media processing
const NON_MEDIA_TAGS = new Set([
  'p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a', 'strong', 'b', 'em', 'i', 'u', 'strike', 'del',
  'blockquote', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th',
  'thead', 'tbody', 'tfoot', 'br', 'hr', 'pre', 'code',
  'form', 'input', 'textarea', 'button', 'select', 'option',
  'label', 'fieldset', 'legend', 'nav', 'header', 'footer',
  'section', 'article', 'aside', 'main', 'figure', 'figcaption',
  'time', 'mark', 'small', 'sub', 'sup', 'abbr', 'cite',
  'q', 'dfn', 'kbd', 'samp', 'var', 'details', 'summary'
])

// Potential media-related tags that might contain src or other media attributes
const POTENTIAL_MEDIA_TAGS = new Set([
  'embed', 'object', 'iframe', 'track', 'area', 'map',
  'picture', 'canvas', 'svg', 'use', 'image', 'foreignObject'
])

/**
 * Extract all HTML tags from content
 */
function extractAllTags(content: string): Set<string> {
  const tags = new Set<string>()
  
  // Use regex to find all HTML tags
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g
  let match
  
  while ((match = tagRegex.exec(content)) !== null) {
    const tagName = match[1].toLowerCase()
    tags.add(tagName)
  }
  
  return tags
}

/**
 * Extract tags with src attributes and their URLs
 */
function extractTagsWithSrc(content: string): Map<string, string[]> {
  const root = parse(content)
  const tagsWithSrc = new Map<string, string[]>()
  
  // Find all elements with src attribute
  const elementsWithSrc = root.querySelectorAll('[src]')
  
  elementsWithSrc.forEach(element => {
    const tagName = element.tagName.toLowerCase()
    const src = element.getAttribute('src')
    
    if (src) {
      if (!tagsWithSrc.has(tagName)) {
        tagsWithSrc.set(tagName, [])
      }
      tagsWithSrc.get(tagName)!.push(src)
    }
  })
  
  return tagsWithSrc
}

/**
 * Analyze all HTML tags in migration data
 */
export async function analyzeHtmlTags(): Promise<TagAnalysis> {
  const migrationFilePath = path.join(process.cwd(), 'input', 'sanity-migration.json')
  
  if (!fs.existsSync(migrationFilePath)) {
    throw new Error('Migration file not found. Run migration preparation first.')
  }
  
  const fileContent = fs.readFileSync(migrationFilePath, 'utf-8')
  const migrationData: MigrationRecord[] = JSON.parse(fileContent)
  
  const allTags = new Set<string>()
  const tagFrequency = new Map<string, number>()
  const allMediaWithSrc = new Map<string, Set<string>>()
  
  // Analyze each migration record
  migrationData.forEach(record => {
    const content = record.original.post_content
    
    // Extract all tags
    const contentTags = extractAllTags(content)
    contentTags.forEach(tag => {
      allTags.add(tag)
      tagFrequency.set(tag, (tagFrequency.get(tag) || 0) + 1)
    })
    
    // Extract tags with src attributes
    const tagsWithSrc = extractTagsWithSrc(content)
    tagsWithSrc.forEach((srcList, tagName) => {
      if (!allMediaWithSrc.has(tagName)) {
        allMediaWithSrc.set(tagName, new Set())
      }
      srcList.forEach(src => allMediaWithSrc.get(tagName)!.add(src))
    })
  })
  
  // Identify media-related tags
  const mediaTags = new Set<string>()
  allTags.forEach(tag => {
    if (POTENTIAL_MEDIA_TAGS.has(tag) || allMediaWithSrc.has(tag)) {
      mediaTags.add(tag)
    }
  })
  
  // Find uncovered media tags
  const uncoveredMediaTags = new Set<string>()
  mediaTags.forEach(tag => {
    if (!COVERED_TAGS.has(tag) && !NON_MEDIA_TAGS.has(tag)) {
      uncoveredMediaTags.add(tag)
    }
  })
  
  // Convert media with src to use arrays instead of sets for JSON serialization
  const mediaWithSrc = new Map<string, string[]>()
  allMediaWithSrc.forEach((srcSet, tagName) => {
    mediaWithSrc.set(tagName, Array.from(srcSet))
  })
  
  return {
    allTags,
    mediaTags,
    uncoveredMediaTags,
    tagFrequency,
    mediaWithSrc
  }
}

/**
 * Generate a detailed report of tag analysis
 */
export function generateTagReport(analysis: TagAnalysis): string {
  let report = 'HTML TAG ANALYSIS REPORT\n'
  report += '========================\n\n'
  
  report += `Total unique tags found: ${analysis.allTags.size}\n\n`
  
  report += 'COVERED TAGS (already handled):\n'
  COVERED_TAGS.forEach(tag => {
    if (analysis.allTags.has(tag)) {
      const frequency = analysis.tagFrequency.get(tag) || 0
      report += `- ${tag} (${frequency} occurrences)\n`
    }
  })
  report += '\n'
  
  report += 'NON-MEDIA TAGS (no action needed):\n'
  const nonMediaFound = Array.from(analysis.allTags).filter(tag => NON_MEDIA_TAGS.has(tag))
  nonMediaFound.sort().forEach(tag => {
    const frequency = analysis.tagFrequency.get(tag) || 0
    report += `- ${tag} (${frequency} occurrences)\n`
  })
  report += '\n'
  
  report += 'MEDIA TAGS WITH SRC ATTRIBUTES:\n'
  analysis.mediaWithSrc.forEach((srcs, tagName) => {
    report += `- ${tagName}: ${srcs.length} unique URLs\n`
    if (srcs.length <= 3) {
      srcs.forEach(src => report += `  → ${src}\n`)
    } else {
      srcs.slice(0, 2).forEach(src => report += `  → ${src}\n`)
      report += `  → ... and ${srcs.length - 2} more\n`
    }
  })
  report += '\n'
  
  if (analysis.uncoveredMediaTags.size > 0) {
    report += 'UNCOVERED MEDIA TAGS (need attention):\n'
    Array.from(analysis.uncoveredMediaTags).sort().forEach(tag => {
      const frequency = analysis.tagFrequency.get(tag) || 0
      report += `- ${tag} (${frequency} occurrences)\n`
    })
  } else {
    report += 'All media-related tags are covered! ✅\n'
  }
  
  return report
}