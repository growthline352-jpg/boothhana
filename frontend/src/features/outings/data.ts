import type { PublicEventSummary } from '../catalog/api'
import { libraryApi } from '../library/api'
import { publicRead } from '../../api/client'
import { categoryForType } from '../discovery/categories'
import { GuestStore } from '../library/guestStore'
import { type Place, today } from './model'

const photo = { popup: '/assets/brand/outings/sample-popup.jpg', exhibition: '/assets/brand/outings/sample-exhibition.jpg', festival: '/assets/brand/outings/sample-festival.jpg' }
const base: Omit<Place, 'id' | 'name' | 'kind' | 'description' | 'image'> = {
  area: '성수', address: '서울 성동구 성수동 · 예시 위치', tags: [], coordinates: [37.5445, 127.055],
  hours: [{ from: '2026-10-01', to: '2026-11-30', open: '11:00', close: '20:00' }], duration: 60, cost: 0, indoor: true, booking: '', source: 'sample',
}
/** Fictional fixtures for local interaction design. Never imported into the public catalog. */
export const samples: Place[] = [
  { ...base, id: 'sample-1', name: '작은 취향 수집소', kind: 'popup', description: '문구와 소품을 구경하고, 둘만의 작은 기념품을 골라보는 팝업.', image: photo.popup, tags: ['문구·소품', '가볍게 구경', '실내'], coordinates: [37.5445, 127.055] },
  { ...base, id: 'sample-2', name: '취향을 담은 리빙 페어', kind: 'exhibition', description: '생활을 바꾸는 작은 디자인. 가구, 조명, 향을 천천히 둘러보세요.', image: photo.exhibition, tags: ['디자인', '생활·취미', '실내'], duration: 120, cost: 20000, coordinates: [37.5465, 127.058], booking: '예시 조건: 사전 예약 필요' },
  { ...base, id: 'sample-3', name: '노을 따라 가을마켓', kind: 'festival', description: '해질 무렵 시작하는 작은 공연과 먹거리. 산책 끝에 들르기 좋아요.', image: photo.festival, tags: ['음악', '먹거리', '야외'], duration: 90, indoor: false, coordinates: [37.5405, 127.046], hours: [{ ...base.hours[0], open: '16:00', close: '21:00' }] },
  { ...base, id: 'sample-4', name: '일러스트와 만나는 오후', kind: 'popup', description: '작가들의 그림과 소품을 구경하며 서로의 취향을 알아가는 시간.', image: photo.popup, tags: ['캐릭터', '아트', '실내'], area: '홍대·연남', address: '서울 마포구 연남동 · 예시 위치', coordinates: [37.5602, 126.924], cost: 10000 },
  { ...base, id: 'sample-5', name: '함께 맛보는 커피 박람회', kind: 'exhibition', description: '커피 향을 따라 시음하고, 마음에 드는 원두를 골라보세요.', image: photo.exhibition, tags: ['커피', '체험', '실내'], duration: 150, cost: 30000, area: '삼성', address: '서울 강남구 삼성동 · 예시 위치', coordinates: [37.5115, 127.059] },
  { ...base, id: 'sample-6', name: '한강 옆 작은 음악축제', kind: 'festival', description: '돗자리에서 쉬며 음악을 듣는 저녁. 따뜻한 겉옷을 챙겨보세요.', image: photo.festival, tags: ['음악', '휴식', '야외'], area: '여의도', address: '서울 영등포구 여의도동 · 예시 위치', coordinates: [37.528, 126.932], indoor: false, cost: null, duration: 120, hours: [{ ...base.hours[0], open: '17:00', close: '21:00' }] },
  { ...base, id: 'sample-7', name: '책과 종이의 작은 축제', kind: 'festival', description: '독립 출판물과 작은 이야기를 만나는 주말. 마음에 남는 문장을 찾아요.', image: photo.exhibition, tags: ['책', '아트', '실내'], area: '종로', address: '서울 종로구 삼청동 · 예시 위치', coordinates: [37.580, 126.983], duration: 90 },
  { ...base, id: 'sample-8', name: '손끝으로 만드는 공예 팝업', kind: 'popup', description: '작은 공예품을 직접 만들고 선물하는 시간. 체험은 시간 예약이 필요해요.', image: photo.popup, tags: ['만들기', '체험', '실내'], area: '종로', address: '서울 종로구 안국동 · 예시 위치', coordinates: [37.575, 126.985], cost: 40000, duration: 90, booking: '예시 조건: 체험 시간 예약 필요' },
  { ...base, id: 'sample-cafe', name: '잠깐 쉬어가는 카페', kind: 'cafe', description: '일정 사이에 쉬어가는 예시 장소예요. 실제로 갈 카페는 장소 추가로 넣어보세요.', image: '', tags: ['휴식', '대화'], cost: 14000, duration: 50, coordinates: [37.544, 127.0515] },
  { ...base, id: 'sample-food', name: '느긋한 한 끼', kind: 'food', description: '둘이 먹는 식사 시간을 위한 예시 장소예요. 실제 예약과 영업시간은 확인해 주세요.', image: '', tags: ['식사'], cost: 30000, duration: 60, coordinates: [37.546, 127.052], hours: [{ ...base.hours[0], open: '11:30', close: '21:00' }] },
  { ...base, id: 'sample-walk', name: '서울숲 산책 시간', kind: 'walk', description: '산책 시간을 넣어 하루에 여유를 남겨보세요. 위치와 시간은 체험용 예시입니다.', image: photo.festival, tags: ['산책', '휴식', '야외'], duration: 45, indoor: false, coordinates: [37.544, 127.039], hours: [{ ...base.hours[0], open: '06:00', close: '23:00' }] },
]
export function fromCatalog(row: PublicEventSummary): Place {
  const e = row.event
  const category = categoryForType(e.subcategory).key
  const kind = ({ exhibitions: 'exhibition', festivals: 'festival', popups: 'popup', subculture: 'subculture' } as const)[category]
  return { id: `catalog-${row.id}`, eventId: row.id, name: e.name.slice(0, 150), kind,
    area: e.region === 'SEOUL' ? '서울' : e.region === 'GYEONGGI' ? '경기' : e.region || '지역 미확인', address: (e.address || e.venueName || '').slice(0, 500), description: (e.description || '자세한 내용은 공개 행사 안내를 확인해 주세요.').slice(0, 3000),
    image: row.banner?.url || '', tags: e.subjects.slice(0, 5).map(t => t.slice(0, 100)), hours: e.occurrences.map(o => ({ from: o.startDate, to: o.endDate, open: o.startTime?.slice(0, 5) || null, close: o.endTime?.slice(0, 5) || null })),
    duration: 90, cost: null, indoor: null, booking: '', admission: e.admission || '입장 조건 미확인', source: 'catalog', state: e.operationStatus?.state,
    sourceUrl: e.sources.find(s => s.kind === 'OFFICIAL')?.url,
  }
}
export async function loadCatalog(signal: AbortSignal): Promise<{ places: Place[]; limited: boolean }> {
  const groups = await Promise.all(['POPUP', 'EXHIBITION', 'FESTIVAL'].map(async category => {
    const places: Place[] = []; let total = 0
    for (let page = 0; page < 10; page++) {
      const data = await publicRead<{ items: PublicEventSummary[]; total: number }>(`/api/public/catalog/events?${new URLSearchParams({ category, page: String(page), size: '100', sort: 'DATE_ASC', from: today() })}`, { signal })
      total = data.total; places.push(...data.items.map(fromCatalog))
      if (places.length >= total || !data.items.length) break
    }
    return { places, limited: places.length < total }
  }))
  return { places: [...new Map(groups.flatMap(g => g.places).map(p => [p.id, p])).values()], limited: groups.some(g => g.limited) }
}
export async function loadLegacySaved(): Promise<Place[]> {
  const rows = new GuestStore(() => localStorage).list()
  const ids = [...new Set(rows.map(r => r.target.eventId))]
  if (!ids.length) return []
  const resolved = await libraryApi.resolve(ids.map(id => ({ type: 'EVENT', eventId: id, id, participantId: null })))
  return resolved.filter(r => r.available && r.current).map(r => ({
    id: `catalog-${r.target.eventId}`, eventId: r.target.eventId, name: r.current!.memory.title, kind: 'custom', area: '', address: r.current!.venue,
    description: r.current!.memory.summary, image: r.image?.url || '', tags: [], hours: r.current!.occurrences.map(o => ({ from: o.startDate, to: o.endDate, open: o.startTime?.slice(0, 5) || null, close: o.endTime?.slice(0, 5) || null })),
    duration: 90, cost: null, indoor: null, booking: '', source: 'catalog', state: r.current!.operationState,
  }))
}
