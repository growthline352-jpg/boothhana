import { describe, expect, it } from 'vitest'
import { boothListReturn, boothVisit, eventSection } from './detailNavigation'
import type { EventData } from '../collection/api'
import type { PublicParticipant } from './api'

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

const event = { occurrences: [{ startDate: '2026-10-24', endDate: '2026-10-25' }] } as EventData
const booth = { participant: { locations: [{ startDate: '2026-10-25', endDate: '2026-10-25', status: 'ASSIGNED', code: 'A1', hall: '1홀' }] } } as PublicParticipant

describe('booth visit context', () => {
  it('opens a direct link on the booth attendance day instead of the first event day', () => {
    expect(boothVisit(new URLSearchParams(), event, booth, '2026-10-04').day).toBe('2026-10-25')
  })
  it('keeps an explicitly selected valid day, even when the booth attends another day', () => {
    expect(boothVisit(new URLSearchParams('day=2026-10-24'), event, booth, '2026-10-04').day).toBe('2026-10-24')
  })
  it('does not treat inferred event dates as evidence of booth attendance', () => {
    const unknown = { participant: { locations: [{ ...booth.participant.locations[0], dateEvidence: 'EVENT_PERIOD' }] } } as unknown as PublicParticipant
    expect(boothVisit(new URLSearchParams(), event, unknown, '2026-10-04').day).toBe('2026-10-24')
  })
  it('returns to the booth list with current visit context and original search filters', () => {
    const path = boothListReturn('/discover/6?view=map&focus=9&q=cat&my=saved&day=2026-10-24&hall=old', '2026-10-25', '')
    const params = new URLSearchParams(path.split('?')[1])
    expect(params.get('section')).toBe('booths')
    expect(params.get('day')).toBe('2026-10-25')
    expect(params.get('q')).toBe('cat')
    expect(params.get('my')).toBe('saved')
    expect(params.has('hall') || params.has('focus') || params.has('view')).toBe(false)
  })
})
