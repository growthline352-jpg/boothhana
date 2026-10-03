import { describe, expect, it } from 'vitest'
import { eventSection } from './detailNavigation'

describe('event detail sections', () => {
  it('opens visitor information by default', () => {
    expect(eventSection(new URLSearchParams())).toBe('home')
  })
  it('keeps existing map and information links usable', () => {
    expect(eventSection(new URLSearchParams('view=map&focus=12'))).toBe('map')
    expect(eventSection(new URLSearchParams('view=info'))).toBe('home')
  })
  it('honors an explicit section before the legacy view and rejects unknown sections', () => {
    expect(eventSection(new URLSearchParams('section=booths&view=info'))).toBe('booths')
    expect(eventSection(new URLSearchParams('section=unknown&view=map'))).toBe('map')
    expect(eventSection(new URLSearchParams('section=reviews'))).toBe('reviews')
  })
})
