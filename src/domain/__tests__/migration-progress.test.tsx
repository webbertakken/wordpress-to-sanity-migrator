import { act, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { describe, it, expect, beforeEach } from 'vitest'
import { resetProgress, setStepCompletion, useCompletedSteps } from '../migration-progress'

const STORAGE_KEY = 'completedMigrationSteps'

function CompletedSteps() {
  const steps = useCompletedSteps()
  return <output>{[...steps].join(',') || 'none'}</output>
}

beforeEach(() => {
  localStorage.clear()
})

describe('migration progress', () => {
  it('reads the completed steps stored by an earlier visit', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([0, 2]))

    render(<CompletedSteps />)

    expect(screen.getByRole('status')).toHaveTextContent('0,2')
  })

  it('persists a completed step and shows it to every reader', () => {
    render(<CompletedSteps />)

    act(() => setStepCompletion(1, true))

    expect(screen.getByRole('status')).toHaveTextContent('1')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('[1]')
  })

  it('unmarks a step that is no longer complete', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([0, 1]))
    render(<CompletedSteps />)

    act(() => setStepCompletion(0, false))

    expect(screen.getByRole('status')).toHaveTextContent('1')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('[1]')
  })

  it('leaves storage untouched when the completion does not change', () => {
    localStorage.setItem(STORAGE_KEY, '[ 3 ]')

    setStepCompletion(3, true)
    setStepCompletion(4, false)

    expect(localStorage.getItem(STORAGE_KEY)).toBe('[ 3 ]')
  })

  it('forgets all progress on reset, storing an empty list', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([0, 1]))
    render(<CompletedSteps />)

    act(() => resetProgress())

    expect(screen.getByRole('status')).toHaveTextContent('none')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('[]')
  })

  it('stops notifying a reader once it unmounts', () => {
    const { unmount } = render(<CompletedSteps />)
    unmount()

    expect(() => setStepCompletion(1, true)).not.toThrow()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('[1]')
  })

  it('renders no progress on the server, where localStorage is unavailable', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([0]))

    expect(renderToString(<CompletedSteps />)).toContain('none')
  })
})
