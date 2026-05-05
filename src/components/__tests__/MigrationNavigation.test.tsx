import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MigrationNavigation } from '../MigrationNavigation'

describe('MigrationNavigation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders one button per migration step', () => {
    render(<MigrationNavigation currentStep={null} onStepChange={() => {}} />)
    const dashboard = screen.getByTitle('Dashboard')
    expect(dashboard).toBeInTheDocument()
    // Step buttons each have a title equal to their description.
    expect(screen.getByRole('button', { name: /Docker Management/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Prepare Migration/i })).toBeInTheDocument()
  })

  it('calls onStepChange(null) when the dashboard logo is clicked', async () => {
    const onStepChange = vi.fn()
    render(<MigrationNavigation currentStep={2} onStepChange={onStepChange} />)
    await userEvent.click(screen.getByTitle('Dashboard'))
    expect(onStepChange).toHaveBeenCalledWith(null)
  })

  it('calls onStepChange(index) when a step is clicked', async () => {
    const onStepChange = vi.fn()
    render(<MigrationNavigation currentStep={null} onStepChange={onStepChange} />)
    await userEvent.click(screen.getByRole('button', { name: /Verify Migration/i }))
    expect(onStepChange).toHaveBeenCalledWith(2)
  })

  it('marks completed steps with a check icon and the green colour scheme', () => {
    render(
      <MigrationNavigation
        currentStep={null}
        onStepChange={() => {}}
        completedSteps={new Set([0, 1])}
      />,
    )
    const docker = screen.getByRole('button', { name: /Docker Management/i })
    expect(docker.className).toMatch(/bg-green/)
  })

  it('hides the reset button when no steps are completed', () => {
    render(
      <MigrationNavigation currentStep={null} onStepChange={() => {}} onResetProgress={() => {}} />,
    )
    expect(screen.queryByTitle('Reset all progress')).not.toBeInTheDocument()
  })

  it('shows and triggers the reset button when steps are completed and the user confirms', async () => {
    const onResetProgress = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(
      <MigrationNavigation
        currentStep={null}
        onStepChange={() => {}}
        completedSteps={new Set([0])}
        onResetProgress={onResetProgress}
      />,
    )
    await userEvent.click(screen.getByTitle('Reset all progress'))
    expect(onResetProgress).toHaveBeenCalled()
  })

  it('does not call onResetProgress when the user cancels the confirmation', async () => {
    const onResetProgress = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <MigrationNavigation
        currentStep={null}
        onStepChange={() => {}}
        completedSteps={new Set([0])}
        onResetProgress={onResetProgress}
      />,
    )
    await userEvent.click(screen.getByTitle('Reset all progress'))
    expect(onResetProgress).not.toHaveBeenCalled()
  })

  it('highlights the active step', () => {
    render(<MigrationNavigation currentStep={1} onStepChange={() => {}} />)
    const active = screen.getByRole('button', { name: /Prepare Migration/i })
    expect(active.className).toMatch(/bg-blue-600/)
  })
})
