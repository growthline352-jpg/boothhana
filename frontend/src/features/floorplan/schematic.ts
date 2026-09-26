import type { EventData, PublicParticipant } from '../catalog/api'
import { normalizePlace, relevantLocations, visitDays } from '../visit/visit'
import type { PlanLink, PublicPlan, PublicShape } from './api'
import { normalizeCode } from './geometry'
import { layoutForSource } from './sourceLayouts'

type LocatedBooth = {
  code: string
  hall: string
  row: string
  number: number | null
  suffix: string
  link: PlanLink
}

const boothCode = /^([A-Z]+)[- ]?(\d+)([A-Z]?)$/

function datesFor(start: string | null, end: string | null, eventDays: string[], selectedDay: string) {
  const dates = eventDays.filter(day => (!start || day >= start) && (!end || day <= end))
  return selectedDay ? dates.filter(day => day === selectedDay) : dates
}

function parsedLocations(event: EventData, participants: PublicParticipant[], day: string, hall: string): LocatedBooth[] {
  const eventDays = visitDays(event)
  const found: LocatedBooth[] = []
  for (const participant of participants) {
    for (const location of relevantLocations(participant.participant.locations, day, hall)) {
      if (location.status !== 'ASSIGNED' || !location.code?.trim()) continue
      const code = normalizeCode(location.code)
      const match = code.match(boothCode)
      found.push({
        code,
        hall: location.hall?.trim() || '',
        row: match?.[1] || '기타',
        number: match ? Number(match[2]) : null,
        suffix: match?.[3] || '',
        link: {participantId: participant.id, dates: datesFor(location.startDate, location.endDate, eventDays, day), method: 'PUBLIC_BOOTH_CODE'},
      })
    }
  }
  return found
}

function uniqueLinks(items: LocatedBooth[]) {
  const links = new Map<number, PlanLink>()
  for (const item of items) {
    const previous = links.get(item.link.participantId)
    links.set(item.link.participantId, previous
      ? {...previous, dates: [...new Set([...previous.dates, ...item.link.dates])].sort()}
      : item.link)
  }
  return [...links.values()]
}

function sourcePlan(event: EventData, locations: LocatedBooth[], day: string, hall: string, sourceUrl: string): PublicPlan | null {
  const layout = layoutForSource(sourceUrl)
  if (!layout?.booths.length) return null
  const linkedByCode = new Map<string, LocatedBooth[]>()
  for (const item of locations) linkedByCode.set(item.code, [...(linkedByCode.get(item.code) || []), item])
  const booths = hall
    ? layout.booths.filter(booth => !booth.hall || normalizePlace(booth.hall) === normalizePlace(hall))
    : layout.booths
  if (!booths.length) return null
  const padding = 24
  const minX = Math.max(0, Math.min(...booths.map(booth => booth.x)) - padding)
  const minY = Math.max(0, Math.min(...booths.map(booth => booth.y)) - padding)
  const maxX = Math.min(layout.width, Math.max(...booths.map(booth => booth.x + booth.width)) + padding)
  const maxY = Math.min(layout.height, Math.max(...booths.map(booth => booth.y + booth.height)) + padding)
  const width = maxX - minX, height = maxY - minY
  const shapes: PublicShape[] = booths.map(booth => {
    const linked = linkedByCode.get(normalizeCode(booth.code)) || []
    const x = (booth.x - minX) / width, y = (booth.y - minY) / height
    const right = (booth.x + booth.width - minX) / width, bottom = (booth.y + booth.height - minY) / height
    return {
      id: `source-${normalizeCode(booth.code).replace(/[^A-Z0-9-]/g, '')}`,
      label: normalizeCode(booth.code),
      points: [{x, y}, {x: right, y}, {x: right, y: bottom}, {x, y: bottom}],
      status: linked.length ? 'MATCHED' : 'UNMAPPED',
      links: uniqueLinks(linked),
      issues: linked.length ? [] : ['공개된 참가 부스 정보 없음'],
    }
  })
  const days = visitDays(event)
  return {
    id: `source-schematic-${day || 'all'}-${normalizePlace(hall) || 'all'}`,
    assetId: 0,
    scope: {hall: hall || null, zone: null, dates: day ? [day] : days, title: '부스 배치 안내도'},
    state: 'READY',
    publishedAt: '',
    sourceUrl: layout.source,
    credit: layout.layoutBasis==='OFFICIAL_CODES'
      ? '공식 부스번호를 부스하나가 행·번호 순서로 자동 정리'
      : '공식 배치 좌표를 바탕으로 부스하나가 재구성',
    width: Math.round(width),
    height: Math.round(height),
    imageUrl: null,
    shapes,
    partial: true,
    schematic: true,
  }
}

/**
 * Builds a first-party schematic from published booth codes only. It deliberately
 * does not invent aisles, exits or physical distances from an organiser image.
 */
export function generateSchematicPlan(event: EventData, participants: PublicParticipant[], day: string, hall: string, sourceUrl: string): PublicPlan | null {
  const locations = parsedLocations(event, participants, day, hall)
  const sourced = sourcePlan(event, locations, day, hall, sourceUrl)
  if (sourced) return sourced
  if (!locations.length) return null

  const grouped = new Map<string, LocatedBooth[]>()
  for (const item of locations) {
    const key = `${normalizePlace(item.hall)}\u0000${item.row}\u0000${item.code}`
    grouped.set(key, [...(grouped.get(key) || []), item])
  }
  const entries = [...grouped.values()]
  const rowKeys = [...new Set(entries.map(items => `${normalizePlace(items[0].hall)}\u0000${items[0].row}`))]
    .sort((a, b) => a.localeCompare(b, 'ko', {numeric: true}))
  const rowIndex = new Map(rowKeys.map((key, index) => [key, index]))
  const numbered = entries.filter(items => items[0].number !== null)
  const maxNumber = Math.max(1, ...numbered.map(items => items[0].number!))
  const fallback = entries.filter(items => items[0].number === null)
  const xMargin = .035, yMargin = .035
  const usableWidth = 1 - xMargin * 2, usableHeight = 1 - yMargin * 2
  const slots = maxNumber * 2
  const slotWidth = usableWidth / Math.max(1, slots)
  const rowHeight = usableHeight / Math.max(1, rowKeys.length)
  const insetX = Math.min(.002, slotWidth * .12), insetY = Math.min(.004, rowHeight * .12)

  const shapes: PublicShape[] = entries.map((items, fallbackIndex) => {
    const item = items[0]
    const y = yMargin + (rowIndex.get(`${normalizePlace(item.hall)}\u0000${item.row}`) || 0) * rowHeight + insetY
    let x: number, width: number
    if (item.number !== null) {
      const base = (item.number - 1) * 2
      const suffixOffset = item.suffix ? Math.max(0, Math.min(1, item.suffix.charCodeAt(0) - 65)) : 0
      x = xMargin + (base + suffixOffset) * slotWidth + insetX
      width = slotWidth * (item.suffix ? 1 : 2) - insetX * 2
    } else {
      const column = fallback.indexOf(items)
      width = usableWidth / Math.max(1, fallback.length) - insetX * 2
      x = xMargin + column * (usableWidth / Math.max(1, fallback.length)) + insetX
    }
    const height = rowHeight - insetY * 2
    return {
      id: `schematic-${fallbackIndex}-${item.code.replace(/[^A-Z0-9-]/g, '')}`,
      label: item.code,
      points: [{x, y}, {x: x + width, y}, {x: x + width, y: y + height}, {x, y: y + height}],
      status: 'MATCHED',
      links: uniqueLinks(items),
      issues: [],
    }
  })
  const days = visitDays(event)
  return {
    id: `schematic-${day || 'all'}-${normalizePlace(hall) || 'all'}`,
    assetId: 0,
    scope: {hall: hall || null, zone: null, dates: day ? [day] : days, title: '부스번호 자동 안내도'},
    state: 'READY',
    publishedAt: '',
    sourceUrl,
    credit: '부스하나 · 공개된 부스번호 기준 자동 배치',
    width: 1440,
    height: Math.max(720, rowKeys.length * 86 + 100),
    imageUrl: null,
    shapes,
    partial: true,
    schematic: true,
  }
}
