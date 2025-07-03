'use client'

import React, { useState, useEffect } from 'react'
import { PrepareMigrationUI } from '../components/PrepareMigrationUI'
import { VerifyMigrationUI } from '../components/VerifyMigrationUI'
import { ImportToSanityUI } from '../components/ImportToSanityUI'
import { DockerManagerUI } from '../components/DockerManagerUI'
import { MigrationNavigation } from '../components/MigrationNavigation'
import { MIGRATION_STEPS } from '../constants/migration'
import { MigrationStep } from '../types/migration'

export default function Home() {
  const [step, setStep] = useState<number | null>(null)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())

  // Load completed steps from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('completedMigrationSteps')
    if (saved) {
      setCompletedSteps(new Set(JSON.parse(saved)))
    }
  }, [])

  // Save completed steps to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('completedMigrationSteps', JSON.stringify(Array.from(completedSteps)))
  }, [completedSteps])

  const markStepCompleted = (stepIndex: number) => {
    setCompletedSteps((prev) => new Set(prev).add(stepIndex))
  }

  const resetProgress = () => {
    setCompletedSteps(new Set())
    localStorage.removeItem('completedMigrationSteps')
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <MigrationNavigation
        currentStep={step}
        onStepChange={setStep}
        completedSteps={completedSteps}
        onResetProgress={resetProgress}
      />
      <div className="p-8 pt-4">
        {step === null ? (
          <div>
            <h1 className="text-3xl font-bold mb-8">WordPress to Sanity Migration</h1>
            <p className="text-gray-300 mb-8 max-w-3xl">
              Follow these steps to migrate your WordPress content to Sanity CMS. Click on any step
              below or use the navigation bar above to get started.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {MIGRATION_STEPS.map((s: MigrationStep, i: number) => {
                const isCompleted = completedSteps.has(i)
                return (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className={`
                      rounded-lg border shadow-lg p-6 flex flex-col items-start 
                      transition-all cursor-pointer text-left
                      ${
                        isCompleted
                          ? 'border-green-600 bg-green-900/20 hover:bg-green-900/30'
                          : 'border-gray-700 bg-gray-800 hover:bg-gray-700'
                      }
                    `}
                  >
                    <div className="flex items-center justify-between w-full mb-3">
                      <span
                        className={`
                        text-3xl font-bold 
                        ${isCompleted ? 'text-green-500' : 'text-gray-600'}
                      `}
                      >
                        {i + 1}
                      </span>
                      {isCompleted && (
                        <svg
                          className="w-6 h-6 text-green-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                    <h2 className="text-xl font-semibold mb-2">{s.title}</h2>
                    <p className="text-gray-300 text-sm">{s.description}</p>
                  </button>
                )
              })}
            </div>
          </div>
        ) : step === 0 ? (
          <DockerManagerUI onComplete={() => markStepCompleted(0)} />
        ) : step === 1 ? (
          <PrepareMigrationUI onComplete={() => markStepCompleted(1)} />
        ) : step === 2 ? (
          <VerifyMigrationUI onComplete={() => markStepCompleted(2)} />
        ) : (
          <ImportToSanityUI onComplete={() => markStepCompleted(3)} />
        )}
      </div>
    </div>
  )
}
