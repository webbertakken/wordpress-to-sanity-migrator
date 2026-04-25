import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VerifyMigrationPage from '../page'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('VerifyMigrationPage', () => {
  it('renders the heading and the trigger button', () => {
    render(<VerifyMigrationPage />)
    expect(screen.getByRole('heading', { name: /Verify Migration/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Prepare Migration/ })).toBeInTheDocument()
  })

  it('shows the post count and preview lines on a successful response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, postCount: 7, first20Lines: 'a\nb' }), {
        status: 200,
      }),
    )
    render(<VerifyMigrationPage />)
    await userEvent.click(screen.getByRole('button', { name: /Prepare Migration/ }))
    await waitFor(() => expect(screen.getByText(/Number of Posts: 7/)).toBeInTheDocument())
    expect(screen.getByText(/a\s+b/)).toBeInTheDocument()
  })

  it('alerts the user with the API error message on a failure response', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'something broke' }), { status: 200 }),
    )
    render(<VerifyMigrationPage />)
    await userEvent.click(screen.getByRole('button', { name: /Prepare Migration/ }))
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Error: something broke'))
  })

  it('alerts the user with the thrown error message when fetch rejects', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch died'))
    render(<VerifyMigrationPage />)
    await userEvent.click(screen.getByRole('button', { name: /Prepare Migration/ }))
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Error: fetch died'))
  })
})
