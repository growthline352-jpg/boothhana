import { describe, expect, it } from 'vitest'
import type { Location, PublicParticipant } from './api'
import { hasMappableLocation } from './BoothDetail.utils'

function participant(locations: Location[]) {
  return { participant: { locations } } as PublicParticipant
}

function location(code: string | null, startDate = '2026-10-10', endDate = '2026-10-10'): Location {
  return { code, status: code ? 'ASSIGNED' : 'UNKNOWN', hall: null, zone: null, startDate, endDate, floorPlanUrl: null }
}

describe('booth map availability', () => {
  it('does not offer a floor-plan action when the selected visit has no booth number', () => {
    expect(hasMappableLocation(participant([location(null)]), '2026-10-10', '')).toBe(false)
  })

  it('keeps the floor-plan action for a numbered booth on the selected visit', () => {
    expect(hasMappableLocation(participant([location('B-12')]), '2026-10-10', '')).toBe(true)
  })

  it('does not reuse a booth number from another date', () => {
    expect(hasMappableLocation(participant([location('B-12', '2026-10-11', '2026-10-11')]), '2026-10-10', '')).toBe(false)
  })
})
