import { describe, expect, it } from 'vitest'
import type { Location, PublicAsset, PublicParticipant } from './api'
import { boothDetailImages, hasMappableLocation } from './BoothDetail.utils'

function asset(id: number, type: string, productId: number | null = null): PublicAsset {
  return { id, type, participantId: 5366, productId, url: `https://images.example.com/${id}.webp`, caption: '공식 안내', attribution: '공식 게시물', credit: 'LUDIA' }
}

describe('published booth images', () => {
  it('shows collected official introduction and timetable images without relabeling them as booth cuts', () => {
    expect(boothDetailImages([asset(1, 'BANNER'), asset(2, 'BANNER')]).map(image => image.id)).toEqual([1, 2])
  })

  it('does not show an event-wide banner as a booth announcement', () => {
    expect(boothDetailImages([{ ...asset(1, 'BANNER'), participantId: null }])).toEqual([])
  })

  it('keeps existing booth-cut, logo and sale-sheet priority', () => {
    expect(boothDetailImages([asset(4, 'BANNER'), asset(3, 'SALES_SHEET'), asset(2, 'LOGO'), asset(1, 'BOOTH_CUT')]).map(image => image.id)).toEqual([1, 2, 3])
  })

  it('does not substitute a product or a floor plan for the booth introduction', () => {
    expect(boothDetailImages([asset(1, 'BANNER', 3061), asset(2, 'PRODUCT'), asset(3, 'FLOOR_PLAN')])).toEqual([])
  })
})

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
