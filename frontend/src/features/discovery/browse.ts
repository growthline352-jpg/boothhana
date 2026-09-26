import type { Occurrence } from '../collection/api'
import { getCategory, type DiscoveryCategory } from './categories'
export type Period = 'upcoming' | 'week' | 'month' | 'all' | 'weekend' | 'nextmonth' | 'custom'
export interface BrowseState { category: DiscoveryCategory; q: string; region: string; subcategory: string; period: Period; sort: 'date' | 'recent'; page: number; from?: string; to?: string; dateError?: string }
export function parseBrowse(params: URLSearchParams): BrowseState {
  const category = getCategory(params.get('category'))
  const subcategory = params.get('type') || ''
  const rawPage = params.get('page') || '0'
  const p = params.get('period')
  return { category, region: ['SEOUL','GYEONGGI'].includes(params.get('region') || '') ? params.get('region')! : '', q: (params.get('q') || '').trim().slice(0, 100),
    subcategory: category.filters.some(f => f.value === subcategory) ? subcategory : '',
    period: ['week','month','all','weekend','nextmonth','custom'].includes(p || '') ? p as Period : 'upcoming',
    from: params.get('from') || '', to: params.get('to') || '',
    dateError: p==='custom' ? rangeError(params.get('from') || '', params.get('to') || '') : '',
    sort: params.get('sort') === 'recent' ? 'recent' : 'date',
    page: /^\d+$/.test(rawPage) && Number(rawPage) <= 100000 ? Number(rawPage) : 0 }
}
export function seoulToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-')
}
export function periodRange(period: Period, today: string, from = '', to = ''): { from: string; to: string } {
  if (period === 'custom') return rangeError(from,to) ? { from:'',to:'' } : {from,to}
  if (period === 'all') return { from: '', to: '' }
  const date = new Date(`${today}T00:00:00Z`)
  if (period === 'weekend') {
    const weekday=date.getUTCDay();date.setUTCDate(date.getUTCDate()+(weekday===0?0:(6-weekday+7)%7));
    const first=date.toISOString().slice(0,10); if(weekday!==0) date.setUTCDate(date.getUTCDate()+1)
    return {from:first,to:date.toISOString().slice(0,10)}
  }
  if (period === 'nextmonth') {
    date.setUTCMonth(date.getUTCMonth()+1,1);const first=date.toISOString().slice(0,10)
    date.setUTCMonth(date.getUTCMonth()+1,0);return {from:first,to:date.toISOString().slice(0,10)}
  }
  if (period === 'week') { date.setUTCDate(date.getUTCDate() + 6); return { from: today, to: date.toISOString().slice(0, 10) } }
  if (period === 'month') {
    date.setUTCMonth(date.getUTCMonth() + 1, 0)
    return { from: today, to: date.toISOString().slice(0, 10) }
  }
  return { from: today, to: '' }
}
export function browseApiParams(state: BrowseState, today: string): URLSearchParams {
  const range = periodRange(state.period, today, state.from, state.to)
  const params = new URLSearchParams({ page: String(state.page), size: '20', category: state.category.code,
    sort: state.sort === 'recent' ? 'RECENT' : 'DATE_ASC' })
  if (state.region) params.set('region', state.region)
  if (state.q) params.set('q', state.q)
  if (state.subcategory) params.set('subcategory', state.subcategory)
  if (range.from) params.set('from', range.from)
  if (range.to) params.set('to', range.to)
  return params
}
export function eventSchedule(occurrences: Occurrence[], today: string): { label: string; state: 'upcoming' | 'today' | 'past' | 'unknown' } {
  if (!occurrences.length) return { label: '일정 확인 필요', state: 'unknown' }
  if (occurrences.some(o => o.startDate <= today && o.endDate >= today)) return { label: '오늘 운영일', state: 'today' }
  if (occurrences.some(o => o.startDate > today)) return { label: '개최 예정', state: 'upcoming' }
  return { label: '일정 종료', state: 'past' }
}
export function dateLabel(value: string): string {
  const d = new Date(`${value}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? '날짜 미확인' : new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' }).format(d)
}
export function occurrenceLabel(o: Occurrence): string {
  return o.startDate === o.endDate ? dateLabel(o.startDate) : `${dateLabel(o.startDate)} – ${dateLabel(o.endDate)}`
}

/** Select display dates without modifying or coalescing the source's discrete operating days. */
export function cardOccurrences(occurrences: Occurrence[], today: string, period: Period = 'all', limit = 3, from = '', to = '') {
  const range = periodRange(period, today, from, to)
  const sorted = [...occurrences].sort((a, b) => a.startDate.localeCompare(b.startDate)
    || (a.startTime || '').localeCompare(b.startTime || '') || a.endDate.localeCompare(b.endDate))
  const past = sorted.filter(o => o.endDate < today)
  // In all-period browsing, forthcoming dates take priority; entirely past events show their latest days.
  const candidates = period === 'all'
    ? (sorted.some(o => o.endDate >= today) ? sorted.filter(o => o.endDate >= today) : [...past].reverse())
    : sorted.filter(o => (!range.from || o.endDate >= range.from) && (!range.to || o.startDate <= range.to))
  const count = Math.max(1, Math.min(3, Math.trunc(limit) || 3))
  return {
    shown: candidates.slice(0, count),
    additional: Math.max(0, candidates.length - count),
    omittedPast: period === 'all' && candidates.some(o => o.endDate >= today) ? past.length : 0,
  }
}

export function rangeError(from:string,to:string) {
  const valid=(v:string)=>{const d=new Date(`${v}T12:00:00Z`);return /^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v}
  if(!valid(from)||!valid(to))return '시작일과 종료일을 선택해 주세요.'
  if(from>to)return '종료일은 시작일보다 빠를 수 없어요.'
  return ''
}

export function periodLabel(period: Period, from = '', to = ''): string {
  if (period === 'custom') return rangeError(from, to) ? '날짜 선택 · 확인 필요' : `${from} ~ ${to}`
  return ({ upcoming: '오늘 이후', week: '앞으로 7일', month: '이번 달 남은 일정', all: '전체 기간',
    weekend: '이번 주말', nextmonth: '다음 달' } as const)[period]
}
