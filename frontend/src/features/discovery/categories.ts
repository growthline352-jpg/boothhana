import { eventTypeOptions, taxonomyFields } from '../interests/taxonomy'
import { categoryHome } from '../../../seo/category-sites.mjs'
import { categorySitesActive, currentSiteCategory, currentSiteOrigin, isLocalPreview } from './site'
/** v18: explicit taxonomy shared with collector/backend. Do not classify by names. */
export type CategoryKey = 'subculture' | 'exhibitions' | 'festivals' | 'popups'
export interface DiscoveryCategory {
  key: CategoryKey; code: 'SUBCULTURE' | 'EXHIBITION' | 'FESTIVAL' | 'POPUP'; label: string
  eyebrow: string; title: string; emphasis: string; description: string; searchHint: string
  enabled: boolean; icon: 'sparkles' | 'building' | 'festival'; filters: { value: string; label: string }[]
}
export const categories: readonly DiscoveryCategory[] = [
  { key: 'subculture', code: 'SUBCULTURE', label: '서브컬처', eyebrow: '취향으로 이어지는 오프라인 만남',
    title: '취향이 모이는 곳,', emphasis: '다음 만남을 발견하세요.',
    description: '서울·경기 서브컬처 행사와 참가 서클, 부스 위치와 판매 굿즈까지.\n현재 검토·공개된 정보로 방문을 준비하세요.',
    searchHint: '행사명, 장소, 작품·캐릭터 키워드로 찾아보세요', enabled: true, icon: 'sparkles',
    filters: eventTypeOptions('SUBCULTURE') },
  { key: 'exhibitions', code: 'EXHIBITION', label: '박람회', eyebrow: '관심 분야의 새로운 발견',
    title: '새로운 관심사와', emphasis: '브랜드를 만나는 시간.',
    description: '서울·경기 박람회와 참가 브랜드·제품을 살펴보세요.\n검토·공개된 정보만 제공하며 미수집 정보는 별도로 확인하세요.',
    searchHint: '박람회명, 전시장, 관심 분야로 찾아보세요', enabled: true, icon: 'building',
    filters: eventTypeOptions('EXHIBITION') },
  { key: 'festivals', code: 'FESTIVAL', label: '축제', eyebrow: '도시에서 만나는 특별한 하루',
    title: '익숙한 도시에서', emphasis: '특별한 하루를 만나세요.',
    description: '서울·경기 축제와 공개된 참가·체험 부스를 찾아보세요.\n시간표·현장 변경사항은 공식 안내를 확인하세요.',
    searchHint: '축제명, 장소, 즐길 거리로 찾아보세요', enabled: true, icon: 'festival',
    filters: eventTypeOptions('FESTIVAL') },
  { key: 'popups', code: 'POPUP', label: '팝업', eyebrow: '잠깐 열리는 새로운 공간',
    title: '캐릭터와 브랜드를', emphasis: '가까이 만나는 시간.',
    description: '서울·경기 팝업스토어와 체험·전시형 팝업을 찾아보세요.\n일정과 장소, 예약 정보를 확인하고 방문을 준비하세요.',
    searchHint: '팝업명, 브랜드, 장소로 찾아보세요', enabled: true, icon: 'building',
    filters: eventTypeOptions('POPUP') },
]
export function getCategory(value: string | null | undefined): DiscoveryCategory {
  return categories.find(c => c.key === value) ?? categories[0]
}
export function categoryHref(key: CategoryKey) {
  return isLocalPreview() ? `/?category=${key}` : categoryHome(key, currentSiteOrigin(), categorySitesActive())
}
export function categoryEventHref(key: CategoryKey, eventId: number) {
  const home = categoryHref(key)
  return home.startsWith('https://') ? `${new URL(home).origin}/discover/${eventId}` : `/discover/${eventId}`
}
export function activeCategory(pathname: string, search: string): CategoryKey | null {
  if (pathname === '/popups' || pathname === '/popups/') return 'popups'
  if (pathname === '/' || pathname === '/discover' || pathname === '/discover/')
    return currentSiteCategory() || (categorySitesActive() && pathname === '/' && !search ? null : getCategory(new URLSearchParams(search).get('category')).key)
  // Detail category comes from the published event, never a user-supplied query.
  if (/^\/discover\/\d+\/?$/.test(pathname)) return null
  return null
}
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string') return categoryHref('subculture')
  try {
    const u = new URL(value, 'https://boothhana.invalid')
    const subculturePath=/^\/subculture(?:\/(?:search|following|(?:subjects|creators|products)(?:\/[A-Za-z0-9_-]+)?))?$/.test(u.pathname)
    if (u.origin !== 'https://boothhana.invalid' || !(['/', '/discover'].includes(u.pathname)||subculturePath)) return categoryHref('subculture')
    return u.pathname + u.search
  } catch { return categoryHref('subculture') }
}

/** Return only to this event or members of its published operating group. Never trust query IDs. */
export function safeEventReturnTo(value: unknown, eventId: string, fallback: string, operatingEventIds: readonly number[] = []): string {
  if (typeof value !== 'string') return fallback
  try {
    const url = new URL(value, 'https://boothhana.invalid')
    const allowedPaths=new Set([`/discover/${eventId}`])
    if(operatingEventIds.includes(Number(eventId)))for(const id of operatingEventIds) {
      if(Number.isSafeInteger(id)&&id>0)allowedPaths.add(`/discover/${id}`)
    }
    return url.origin === 'https://boothhana.invalid' && allowedPaths.has(url.pathname)
      ? url.pathname + url.search : fallback
  } catch { return fallback }
}

export function categoryForType(type: string): DiscoveryCategory {
  const field=taxonomyFields.find(f=>f.types.some(t=>t.code===type))
  return categories.find(c=>c.code===field?.code) ?? categories[0]
}
