import { describe, expect, it } from 'vitest'
import { samples } from './data'
import { availability, exportPlan, freshState, importPlan, insertStop, moveStop, newPlan, newStop, planGroups, readState, schedule, suggestedStart, totals, validPlan } from './model'

describe('local outing planning', () => {
  it('separates examples from personal plans and treats today as upcoming without changing stored dates', () => {
    const personal = { ...samples[0], source: 'custom' as const }
    const rows = [
      { ...newPlan('2026-10-23'), stops: [newStop(personal)] },
      { ...newPlan('2026-10-10'), stops: [newStop(personal)] },
      { ...newPlan('2026-10-22'), stops: [newStop(personal)] },
      { ...newPlan('2026-10-10'), stops: [newStop(samples[0])] },
    ]
    const groups = planGroups(rows, '2026-10-22')
    expect(groups.map(group => [group.id, group.plans.length])).toEqual([['upcoming', 2], ['past', 1], ['examples', 1]])
    expect(groups[0].plans.map(plan => plan.day)).toEqual(['2026-10-22', '2026-10-23'])
    expect(rows[3].day).toBe('2026-10-10')
    expect(planGroups([{ ...rows[0], stops: [newStop(personal), newStop(samples[0])] }], '2026-10-22')[0].id).toBe('upcoming')
  })
  it('starts discovery and saves favorites without creating an itinerary', () => {
    const state = freshState()
    expect(state.plans).toEqual([])
    expect(state.activeId).toBe('')
    state.saved = [samples[0]]
    expect(readState({ getItem: () => JSON.stringify(state) })).toEqual(state)
    expect(readState({ getItem: () => null }).plans).toEqual([])
  })
  const plan = () => ({ ...newPlan('2026-10-10'), start: '13:00', end: '20:00', stops: [newStop(samples[0]), newStop(samples[1]), newStop(samples[2])] })
  it('keeps unknown travel visible throughout subsequent estimated times', () => {
    const rows = schedule(plan())
    expect(rows[0].uncertain).toBe(false)
    expect(rows[1].uncertain).toBe(true)
    expect(rows[2].uncertain).toBe(true)
    expect(totals(plan()).unknownTravel).toBe(2)
  })
  it('detects fixed reservations that cannot be reached after a previous visit', () => {
    const p = plan(); p.stops[1].fixed = '13:15'; p.stops[1].travel = 30
    const row = schedule(p)[1]
    expect(row.alerts).toContain('앞 일정과 고정 시간이 겹쳐요')
    expect(row.start).toBe(14 * 60 + 30)
  })
  it('waits for fixed times rather than changing the reservation', () => {
    const p = plan(); p.stops[1].fixed = '16:00'; p.stops[1].travel = 20
    expect(schedule(p)[1].wait).toBe(100)
    expect(schedule(p)[1].start).toBe(960)
  })
  it('flags opening hours and the chosen end-of-day limit', () => {
    const p = plan(); p.end = '14:00'; p.stops.forEach(s => { s.travel = 0 })
    expect(schedule(p)[2].alerts).toContain('정해둔 하루 종료 시간을 넘어요')
    const morning = { ...newPlan('2026-10-10'), start: '09:00', stops: [newStop(samples[0])] }
    expect(schedule(morning)[0].alerts).toContain('예정 방문 시간이 운영시간을 벗어나요')
  })
  it('does not count unknown admission costs as confirmed free visits', () => {
    const p = newPlan('2026-10-10'); p.stops = [newStop(samples[5])]
    expect(totals(p)).toMatchObject({ cost: 0, unknownCost: 1 })
  })
  it('clears only affected incoming travel legs after a reorder', () => {
    const p = plan(); p.stops.forEach(s => { s.travel = 15 })
    const moved = moveStop(p, 0, 1)
    expect(moved.stops.map(s => s.place.id)).toEqual([samples[1].id, samples[0].id, samples[2].id])
    expect(moved.stops.every(s => s.travel === null)).toBe(true)
    expect(p.stops.every(s => s.travel === 15)).toBe(true)
  })
  it('checks exact operation days and excludes canceled or postponed events', () => {
    expect(availability(samples[0], '2026-12-01')).toBe('closed')
    expect(availability({ ...samples[0], state: 'CANCELED' }, '2026-10-10')).toBe('closed')
    expect(availability({ ...samples[0], hours: [] }, '2026-10-10')).toBe('unknown')
  })
  it('checks each operating interval rather than spanning a midday break', () => {
    const p = newPlan('2026-10-10'); p.start = '11:30'
    p.stops = [newStop({ ...samples[0], hours: [{ from: p.day, to: p.day, open: '09:00', close: '12:00' }, { from: p.day, to: p.day, open: '14:00', close: '18:00' }] })]
    expect(schedule(p)[0].alerts).toContain('예정 방문 시간이 운영시간을 벗어나요')
  })
  it('excludes private notes and visit history from exported plans', () => {
    const p = plan(); p.stops[0].note = 'private reservation'; p.stops[0].done = true
    const exported = exportPlan(p)
    expect(exported).not.toContain('private reservation')
    const copy = importPlan(exported)
    expect(copy.id).not.toBe(p.id); expect(copy.stops[0].id).not.toBe(p.stops[0].id)
    expect(copy.stops[0]).toMatchObject({ note: '', done: false })
  })
  it('rejects malformed and executable imported fields', () => {
    const p = plan(); p.stops[0].place = { ...p.stops[0].place, sourceUrl: 'javascript:alert(1)' }
    expect(validPlan(p)).toBe(false)
    expect(() => importPlan(JSON.stringify({ version: 1, plan: p }))).toThrow()
    expect(validPlan({ ...plan(), day: '2026-02-31' })).toBe(false)
    expect(validPlan({ ...plan(), end: '12:00' })).toBe(false)
    expect(validPlan({ ...plan(), stops: [null] })).toBe(false)
    const fractional = plan(); fractional.stops[0].duration = 30.5
    expect(validPlan(fractional)).toBe(false)
  })
  it('roundtrips the local state and does not silently replace corrupted records', () => {
    const state = freshState(); state.plans[0] = plan(); state.activeId = state.plans[0].id
    expect(readState({ getItem: () => JSON.stringify(state) })).toEqual(state)
    expect(() => readState({ getItem: () => '{bad data' })).toThrow()
    expect(() => readState({ getItem: () => JSON.stringify({ ...state, activeId: 'missing' }) })).toThrow()
  })
  it('lets users gather places before choosing a start or end time', () => {
    const p = insertStop(newPlan('2026-10-10'), samples[2])
    expect(validPlan(p)).toBe(true)
    expect(schedule(p)[0]).toMatchObject({ start: null, end: null })
    expect(schedule(p)[0].alerts).not.toContain('예정 방문 시간이 운영시간을 벗어나요')
    expect(totals(p).finish).toBeNull()
    expect(importPlan(exportPlan(p))).toMatchObject({ start: '', end: '' })
  })
  it('does not fabricate arrival times across unknown travel legs', () => {
    const p = plan()
    expect(schedule(p)[0].start).toBe(780)
    expect(schedule(p)[1].start).toBeNull()
    expect(schedule(p)[2].end).toBeNull()
    p.stops[1].travel = 20
    expect(schedule(p)[1].start).toBe(860)
  })
  it('allows reservations in an untimed course without inventing a conflict', () => {
    const p = insertStop(newPlan('2026-10-10'), samples[2]); p.stops[0].fixed = '16:00'
    expect(schedule(p)[0]).toMatchObject({ start: 960, end: 1050, wait: 0 })
    expect(schedule(p)[0].alerts).not.toContain('앞 일정과 고정 시간이 겹쳐요')
  })
  it('inserts between places and only invalidates the changed incoming leg', () => {
    const p = plan(); p.stops.forEach(s => { s.travel = 15 })
    const inserted = insertStop(p, samples[3], 1)
    expect(inserted.stops.map(s => s.place.id)).toEqual([samples[0].id, samples[3].id, samples[1].id, samples[2].id])
    expect(inserted.stops.map(s => s.travel)).toEqual([15, null, null, 15])
    expect(p.stops[1].travel).toBe(15)
  })
  it('suggests a known operating interval that fits the visit duration', () => {
    const p = insertStop(newPlan('2026-10-10'), samples[2])
    expect(suggestedStart(p)).toBe('16:00')
    p.day = '2027-01-01'
    expect(suggestedStart(p)).toBeNull()
    p.day = '2026-10-10'; p.stops[0].duration = 600
    expect(suggestedStart(p)).toBeNull()
  })
})
