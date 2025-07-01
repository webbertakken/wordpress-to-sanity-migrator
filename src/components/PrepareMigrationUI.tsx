'use client'

import React, { useState, useRef, useEffect } from 'react'

interface ProgressUpdate {
  step: string
  message: string
  progress?: number
  timestamp?: string
}

interface MissingMediaFile {
  url: string
  foundIn: string
  type: string
}

export const PrepareMigrationUI: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [postCount, setPostCount] = useState<number | null>(null)
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [progressUpdates, setProgressUpdates] = useState<ProgressUpdate[]>([])
  const [currentProgress, setCurrentProgress] = useState(0)
  const [missingMedia, setMissingMedia] = useState<MissingMediaFile[]>([])
  const [parsePagesAsPosts, setParsePagesAsPosts] = useState(false)
  const logContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new progress updates arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [progressUpdates])

  const runPrepareMigration = async () => {
    setLoading(true)
    setResult(null)
    setError(null)
    setPostCount(null)
    setPageCount(null)
    setTotalCount(null)
    setProgressUpdates([])
    setCurrentProgress(0)
    setMissingMedia([])

    try {
      const response = await fetch('/api/prepare-migration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parsePagesAsPosts,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      let done = false
      while (!done) {
        const { value, done: readerDone } = await reader.read()
        done = readerDone

        if (value) {
          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))

                if (data.type === 'status') {
                  console.log('Status:', data.message)
                } else if (data.type === 'progress') {
                  console.log('Received progress update:', data.message)
                  setProgressUpdates((prev) => [...prev, data])
                  if (data.progress !== undefined) {
                    setCurrentProgress(data.progress)
                  }
                } else if (data.type === 'result') {
                  const result = data.result
                  setResult(result.message || 'Migration preparation completed successfully.')
                  if (result.data?.postCount !== undefined) {
                    setPostCount(result.data.postCount)
                  }
                  if (result.data?.pageCount !== undefined) {
                    setPageCount(result.data.pageCount)
                  }
                  if (result.data?.totalCount !== undefined) {
                    setTotalCount(result.data.totalCount)
                  }
                  if (result.data?.missingMedia !== undefined) {
                    setMissingMedia(result.data.missingMedia)
                  }
                } else if (data.type === 'error') {
                  throw new Error(JSON.stringify(data.error))
                }
              } catch (parseError) {
                console.warn('Failed to parse SSE data:', line, parseError)
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Error caught:', err)
      setError(err instanceof Error ? err.message : 'Failed to run migration')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-4">Prepare Migration</h2>
      <p className="mb-6">Run the migration preparation script and generate the migration data.</p>
      
      {/* Migration Options */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-gray-100 mb-3">Migration Options</h3>
        <div className="flex items-center space-x-3">
          <input
            type="checkbox"
            id="parsePagesAsPosts"
            checked={parsePagesAsPosts}
            onChange={(e) => setParsePagesAsPosts(e.target.checked)}
            disabled={loading}
            className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
          />
          <label htmlFor="parsePagesAsPosts" className="text-sm font-medium text-gray-300">
            Parse pages as posts
          </label>
        </div>
        <div className="mt-2 text-xs text-gray-400">
          When enabled, WordPress pages will be converted to Sanity posts instead of pages. 
          This is useful if you want all content to be treated as blog posts.
        </div>
      </div>

      <button
        onClick={runPrepareMigration}
        disabled={loading}
        className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition mb-4 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Running...' : 'Run Prepare Migration'}
      </button>

      {(loading || progressUpdates.length > 0) && (
        <div className="mt-4">
          {loading && <div className="text-gray-400 mb-2">Running migration preparation...</div>}
          {!loading && <div className="text-green-500 mb-2">Migration completed!</div>}

          {currentProgress > 0 && (
            <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${currentProgress}%` }}
              ></div>
            </div>
          )}

          {progressUpdates.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">
                  {loading ? 'Live Processing Output:' : 'Processing Log:'}
                </h3>
                {!loading && (
                  <button
                    onClick={() => setProgressUpdates([])}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    Clear Log
                  </button>
                )}
              </div>
              <div
                ref={logContainerRef}
                className="bg-gray-800 rounded-lg p-4 max-h-80 overflow-y-auto border"
              >
                {progressUpdates.map((update, index) => (
                  <div key={index} className="text-sm text-gray-300 mb-1 font-mono">
                    {update.timestamp && (
                      <span className="text-gray-500 mr-2">
                        {new Date(update.timestamp).toLocaleTimeString()}
                      </span>
                    )}
                    <span className="font-medium text-blue-400">[{update.step}]</span>{' '}
                    {update.message}
                    {update.progress !== undefined && (
                      <span className="ml-2 text-gray-500">({update.progress}%)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Missing Media Block */}
      {missingMedia.length > 0 && (
        <div className="mt-4">
          <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-yellow-400">
                Missing Media Files ({missingMedia.length})
              </h3>
              <div className="text-sm text-yellow-300">
                Files referenced in content but not found locally
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto">
              {missingMedia.map((media, index) => (
                <div
                  key={index}
                  className="mb-2 p-2 bg-gray-800/50 rounded border-l-2 border-yellow-500 hover:bg-gray-800/70 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                          media.type === 'image'
                            ? 'bg-blue-900 text-blue-300'
                            : media.type === 'audio'
                              ? 'bg-green-900 text-green-300'
                              : 'bg-purple-900 text-purple-300'
                        }`}
                      >
                        {media.type}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs text-gray-400 truncate">{media.foundIn}</div>
                        <div className="text-xs text-gray-300 font-mono truncate" title={media.url}>
                          {media.url}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => navigator.clipboard.writeText(media.url)}
                      className="p-1 text-gray-400 hover:text-white transition-colors flex-shrink-0"
                      title="Copy URL"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 text-sm text-yellow-300 bg-yellow-900/10 p-3 rounded">
              <strong>💡 Tip:</strong> Download these files and place them in the{' '}
              <code className="bg-gray-800 px-1 rounded">input/uploads/</code> directory, then
              re-run the migration to include them in your content.
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-4">
          <div className="text-green-500 text-lg font-semibold mb-4">{result}</div>

          {/* Migration Summary */}
          {(postCount !== null || pageCount !== null || totalCount !== null) && (
            <div className="bg-gray-800 rounded-lg p-4 mb-4">
              <h3 className="text-lg font-semibold mb-2 text-blue-400">Migration Summary</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                {totalCount !== null && (
                  <div>
                    <span className="text-gray-400">Total Items:</span>
                    <div className="text-xl font-bold text-white">{totalCount}</div>
                  </div>
                )}
                {postCount !== null && (
                  <div>
                    <span className="text-gray-400">Posts:</span>
                    <div className="text-xl font-bold text-white">{postCount}</div>
                  </div>
                )}
                {pageCount !== null && (
                  <div>
                    <span className="text-gray-400">Pages:</span>
                    <div className="text-xl font-bold text-white">{pageCount}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {error && (
        <div className="mt-4">
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4 text-red-400">Error</h2>
            <div className="space-y-4">
              {(() => {
                try {
                  const errorData = JSON.parse(error)
                  return (
                    <>
                      <p className="text-red-200">{errorData.message}</p>
                      {errorData.details && (
                        <div className="mt-4">
                          {errorData.details.guidance && (
                            <div className="mb-4">
                              <h3 className="text-lg font-semibold text-red-300 mb-2">
                                Troubleshooting Steps:
                              </h3>
                              <div className="bg-gray-900/50 p-4 rounded text-sm text-gray-300">
                                {errorData.details.guidance
                                  .split('\n')
                                  .map((line: string, index: number) => (
                                    <p key={index} className="mb-2">
                                      {line}
                                    </p>
                                  ))}
                              </div>
                            </div>
                          )}
                          <h3 className="text-lg font-semibold text-red-300 mb-2">
                            Technical Details:
                          </h3>
                          <div className="bg-gray-900/50 p-4 rounded text-sm text-gray-300">
                            {errorData.details.stack && (
                              <div className="mb-4">
                                <h4 className="font-semibold mb-2">Error Stack:</h4>
                                <div className="whitespace-pre-wrap">
                                  {errorData.details.stack.split('\n').slice(0, 3).join('\n')}
                                </div>
                              </div>
                            )}
                            {errorData.details.cwd && (
                              <div className="mb-4">
                                <h4 className="font-semibold mb-2">Working Directory:</h4>
                                <div>{errorData.details.cwd}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )
                } catch (e) {
                  console.error('Error parsing error message:', e)
                  return <p className="text-red-200">{error}</p>
                }
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
