'use client'

import React, { useState } from 'react'
import { PrepareMigrationUI } from '../components/PrepareMigrationUI'
import { VerifyMigrationUI } from '../components/VerifyMigrationUI'
import { ImportToSanityUI } from '../components/ImportToSanityUI'
import { DockerManagerUI } from '../components/DockerManagerUI'
import { MIGRATION_STEPS } from '../constants/migration'
import { MigrationStep } from '../types/migration'

export default function Home() {
  const [step, setStep] = useState<number | null>(null)

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      {step === null ? (
        <div>
          <h1 className="text-3xl font-bold mb-8">Migration Dashboard</h1>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {MIGRATION_STEPS.map((s: MigrationStep, i: number) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className="rounded-lg border border-gray-700 bg-gray-800 shadow p-6 flex flex-col items-start hover:bg-gray-700 transition cursor-pointer text-left"
              >
                <h2 className="text-xl font-semibold mb-2">{s.title}</h2>
                <p className="text-gray-300">{s.description}</p>
              </button>
            ))}
          </div>
        </div>
      ) : step === 0 ? (
        <>
          <button className="mb-4 text-blue-400 underline" onClick={() => setStep(null)}>
            &larr; Back to Dashboard
          </button>
          <DockerManagerUI />
        </>
      ) : step === 1 ? (
        <>
          <button className="mb-4 text-blue-400 underline" onClick={() => setStep(null)}>
            &larr; Back to Dashboard
          </button>
          <PrepareMigrationUI />
        </>
      ) : step === 2 ? (
        <>
          <button className="mb-4 text-blue-400 underline" onClick={() => setStep(null)}>
            &larr; Back to Dashboard
          </button>
          <VerifyMigrationUI />
        </>
      ) : (
        <>
          <button className="mb-4 text-blue-400 underline" onClick={() => setStep(null)}>
            &larr; Back to Dashboard
          </button>
          <ImportToSanityUI />
        </>
      )}
    </div>
  )
}
