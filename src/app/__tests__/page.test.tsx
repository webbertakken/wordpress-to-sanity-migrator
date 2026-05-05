import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub the heavy step components — we only test the page-level routing/state.
vi.mock('../../components/DockerManagerUI', () => ({
  DockerManagerUI: (props: { onComplete?: () => void; onIncomplete?: () => void }) => (
    <div>
      <span>docker-stub</span>
      <button onClick={() => props.onComplete?.()}>complete-docker</button>
      <button onClick={() => props.onIncomplete?.()}>incomplete-docker</button>
    </div>
  ),
}))
vi.mock('../../components/PrepareMigrationUI', () => ({
  PrepareMigrationUI: (props: { onComplete?: () => void }) => (
    <div>
      <span>prepare-stub</span>
      <button onClick={() => props.onComplete?.()}>complete-prepare</button>
    </div>
  ),
}))
vi.mock('../../components/VerifyMigrationUI', () => ({
  VerifyMigrationUI: (props: { onComplete?: () => void }) => (
    <div>
      <span>verify-stub</span>
      <button onClick={() => props.onComplete?.()}>complete-verify</button>
    </div>
  ),
}))
vi.mock('../../components/ImportToSanityUI', () => ({
  ImportToSanityUI: (props: { onComplete?: () => void }) => (
    <div>
      <span>import-stub</span>
      <button onClick={() => props.onComplete?.()}>complete-import</button>
    </div>
  ),
}))

import Home from '../page'

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ running: false }), { status: 200 }),
  )
})

describe('Home page', () => {
  it('renders the dashboard with one card per migration step', async () => {
    render(<Home />)
    expect(screen.getByText(/WordPress to Sanity Migration/)).toBeInTheDocument()
    // Each step appears in both the nav and the card; getAllByText covers both.
    expect(screen.getAllByText('Docker Management').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Prepare Migration').length).toBeGreaterThan(0)
  })

  it('renders each step component on click', async () => {
    render(<Home />)
    // Find the dashboard buttons (cards) by text content within button.
    const cards = screen.getAllByRole('button')
    const docker = cards.find((b) => b.textContent?.includes('Docker Management'))!
    await userEvent.click(docker)
    expect(screen.getByText('docker-stub')).toBeInTheDocument()
  })

  it('marks docker step complete via onComplete callback', async () => {
    render(<Home />)
    const cards = screen.getAllByRole('button')
    const docker = cards.find((b) => b.textContent?.includes('Start or stop the Docker container'))!
    await userEvent.click(docker)
    await userEvent.click(screen.getByRole('button', { name: 'complete-docker' }))
    // The Reset button appears in the navigation only when at least one step
    // is completed, so it is a faithful proxy for completion having stuck.
    await waitFor(() => expect(screen.getByTitle('Reset all progress')).toBeInTheDocument())
  })

  it('marks docker step incomplete via onIncomplete callback', async () => {
    render(<Home />)
    const cards = screen.getAllByRole('button')
    const docker = cards.find((b) => b.textContent?.includes('Docker Management'))!
    await userEvent.click(docker)
    await userEvent.click(screen.getByRole('button', { name: 'complete-docker' }))
    await userEvent.click(screen.getByRole('button', { name: 'incomplete-docker' }))
    const navStepDocker = screen
      .getAllByRole('button')
      .find((b) => b.title?.includes('Docker container for the migration'))!
    expect(navStepDocker.className).not.toMatch(/bg-green/)
  })

  it('marks prepare/verify/import steps complete via callbacks', async () => {
    render(<Home />)
    const cards = screen.getAllByRole('button')
    const prepare = cards.find((b) => b.textContent?.includes('Prepare Migration'))!
    await userEvent.click(prepare)
    await userEvent.click(screen.getByRole('button', { name: 'complete-prepare' }))

    const verify = screen
      .getAllByRole('button')
      .find((b) => b.title?.includes('verify the migration data'))!
    await userEvent.click(verify)
    await userEvent.click(screen.getByRole('button', { name: 'complete-verify' }))

    const importBtn = screen
      .getAllByRole('button')
      .find((b) => b.title?.includes('Import the prepared'))!
    await userEvent.click(importBtn)
    await userEvent.click(screen.getByRole('button', { name: 'complete-import' }))

    expect(screen.getByTitle('Reset all progress')).toBeInTheDocument()
  })

  it('persists completed steps across remounts via localStorage', async () => {
    localStorage.setItem('completedMigrationSteps', JSON.stringify([0, 2]))
    render(<Home />)
    // The Docker step should appear green.
    const navStepDocker = screen
      .getAllByRole('button')
      .find((b) => b.title?.includes('Docker container'))!
    expect(navStepDocker.className).toMatch(/bg-green/)
  })

  it('clears completed steps via the Reset button when confirmed (writes empty array)', async () => {
    // Mark step 0 as completed AND stub container detection to running=true,
    // so the auto-detect useEffect does not undo the completion before the
    // user can click Reset.
    localStorage.setItem('completedMigrationSteps', JSON.stringify([0]))
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ running: true }), { status: 200 }),
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<Home />)
    await waitFor(() => expect(screen.getByTitle('Reset all progress')).toBeInTheDocument())
    await userEvent.click(screen.getByTitle('Reset all progress'))
    // The component first calls localStorage.removeItem, then the useEffect
    // re-syncs with an empty array.
    await waitFor(() => expect(localStorage.getItem('completedMigrationSteps')).toBe('[]'))
  })

  it('detects a running container and marks step 0 as complete on mount', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ running: true }), { status: 200 }),
    )
    render(<Home />)
    await waitFor(() => {
      const navStepDocker = screen
        .getAllByRole('button')
        .find((b) => b.title?.includes('Docker container'))!
      expect(navStepDocker.className).toMatch(/bg-green/)
    })
  })

  it('survives a failed container detection (silently)', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'))
    render(<Home />)
    // Should still render the dashboard.
    expect(screen.getByText(/WordPress to Sanity Migration/)).toBeInTheDocument()
  })

  it('refreshes container detection when the window regains focus', async () => {
    let calls = 0
    vi.spyOn(global, 'fetch').mockImplementation(() => {
      calls += 1
      return Promise.resolve(new Response(JSON.stringify({ running: false }), { status: 200 }))
    })
    render(<Home />)
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(1))
    const initial = calls
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(calls).toBeGreaterThan(initial))
  })

  it('handles a non-OK container detection response (no state change)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }))
    render(<Home />)
    expect(screen.getByText(/WordPress to Sanity Migration/)).toBeInTheDocument()
  })
})
