import type { PublicEventSummary } from '../catalog/api'
import type { BrowseState } from './browse'
import { categories } from './categories'

export function calendarMonth(value: string | null, today: string): string {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1000 && Number(value.slice(0, 4)) <= 9998 ? value : today.slice(0, 7)
}
export function shiftMonth(month: string, delta: number): string {
  const date = new Date(`${month}-01T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + delta)
  return date.toISOString().slice(0, 7)
}
export function monthRange(month: string) {
  const date = new Date(`${month}-01T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + 1, 0)
  return { from: `${month}-01`, to: date.toISOString().slice(0, 10) }
}
export function monthDays(month: string): { day: string; inMonth: boolean }[] {
  const date = new Date(`${month}-01T12:00:00Z`)
  date.setUTCDate(1 - date.getUTCDay())
  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(date)
    value.setUTCDate(value.getUTCDate() + index)
    const day = value.toISOString().slice(0, 10)
    return { day, inMonth: day.startsWith(`${month}-`) }
  })
}
export function calendarApiParams(state: BrowseState, month: string): URLSearchParams {
  const range = monthRange(month)
  const params = new URLSearchParams({ category: state.category.code, sort: 'DATE_ASC', from: range.from, to: range.to })
  if (state.q) params.set('q', state.q)
  if (state.region) params.set('region', state.region)
  if (state.region==='SEOUL'&&state.areas) params.set('areas', state.areas)
  if (state.subcategory) params.set('subcategory', state.subcategory)
  return params
}
export function calendarEventsByDay(rows: PublicEventSummary[], month: string): Map<string, PublicEventSummary[]> {
  const days = monthDays(month).filter(value => value.inMonth)
  const result = new Map<string, PublicEventSummary[]>()
  for (const { day } of days) {
    const unique = new Map<number, PublicEventSummary>()
    for (const row of rows) if (row.event.occurrences.some(occurrence => occurrence.startDate <= day && occurrence.endDate >= day)) unique.set(row.id, row)
    result.set(day, [...unique.values()])
  }
  return result
}

const dayMilliseconds = 86_400_000
function dayNumber(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const time = Date.parse(`${day}T12:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day ? Math.floor(time / dayMilliseconds) : null
}
function dayString(day: number): string { return new Date(day * dayMilliseconds).toISOString().slice(0, 10) }

/** Merge only overlapping or adjacent actual occurrences, leaving non-event days empty. */
export function calendarEventRanges(row: PublicEventSummary): { from: string; to: string }[] {
  const intervals = row.event.occurrences.flatMap(occurrence => {
    const from = dayNumber(occurrence.startDate), to = dayNumber(occurrence.endDate)
    return from !== null && to !== null && from <= to ? [{ from, to }] : []
  }).sort((a, b) => a.from - b.from || a.to - b.to)
  const merged: { from: number; to: number }[] = []
  for (const interval of intervals) {
    const last = merged.at(-1)
    if (last && interval.from <= last.to + 1) last.to = Math.max(last.to, interval.to)
    else merged.push({ ...interval })
  }
  return merged.map(interval => ({ from: dayString(interval.from), to: dayString(interval.to) }))
}

export const calendarTones = ['blue', 'lilac', 'sage', 'rose', 'amber'] as const
export function calendarTone(subcategory: string): typeof calendarTones[number] | 'neutral' {
  const category = categories.find(value => value.filters.some(filter => filter.value === subcategory && filter.value))
  const index = category?.filters.filter(filter => filter.value).findIndex(filter => filter.value === subcategory) ?? -1
  return index >= 0 ? calendarTones[index % calendarTones.length] : 'neutral'
}

export interface CalendarSegment {
  key: string; row: PublicEventSummary; from: string; to: string
  column: number; span: number; lane: number; continuesBefore: boolean; continuesAfter: boolean
}
export interface CalendarWeek {
  days: ReturnType<typeof monthDays>; segments: CalendarSegment[]; laneCount: number; hiddenCounts: number[]
}

/** One bar per actual date span/week. Overlaps occupy separate lanes, never cover each other. */
export function calendarWeeks(rows: PublicEventSummary[], month: string, visibleLanes = 3): CalendarWeek[] {
  const cells = monthDays(month), range = monthRange(month)
  const spans = [...new Map(rows.map(row => [row.id, row])).values()].flatMap(row => calendarEventRanges(row)
    .filter(interval => interval.from <= range.to && interval.to >= range.from)
    .map(interval => ({ ...interval, row, key: `${row.id}:${interval.from}:${interval.to}` })))
  const previousLanes = new Map<string, number>()
  return Array.from({ length: 6 }, (_, index) => {
    const days = cells.slice(index * 7, index * 7 + 7)
    const first = days.find(day => day.inMonth)?.day, last = days.findLast(day => day.inMonth)?.day
    const candidates = first && last ? spans.filter(interval => interval.from <= last && interval.to >= first)
      .map(interval => {
        const from = interval.from < first ? first : interval.from, to = interval.to > last ? last : interval.to
        const column = days.findIndex(day => day.day === from) + 1, endColumn = days.findIndex(day => day.day === to) + 1
        return { ...interval, from, to, column, span: endColumn - column + 1, continuesBefore: interval.from < from, continuesAfter: interval.to > to }
      }).sort((a, b) => a.column - b.column || b.span - a.span || a.row.id - b.row.id) : []
    const laneEnds: number[] = [], hiddenCounts = days.map(() => 0)
    const allSegments = candidates.map(segment => {
      const previous = previousLanes.get(segment.key)
      let lane = previous !== undefined && previous < visibleLanes && (laneEnds[previous] ?? 0) < segment.column ? previous : laneEnds.findIndex(end => (end ?? 0) < segment.column)
      if (lane < 0) lane = laneEnds.length
      laneEnds[lane] = segment.column + segment.span - 1
      previousLanes.set(segment.key, lane)
      if (lane >= visibleLanes) for (let day = segment.column - 1; day < segment.column - 1 + segment.span; day++) hiddenCounts[day]++
      return { ...segment, lane }
    })
    return { days, segments: allSegments.filter(segment => segment.lane < visibleLanes), laneCount: Math.min(visibleLanes, laneEnds.length), hiddenCounts }
  }).filter(week => week.days.some(day => day.inMonth))
}

export function calendarSelectedEvent(rows: PublicEventSummary[], day: string, value: string | null): PublicEventSummary | undefined {
  if (!value || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) return undefined
  return rows.find(row => row.id === Number(value) && calendarEventRanges(row).some(interval => interval.from <= day && interval.to >= day))
}
