'use client'

import { useState } from 'react'

const VerifyMigrationPage = () => {
  const [postCount, setPostCount] = useState<number | null>(null)
  const [first20Lines, setFirst20Lines] = useState<string | null>(null)

  const handlePrepareMigration = async () => {
    try {
      const response = await fetch('/api/prepare-migration', { method: 'POST' })
      const data = await response.json()
      if (data.success) {
        setPostCount(data.postCount)
        setFirst20Lines(data.first20Lines)
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      alert(`Error: ${(error as Error).message}`)
    }
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Verify Migration</h1>
      <button onClick={handlePrepareMigration} className="bg-blue-500 text-white px-4 py-2 rounded">
        Prepare Migration
      </button>
      {postCount !== null && (
        <div className="mt-4">
          <h2 className="text-xl font-semibold">Number of Posts: {postCount}</h2>
        </div>
      )}
      {first20Lines !== null && (
        <div className="mt-4">
          <h2 className="text-xl font-semibold">First 20 Lines of Migration File:</h2>
          <pre className="bg-gray-100 p-4 rounded">{first20Lines}</pre>
        </div>
      )}
    </div>
  )
}

export default VerifyMigrationPage
