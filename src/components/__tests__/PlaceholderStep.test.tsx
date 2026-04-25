import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlaceholderStep } from '../PlaceholderStep'

describe('PlaceholderStep', () => {
  it('renders the heading and the placeholder copy', () => {
    render(<PlaceholderStep />)
    expect(screen.getByRole('heading', { name: /Next Step \(Placeholder\)/ })).toBeInTheDocument()
    expect(screen.getByText(/placeholder for the next step/i)).toBeInTheDocument()
  })
})
