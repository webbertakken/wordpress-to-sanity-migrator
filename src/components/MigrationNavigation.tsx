'use client'

import React from 'react'
import { MIGRATION_STEPS } from '../constants/migration'
import { MigrationStep } from '../types/migration'

interface MigrationNavigationProps {
  currentStep: number | null
  onStepChange: (step: number | null) => void
  completedSteps?: Set<number>
  onResetProgress?: () => void
}

export function MigrationNavigation({
  currentStep,
  onStepChange,
  completedSteps = new Set(),
  onResetProgress,
}: MigrationNavigationProps) {
  return (
    <div className="bg-gray-800 border-b border-gray-700 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => onStepChange(null)}
              className="text-white font-semibold hover:text-blue-400 transition-colors"
            >
              Migration Dashboard
            </button>

            {onResetProgress && completedSteps.size > 0 && (
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to reset all progress?')) {
                    onResetProgress()
                  }
                }}
                className="text-xs text-gray-400 hover:text-red-400 transition-colors flex items-center space-x-1"
                title="Reset all progress"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span>Reset</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-1">
            {MIGRATION_STEPS.map((step: MigrationStep, index: number) => {
              const isActive = currentStep === index
              const isCompleted = completedSteps.has(index)
              // const isPending = !isActive && !isCompleted

              return (
                <React.Fragment key={index}>
                  {index > 0 && (
                    <div
                      className={`h-0.5 w-8 transition-colors ${
                        completedSteps.has(index - 1) ? 'bg-green-500' : 'bg-gray-600'
                      }`}
                    />
                  )}

                  <button
                    onClick={() => onStepChange(index)}
                    className={`
                      relative px-3 py-2 rounded-lg text-sm font-medium transition-all
                      ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-lg scale-105'
                          : isCompleted
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                      }
                    `}
                    title={step.description}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="hidden md:inline">{step.title}</span>
                      <span className="md:hidden">{index + 1}</span>

                      {isCompleted && (
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
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>

                    {isActive && <div className="absolute inset-x-0 -bottom-1 h-0.5 bg-blue-400" />}
                  </button>
                </React.Fragment>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
