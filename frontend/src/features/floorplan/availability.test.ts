import { describe, expect, it } from 'vitest'
import type { PublicEvent } from '../catalog/api'
import type { PublicPlan } from './api'
import { hasFloorplanContent } from './availability'

const event: PublicEvent = {
  id: 101, mode: 'INFO_ONLY', participants: [], assets: [], publishedAt: '',
  event: { name: '행사', subcategory: 'POPUP_EXPERIENCE', organizer: '', edition: '', region: 'SEOUL',
    venueName: '전시장', address: '', description: '', admission: '', subjects: [],
    occurrences: [{ startDate: '2026-10-10', endDate: '2026-10-10', startTime: null, endTime: null }],
    sources: [], banners: [], warnings: [] },
}
const asset = { id: 91, participantId: null, productId: null, type: 'FLOOR_PLAN',
  url: 'https://example.com/map.png', attribution: 'https://example.com/map', caption: null, credit: '주최자' }

describe('published floorplan availability', () => {
  it('does not count an event poster as a floorplan', () => {
    expect(hasFloorplanContent(event, { plans: [], managedAssetIds: [] })).toBe(false)
    expect(hasFloorplanContent({ ...event, assets: [{ ...asset, type: 'BANNER' }] }, { plans: [], managedAssetIds: [] })).toBe(false)
  })
  it('keeps official map links and available original images even without booths', () => {
    expect(hasFloorplanContent({ ...event, event: { ...event.event, discoveryLinks: [{ kind: 'FLOOR_PLAN', url: asset.attribution, status: 'PUBLISHED', note: '' }] } }, null)).toBe(true)
    expect(hasFloorplanContent({ ...event, assets: [asset] }, { plans: [], managedAssetIds: [] })).toBe(true)
  })
  it('counts a ready managed plan without resurrecting a withdrawn source image', () => {
    const plan = { state: 'READY' } as PublicPlan
    expect(hasFloorplanContent(event, { plans: [plan], managedAssetIds: [asset.id] })).toBe(true)
    expect(hasFloorplanContent({ ...event, assets: [asset] }, { plans: [{ ...plan, state: 'UNAVAILABLE' }], managedAssetIds: [asset.id] })).toBe(false)
  })
  it('keeps the existing schematic based on published assigned booth numbers', () => {
    const participants: PublicEvent['participants'] = [{ id: 1001, sales: null, participant: {
      sourceEntryId: null, registrationName: '부스', kind: 'BOOTH', members: [], subjects: [],
      officialLinks: [], sources: [], images: [], warnings: [], locations: [{ status: 'ASSIGNED', code: 'A1',
        hall: '1관', zone: null, startDate: '2026-10-10', endDate: '2026-10-10', floorPlanUrl: null, dateEvidence: 'DECLARED' }],
    } }]
    expect(hasFloorplanContent({ ...event, participants }, { plans: [], managedAssetIds: [] })).toBe(true)
  })
})
