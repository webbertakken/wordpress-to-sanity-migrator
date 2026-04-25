import { describe, it, expect } from 'vitest'
import { MIGRATION_STEPS } from '../migration'

describe('MIGRATION_STEPS', () => {
  it('exposes one entry per step in dashboard order', () => {
    expect(MIGRATION_STEPS).toHaveLength(4)
    expect(MIGRATION_STEPS.map((s) => s.title)).toEqual([
      'Docker Management',
      'Prepare Migration',
      'Verify Migration',
      'Import to Sanity',
    ])
  })

  it('every step carries a non-empty title and description', () => {
    for (const step of MIGRATION_STEPS) {
      expect(step.title).toBeTruthy()
      expect(step.description).toBeTruthy()
    }
  })
})
