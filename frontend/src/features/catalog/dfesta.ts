import type { PublicEvent, PublicEventSummary } from './api'

/** This edition was collected as two day-specific records with separate booth maps. */
export const DFESTA_MAIN_ID = 1
export const DFESTA_SUNDAY_ID = 7
export const DFESTA_SUNDAY = '2026-10-04'
const name = '제35회 디. 페스타'
const days = [
  { startDate: '2026-10-03', endDate: '2026-10-03', startTime: '11:00', endTime: '16:00' },
  { startDate: DFESTA_SUNDAY, endDate: DFESTA_SUNDAY, startTime: '11:00', endTime: '16:00' },
]

export function isDfestaEdition(id: number, title: string) {
  return (id === DFESTA_MAIN_ID || id === DFESTA_SUNDAY_ID) && /^제35회 디\.\s*페스타/.test(title)
}

export function combineDfesta(saturday: PublicEvent, sunday: PublicEvent): PublicEvent {
  if (!isDfestaEdition(saturday.id, saturday.event.name) || !isDfestaEdition(sunday.id, sunday.event.name)) return saturday
  const sources = [...saturday.event.sources, ...sunday.event.sources]
  const seen = new Set<string>()
  return {
    ...saturday,
    event: {
      ...saturday.event,
      name,
      occurrences: [...saturday.event.occurrences, ...sunday.event.occurrences],
      description: '10월 3일(토)·4일(일) SETEC에서 열리는 제35회 디. 페스타입니다. 요일마다 참가 부스가 달라 부스 탭에서 날짜를 선택해 확인할 수 있습니다. 참가 명단과 배치도는 주최 측 공지에 따라 변경될 수 있습니다.',
      sources: sources.filter(source => { if (seen.has(source.url)) return false; seen.add(source.url); return true }),
      warnings: [...new Set([...saturday.event.warnings, ...sunday.event.warnings])],
      discoveryLinks: [...(saturday.event.discoveryLinks || []), ...(sunday.event.discoveryLinks || [])],
    },
    participants: [...saturday.participants, ...sunday.participants],
    assets: [...saturday.assets, ...sunday.assets],
  }
}

export function combineDfestaSummaries(rows: PublicEventSummary[]): PublicEventSummary[] {
  const main = rows.find(row => row.id === DFESTA_MAIN_ID && isDfestaEdition(row.id, row.event.name))
  const sunday = rows.find(row => row.id === DFESTA_SUNDAY_ID && isDfestaEdition(row.id, row.event.name))
  return rows.flatMap(row => {
    if (!isDfestaEdition(row.id, row.event.name)) return [row]
    if (row.id === DFESTA_SUNDAY_ID && main) return []
    const selected = main || sunday || row
    return [{ ...selected, id: DFESTA_MAIN_ID, event: { ...selected.event, name, occurrences: days },
      participantCount: main && sunday ? main.participantCount + sunday.participantCount : 0 }]
  })
}
