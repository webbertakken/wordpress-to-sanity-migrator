import { useSyncExternalStore } from 'react'

/**
 * Migration progress: the indices of the migration steps the operator has
 * completed, persisted in localStorage so it survives reloads.
 *
 * localStorage is the single source of truth; components read it through
 * `useCompletedSteps`, and the mutators below write it and notify readers.
 */

const STORAGE_KEY = 'completedMigrationSteps'
const NO_STEPS: ReadonlySet<number> = new Set()
const listeners = new Set<() => void>()

let cachedRaw: string | null = null
let cachedSteps: ReadonlySet<number> = NO_STEPS

/** Read the stored steps, returning the same Set until the stored value changes. */
function readCompletedSteps(): ReadonlySet<number> {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedSteps = raw ? new Set<number>(JSON.parse(raw)) : NO_STEPS
  }
  return cachedSteps
}

function writeCompletedSteps(steps: ReadonlySet<number>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...steps]))
  for (const notify of listeners) notify()
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

/** The completed steps; empty during server rendering, where localStorage does not exist. */
export function useCompletedSteps(): ReadonlySet<number> {
  return useSyncExternalStore(subscribe, readCompletedSteps, () => NO_STEPS)
}

/** Mark a step completed or not, writing only when that changes anything. */
export function setStepCompletion(stepIndex: number, completed: boolean): void {
  const steps = readCompletedSteps()
  if (steps.has(stepIndex) === completed) return
  const next = new Set(steps)
  if (completed) next.add(stepIndex)
  else next.delete(stepIndex)
  writeCompletedSteps(next)
}

/** Forget all progress. */
export function resetProgress(): void {
  writeCompletedSteps(NO_STEPS)
}
