export type PlaceKind = 'popup' | 'exhibition' | 'festival' | 'cafe' | 'food' | 'walk' | 'custom' | 'subculture'
export const kindLabels: Record<PlaceKind, string> = { popup: '팝업', exhibition: '박람회', festival: '축제', cafe: '카페', food: '식사', walk: '산책', custom: '직접 추가', subculture: '서브컬처' }
export type Hours = { from: string; to: string; open: string | null; close: string | null }
export interface Place {
  id: string; name: string; kind: PlaceKind; area: string; address: string; description: string
  image: string; tags: string[]; coordinates?: [number, number]; hours: Hours[]
  duration: number; cost: number | null; indoor: boolean | null; booking: string
  source: 'sample' | 'catalog' | 'custom'; eventId?: number; sourceUrl?: string; admission?: string
  state?: string
}
export interface Stop { id: string; place: Place; duration: number; travel: number | null; fixed: string; note: string; done: boolean }
export interface Plan { id: string; title: string; day: string; start: string; end: string; stops: Stop[]; updatedAt: string }
export interface OutingsState { version: 1; plans: Plan[]; activeId: string; saved: Place[] }
export const storageKey = 'boothhana.outings.local.v1'
export function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
export function weekend(day = today()) { const d = new Date(day + 'T12:00:00Z'); const w = d.getUTCDay(); d.setUTCDate(d.getUTCDate() + (w === 0 ? 0 : (6 - w + 7) % 7)); return d.toISOString().slice(0, 10) }
export function validDate(day: string) { const d = new Date(day + 'T12:00:00Z'); return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === day }
export function validTime(time: string) { return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) }
export function minutes(time: string) { const [h, m] = time.split(':').map(Number); return h * 60 + m }
export function clock(minute: number | null) { return minute === null ? '시간 미정' : `${minute >= 1440 ? '다음 날 ' : ''}${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}` }
export function dayLabel(day: string) { return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' }).format(new Date(day + 'T12:00:00Z')) }
export function money(value: number) { return value.toLocaleString('ko-KR') + '원' }
export function newPlan(day = weekend()): Plan { return { id: crypto.randomUUID(), title: '함께 보내는 하루', day, start: '', end: '', stops: [], updatedAt: new Date().toISOString() } }
export function freshState(): OutingsState { return { version: 1, plans: [], activeId: '', saved: [] } }
export function planGroups(plans: Plan[], day = today()) {
  const example = (plan: Plan) => plan.stops.length > 0 && plan.stops.every(stop => stop.place.source === 'sample')
  return [
    { id: 'upcoming', title: '다가오는 일정', plans: plans.filter(plan => !example(plan) && plan.day >= day).sort((a, b) => a.day.localeCompare(b.day)) },
    { id: 'past', title: '지난 일정', plans: plans.filter(plan => !example(plan) && plan.day < day).sort((a, b) => b.day.localeCompare(a.day)) },
    { id: 'examples', title: '체험용 일정', plans: plans.filter(example).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) },
  ].filter(group => group.plans.length > 0)
}
export function newStop(place: Place): Stop { return { id: crypto.randomUUID(), place, duration: place.duration, travel: null, fixed: '', note: '', done: false } }
export function availability(place: Place, day: string): 'open' | 'closed' | 'unknown' {
  if (['CANCELED', 'POSTPONED'].includes(place.state || '')) return 'closed'
  if (!place.hours.length) return 'unknown'
  return place.hours.some(h => h.from <= day && h.to >= day) ? 'open' : 'closed'
}
export function schedule(plan: Plan) {
  let cursor: number | null = plan.start ? minutes(plan.start) : null, uncertain = !plan.start
  return plan.stops.map((stop, index) => {
    const alerts: string[] = [], arrival: number | null = cursor === null || (index > 0 && stop.travel === null) ? null : cursor + (index ? stop.travel ?? 0 : 0)
    if (index && stop.travel === null) { uncertain = true; alerts.push('이전 장소에서 이동시간을 입력해 주세요') }
    const fixed = stop.fixed ? minutes(stop.fixed) : null
    if (fixed !== null && arrival !== null && fixed < arrival) alerts.push('앞 일정과 고정 시간이 겹쳐요')
    const start: number | null = fixed === null ? arrival : arrival === null ? fixed : Math.max(arrival, fixed), end: number | null = start === null ? null : start + stop.duration
    const status = availability(stop.place, plan.day)
    if (status === 'closed') alerts.push('선택한 날짜에는 운영하지 않거나 취소·연기된 행사예요')
    if (status === 'unknown') alerts.push('운영일 확인이 필요해요')
    const hours = stop.place.hours.filter(h => h.from <= plan.day && h.to >= plan.day)
    if (hours.length && !hours.some(h => h.open && h.close)) alerts.push('운영시간이 아직 확인되지 않았어요')
    else if (start !== null && end !== null && hours.length && !hours.some(h => h.open && h.close && minutes(h.open) <= start && end <= minutes(h.close))) alerts.push('예정 방문 시간이 운영시간을 벗어나요')
    if (end !== null && plan.end && end > minutes(plan.end)) alerts.push('정해둔 하루 종료 시간을 넘어요')
    if (stop.place.booking) alerts.push(stop.place.booking)
    cursor = end
    return { stop, start, end, wait: start === null || arrival === null ? 0 : Math.max(0, start - arrival), alerts, uncertain }
  })
}
export function totals(plan: Plan) {
  const rows = schedule(plan)
  return { count: plan.stops.length, cost: plan.stops.reduce((sum, s) => sum + (s.place.cost ?? 0), 0), unknownCost: plan.stops.filter(s => s.place.cost === null).length,
    travel: plan.stops.slice(1).reduce((sum, s) => sum + (s.travel ?? 0), 0), unknownTravel: plan.stops.slice(1).filter(s => s.travel === null).length,
    alerts: rows.reduce((sum, r) => sum + r.alerts.length, 0), finish: rows.length ? rows.at(-1)!.end : plan.start ? minutes(plan.start) : null }
}
export function insertStop(plan: Plan, place: Place, index = plan.stops.length): Plan {
  const position = Math.max(0, Math.min(index, plan.stops.length))
  const stops = [...plan.stops]
  if (stops[position]) stops[position] = { ...stops[position], travel: null }
  stops.splice(position, 0, newStop(place))
  return { ...plan, stops }
}
export function suggestedStart(plan: Plan): string | null {
  const first = plan.stops[0]
  if (!first) return null
  const slot = first.place.hours.filter(h => h.from <= plan.day && h.to >= plan.day && h.open && h.close && minutes(h.close) - minutes(h.open) >= first.duration).sort((a, b) => a.open!.localeCompare(b.open!))[0]
  return slot?.open ?? null
}
export function moveStop(plan: Plan, index: number, delta: number): Plan {
  const dest = index + delta
  if (dest < 0 || dest >= plan.stops.length) return plan
  const stops = [...plan.stops], [stop] = stops.splice(index, 1); stops.splice(dest, 0, stop)
  // Incoming travel estimates no longer refer to the same legs after a reorder.
  return { ...plan, stops: stops.map((s, i) => { const previous = plan.stops.findIndex(old => old.id === s.id); return previous === i && (i === 0 || plan.stops[i - 1].id === stops[i - 1].id) ? s : { ...s, travel: null } }) }
}
export function mapLink(place: Place) { return `https://map.naver.com/p/search/${encodeURIComponent(place.address || place.name)}` }
const finite = (x: unknown, low: number, high: number): x is number => typeof x === 'number' && Number.isFinite(x) && x >= low && x <= high
const str = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max
export function validPlace(x: unknown): x is Place {
  if (!x || typeof x !== 'object') return false
  const p = x as Place
  return str(p.id, 100) && !!p.id && str(p.name, 150) && !!p.name.trim() && Object.hasOwn(kindLabels, p.kind) &&
    ['sample', 'catalog', 'custom'].includes(p.source) && str(p.area, 100) && str(p.address, 500) && str(p.description, 3000) && str(p.image, 2000) &&
    (p.image === '' || /^https?:\/\//.test(p.image) || /^\/assets\//.test(p.image)) && str(p.booking, 500) &&
    finite(p.duration, 5, 720) && Number.isInteger(p.duration) && (p.cost === null || finite(p.cost, 0, 10000000)) && [true, false, null].includes(p.indoor) &&
    Array.isArray(p.tags) && p.tags.length <= 30 && p.tags.every(t => str(t, 100)) && Array.isArray(p.hours) && p.hours.length <= 366 &&
    p.hours.every(h => h && validDate(h.from) && validDate(h.to) && h.from <= h.to && (h.open === null || validTime(h.open)) && (h.close === null || validTime(h.close))) &&
    (!p.coordinates || (Array.isArray(p.coordinates) && p.coordinates.length === 2 && finite(p.coordinates[0], -90, 90) && finite(p.coordinates[1], -180, 180))) &&
    (p.eventId === undefined || Number.isSafeInteger(p.eventId) && p.eventId > 0) && (p.sourceUrl === undefined || str(p.sourceUrl, 2000) && /^https?:\/\//.test(p.sourceUrl))
}
export function validPlan(x: unknown): x is Plan {
  if (!x || typeof x !== 'object') return false
  const p = x as Plan
  return str(p.id, 100) && !!p.id && str(p.title, 100) && validDate(p.day) && (p.start === '' || validTime(p.start)) && (p.end === '' || validTime(p.end)) && (!p.start || !p.end || p.start < p.end) &&
    str(p.updatedAt, 50) && Array.isArray(p.stops) && p.stops.length <= 30 && new Set(p.stops.map(s => s?.id)).size === p.stops.length &&
    p.stops.every(s => s && str(s.id, 100) && !!s.id && validPlace(s.place) && finite(s.duration, 5, 720) && Number.isInteger(s.duration) && (s.travel === null || finite(s.travel, 0, 360) && Number.isInteger(s.travel)) &&
      (s.fixed === '' || validTime(s.fixed)) && str(s.note, 1000) && typeof s.done === 'boolean')
}
export function readState(storage: Pick<Storage, 'getItem'>): OutingsState {
  const raw = storage.getItem(storageKey)
  if (!raw) return freshState()
  if (raw.length > 2000000) throw Error('저장된 일정이 너무 커서 불러오지 못했어요. 원본은 보존했어요.')
  const x = JSON.parse(raw) as OutingsState
  if (x?.version !== 1 || !Array.isArray(x.plans) || x.plans.length > 50 || !x.plans.every(validPlan) ||
    new Set(x.plans.map(p => p.id)).size !== x.plans.length || (x.plans.length ? !x.plans.some(p => p.id === x.activeId) : x.activeId !== '') || !Array.isArray(x.saved) || x.saved.length > 200 || !x.saved.every(validPlace)) throw Error('저장된 형식을 확인하지 못했어요. 기존 기록은 덮어쓰지 않아요.')
  return x
}
export function exportPlan(plan: Plan) { return JSON.stringify({ version: 1, plan: { ...plan, stops: plan.stops.map(s => ({ ...s, note: '', done: false })) } }, null, 2) }
export function importPlan(raw: string): Plan {
  if (raw.length > 300000) throw Error('일정 파일은 300KB 이하만 가져올 수 있어요.')
  const x = JSON.parse(raw)
  if (x?.version !== 1 || !validPlan(x.plan)) throw Error('올바른 부스하나 일정 파일이 아니에요.')
  return { ...x.plan, id: crypto.randomUUID(), title: x.plan.title.slice(0, 90) + ' (복사)', stops: x.plan.stops.map((s: Stop) => ({ ...s, id: crypto.randomUUID() })), updatedAt: new Date().toISOString() }
}
