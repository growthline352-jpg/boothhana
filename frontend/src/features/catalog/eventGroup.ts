import type { PublicEvent, PublicEventSummary } from './api'

function uniqueOccurrences(rows: PublicEventSummary['event']['occurrences']) {
  return rows.filter((row,i)=>rows.findIndex(other=>JSON.stringify(row)===JSON.stringify(other))===i)
    .sort((a,b)=>a.startDate.localeCompare(b.startDate)||(a.startTime||'').localeCompare(b.startTime||''))
}
/** Combine only records in the current query; a day outside the filter is not added. */
export function combineOperatingSummaries(rows:PublicEventSummary[]):PublicEventSummary[] {
  const emitted=new Set<number>()
  return rows.flatMap(row=>{
    const group=row.operatingGroup
    if(!group)return [row]
    if(emitted.has(group.rootEventId))return []
    emitted.add(group.rootEventId)
    const members=rows.filter(r=>r.operatingGroup?.rootEventId===group.rootEventId)
    const primary=members.find(r=>r.id===group.rootEventId)||members[0]
    return [{...primary,event:{...primary.event,name:group.name,occurrences:uniqueOccurrences(members.flatMap(r=>r.event.occurrences))},participantCount:members.reduce((n,r)=>n+r.participantCount,0)}]
  })
}
export function combineOperatingDetails(primary:PublicEvent,members:PublicEvent[]):PublicEvent {
  if(!primary.operatingGroup)return primary
  return {...primary,event:{...primary.event,name:primary.operatingGroup.name,occurrences:uniqueOccurrences(members.flatMap(row=>row.event.occurrences))}}
}
export function operatingEventsForDay(members:PublicEvent[],day:string) {
  return members.filter(row=>row.event.occurrences.some(d=>d.startDate<=day&&d.endDate>=day))
}
export function selectOperatingEvent(members:PublicEvent[],day:string,preferred:string|null) {
  const choices=operatingEventsForDay(members,day)
  return choices.find(row=>String(row.id)===preferred)||choices[0]||members[0]
}

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
  if(rows.some(row=>row.operatingGroup))return combineOperatingSummaries(rows)
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
