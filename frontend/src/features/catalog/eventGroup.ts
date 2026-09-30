import type { PublicEvent, PublicEventSummary } from './api'

// The two published days have independent booth rosters and floorplans. Keep
// their source IDs intact while presenting this edition as one public event.
export const DFESTA_SATURDAY_ID = 1
export const DFESTA_SUNDAY_ID = 7
export const DFESTA_SUNDAY = '2026-10-04'

export function isDfestaDay(id: number | string, name: string) {
  return (Number(id) === DFESTA_SATURDAY_ID || Number(id) === DFESTA_SUNDAY_ID)
    && /^제35회 디\. 페스타 \((토요일|일요일)\)$/.test(name)
}

export function combineDfesta(saturday: PublicEvent, sunday: PublicEvent): PublicEvent {
  if (!isDfestaDay(saturday.id, saturday.event.name) || !isDfestaDay(sunday.id, sunday.event.name)
      || saturday.id !== DFESTA_SATURDAY_ID || sunday.id !== DFESTA_SUNDAY_ID) return saturday
  return {
    ...saturday,
    event: {
      ...saturday.event,
      name: '제35회 디. 페스타',
      occurrences: [...saturday.event.occurrences, ...sunday.event.occurrences],
    },
  }
}

export function combineDfestaSummaries(rows: PublicEventSummary[]): PublicEventSummary[] {
  const saturday = rows.find(row => row.id === DFESTA_SATURDAY_ID && isDfestaDay(row.id, row.event.name))
  const sunday = rows.find(row => row.id === DFESTA_SUNDAY_ID && isDfestaDay(row.id, row.event.name))
  return rows.flatMap(row => {
    if (!isDfestaDay(row.id, row.event.name)) return [row]
    if (saturday && row.id === DFESTA_SUNDAY_ID) return []
    return [{
      ...row,
      id: DFESTA_SATURDAY_ID,
      participantCount: saturday && sunday ? saturday.participantCount + sunday.participantCount : row.participantCount,
      event: {
        ...row.event,
        name: '제35회 디. 페스타',
        occurrences: saturday && sunday
          ? [...saturday.event.occurrences, ...sunday.event.occurrences]
          : row.event.occurrences,
      },
    }]
  })
}
