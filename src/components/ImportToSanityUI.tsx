'use client'

import React, { useState, useEffect } from 'react'

interface ImportProgress {
  type: 'progress' | 'success' | 'error' | 'info'
  message: string
  step?: string
  current?: number
  total?: number
  details?: any
}

interface PostOption {
  id: number
  title: string
  mediaCount: number
  mediaTypes: string[]
}

export const ImportToSanityUI: React.FC = () => {
  const [isImporting, setIsImporting] = useState(false)
  const [messages, setMessages] = useState<ImportProgress[]>([])
  const [availablePosts, setAvailablePosts] = useState<PostOption[]>([])
  const [selectedPostId, setSelectedPostId] = useState<string>('')
  const [testMode, setTestMode] = useState(true)
  const [importMode, setImportMode] = useState<'single' | 'all'>('single')
  const [loadingPosts, setLoadingPosts] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    loadAvailablePosts()
  }, [])

  const loadAvailablePosts = async () => {
    try {
      setLoadingPosts(true)
      setLoadError(null)
      
      const response = await fetch('/api/get-migration-data')
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to load migration data')
      }
      
      if (!result.data || !Array.isArray(result.data)) {
        throw new Error('Migration data is not an array')
      }

      const migrationData = result.data as any[]
      console.log(`Loaded ${migrationData.length} migration records`)
      console.log('First record structure:', migrationData[0])
      
      // Debug: Check what each record looks like
      migrationData.slice(0, 3).forEach((record, index) => {
        console.log(`Record ${index}:`, {
          hasMedia: !!record.media,
          hasTransformedMedia: !!record.transformed?.media,
          mediaLength: record.media?.length || record.transformed?.media?.length,
          hasTransformed: !!record.transformed,
          title: record.transformed?.title,
          hasOriginal: !!record.original,
          originalId: record.original?.ID
        })
      })
      
      const postsWithMedia = migrationData
        .filter((record: any) => {
          // Try both locations for media property
          const media = record.media || record.transformed?.media
          const hasMedia = media && Array.isArray(media) && media.length > 0
          if (!hasMedia) {
            console.log('Filtered out record:', record.transformed?.title, 'media:', media)
          }
          return hasMedia
        })
        .map((record: any) => {
          const media = record.media || record.transformed?.media
          return {
            id: record.original.ID,
            title: record.transformed.title,
            mediaCount: media.length,
            mediaTypes: [...new Set(media.map((m: any) => m.type))],
          }
        })
        .slice(0, 20) // Increased to 20 for more options

      console.log(`Found ${postsWithMedia.length} posts with media:`, postsWithMedia)
      setAvailablePosts(postsWithMedia)

      // Auto-select a post with both image and audio if available
      const mixedMediaPost = postsWithMedia.find(
        (post: PostOption) =>
          post.mediaTypes.includes('image') && post.mediaTypes.includes('audio'),
      )

      if (mixedMediaPost) {
        setSelectedPostId(mixedMediaPost.id.toString())
        console.log(`Auto-selected post with mixed media: ${mixedMediaPost.title}`)
      } else if (postsWithMedia.length > 0) {
        setSelectedPostId(postsWithMedia[0].id.toString())
        console.log(`Auto-selected first post: ${postsWithMedia[0].title}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Failed to load posts:', errorMessage)
      setLoadError(errorMessage)
    } finally {
      setLoadingPosts(false)
    }
  }

  const startImport = async () => {
    if (
      !testMode &&
      !confirm('This will create actual documents in your Sanity project. Continue?')
    ) {
      return
    }

    setIsImporting(true)
    setMessages([])

    try {
      const response = await fetch('/api/import-to-sanity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          testRun: testMode,
          selectedRecordId: testMode || importMode === 'single' ? (selectedPostId || null) : null,
        }),
      })

      if (!response.body) {
        throw new Error('No response body')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              setMessages((prev) => [...prev, data])
            } catch (e) {
              console.error('Failed to parse SSE data:', e)
            }
          }
        }
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          type: 'error',
          message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ])
    } finally {
      setIsImporting(false)
    }
  }

  const getMessageIcon = (type: string) => {
    switch (type) {
      case 'success':
        return '✅'
      case 'error':
        return '❌'
      case 'progress':
        return '⏳'
      case 'info':
        return 'ℹ️'
      default:
        return '•'
    }
  }

  const getMessageColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'text-green-600'
      case 'error':
        return 'text-red-600'
      case 'progress':
        return 'text-blue-600'
      case 'info':
        return 'text-gray-600'
      default:
        return 'text-gray-500'
    }
  }

  const selectedPost = availablePosts.find((post) => post.id.toString() === selectedPostId)

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6 text-gray-100">Import to Sanity</h2>

      {/* Configuration Section */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
        <h3 className="text-lg font-semibold mb-4 text-gray-100">Import Configuration</h3>

        <div className="space-y-4">
          {/* Test Mode Toggle */}
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="testMode"
              checked={testMode}
              onChange={(e) => setTestMode(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <label htmlFor="testMode" className="text-sm font-medium text-gray-300">
              Test Run (Preview only - won't create actual documents)
            </label>
          </div>

          {/* Import Mode Selection (Production Only) */}
          {!testMode && (
            <div className="border-t border-gray-600 pt-4">
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Production Import Mode:
              </label>
              <div className="space-y-2">
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    id="importSingle"
                    name="importMode"
                    value="single"
                    checked={importMode === 'single'}
                    onChange={(e) => setImportMode(e.target.value as 'single' | 'all')}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <label htmlFor="importSingle" className="text-sm text-gray-300">
                    Import selected post only
                  </label>
                </div>
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    id="importAll"
                    name="importMode"
                    value="all"
                    checked={importMode === 'all'}
                    onChange={(e) => setImportMode(e.target.value as 'single' | 'all')}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <label htmlFor="importAll" className="text-sm text-gray-300">
                    Import ALL posts (full migration)
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Post Selection */}
          <div>
            <label htmlFor="postSelect" className="block text-sm font-medium text-gray-300 mb-2">
              {testMode 
                ? "Select Post to Test:" 
                : importMode === 'single' 
                  ? "Select Post to Import:"
                  : "Post Selection (optional - for reference only):"
              }
            </label>
            <select
              id="postSelect"
              value={selectedPostId}
              onChange={(e) => setSelectedPostId(e.target.value)}
              disabled={loadingPosts || (!testMode && importMode === 'all')}
              className={`w-full px-3 py-2 border border-gray-600 bg-gray-700 text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                loadingPosts || (!testMode && importMode === 'all') ? 'bg-gray-600 cursor-not-allowed opacity-50' : ''
              }`}
            >
              <option value="">
                {loadingPosts ? "Loading posts..." :
                 loadError ? "Error loading posts" :
                 testMode 
                  ? "Auto-select (finds post with mixed media)" 
                  : importMode === 'single'
                    ? "Choose a specific post to import"
                    : "All posts will be imported"
                }
              </option>
              {availablePosts.map((post) => (
                <option key={post.id} value={post.id}>
                  {post.title} ({post.mediaCount} media files: {post.mediaTypes.join(', ')})
                </option>
              ))}
            </select>
            
            {/* Loading/Error feedback */}
            {loadingPosts && (
              <p className="text-sm text-gray-400 mt-1">Loading available posts...</p>
            )}
            {loadError && (
              <div className="mt-2 p-2 bg-red-900/50 border border-red-600 rounded">
                <p className="text-sm text-red-400">
                  <strong>Error:</strong> {loadError}
                </p>
                <button 
                  onClick={loadAvailablePosts}
                  className="text-sm text-red-300 underline mt-1 hover:text-red-200"
                >
                  Retry
                </button>
              </div>
            )}
            {!loadingPosts && !loadError && (
              <p className="text-xs text-gray-500 mt-1">
                Debug: Found {availablePosts.length} posts with media
              </p>
            )}
          </div>

          {/* Import Preview */}
          <div className="bg-blue-900/30 border border-blue-600/50 rounded-md p-3">
            <p className="text-sm text-blue-300">
              <strong>Will {testMode ? 'preview' : 'import'}:</strong>{' '}
              {testMode ? (
                selectedPost ? (
                  <>
                    {selectedPost.title} ({selectedPost.mediaCount} media files: {selectedPost.mediaTypes.join(', ')})
                  </>
                ) : (
                  "1 auto-selected post with mixed media"
                )
              ) : importMode === 'all' ? (
                "ALL posts in migration data"
              ) : selectedPost ? (
                <>
                  {selectedPost.title} ({selectedPost.mediaCount} media files: {selectedPost.mediaTypes.join(', ')})
                </>
              ) : (
                "Please select a post to import"
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Environment Check */}
      <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-4 mb-6">
        <h4 className="text-sm font-semibold text-yellow-300 mb-2">⚠️ Prerequisites</h4>
        <ul className="text-sm text-yellow-200 space-y-1">
          <li>• Set NEXT_PUBLIC_SANITY_PROJECT_ID in your environment</li>
          <li>• Set SANITY_API_WRITE_TOKEN with write permissions</li>
          <li>• Ensure your Sanity project has a 'post' schema</li>
        </ul>
      </div>

      {/* Import Button */}
      <button
        onClick={startImport}
        disabled={isImporting}
        className={`w-full py-3 px-6 rounded-lg font-medium transition-colors ${
          isImporting
            ? 'bg-gray-400 cursor-not-allowed text-white'
            : testMode
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-green-600 hover:bg-green-700 text-white'
        }`}
      >
        {isImporting ? (
          <span className="flex items-center justify-center">
            <svg
              className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            {testMode ? 'Running Test...' : 'Importing...'}
          </span>
        ) : testMode ? (
          'Run Test Import'
        ) : (
          'Start Full Import'
        )}
      </button>

      {/* Progress Section */}
      {messages.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4 text-gray-100">
            {testMode ? 'Test Run' : 'Import'} Progress
          </h3>
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 max-h-96 overflow-y-auto">
            {messages.map((msg, index) => (
              <div key={index} className="flex items-start space-x-2 mb-2">
                <span className="text-yellow-400 mt-0.5 flex-shrink-0">
                  {getMessageIcon(msg.type)}
                </span>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-mono ${
                      msg.type === 'success'
                        ? 'text-green-400'
                        : msg.type === 'error'
                          ? 'text-red-400'
                          : msg.type === 'progress'
                            ? 'text-blue-400'
                            : 'text-gray-300'
                    }`}
                  >
                    {msg.message}
                  </p>
                  {msg.details && (
                    <pre className="text-xs text-gray-400 mt-1 whitespace-pre-wrap">
                      {JSON.stringify(msg.details, null, 2)}
                    </pre>
                  )}
                  {msg.current && msg.total && (
                    <div className="mt-2">
                      <div className="w-full bg-gray-800 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(msg.current / msg.total) * 100}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {msg.current} of {msg.total}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results Summary */}
      {!isImporting && messages.length > 0 && (
        <div className="mt-4 p-4 bg-gray-800 border border-gray-700 rounded-lg">
          <h4 className="font-semibold mb-2 text-gray-100">Summary</h4>
          <div className="text-sm text-gray-300 space-y-1">
            <p>• Total messages: {messages.length}</p>
            <p>• Successes: {messages.filter((m) => m.type === 'success').length}</p>
            <p>• Errors: {messages.filter((m) => m.type === 'error').length}</p>
            <p>• Mode: {testMode ? 'Test Run (No documents created)' : 'Full Import'}</p>
          </div>
        </div>
      )}
    </div>
  )
}
