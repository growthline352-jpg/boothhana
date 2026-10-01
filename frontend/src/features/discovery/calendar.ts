import type { PublicEventSummary } from '../catalog/api'
import type { BrowseState } from './browse'

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
