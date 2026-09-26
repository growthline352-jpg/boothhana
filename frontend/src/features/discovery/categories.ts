/** v18: explicit taxonomy shared with collector/backend. Do not classify by names. */
export type CategoryKey = 'subculture' | 'exhibitions' | 'festivals'
export interface DiscoveryCategory {
  key: CategoryKey; code: 'SUBCULTURE' | 'EXHIBITION' | 'FESTIVAL'; label: string
  eyebrow: string; title: string; emphasis: string; description: string; searchHint: string
  enabled: boolean; icon: 'sparkles' | 'building' | 'festival'; filters: { value: string; label: string }[]
}
export const categories: readonly DiscoveryCategory[] = [
  { key: 'subculture', code: 'SUBCULTURE', label: '서브컬처', eyebrow: '취향으로 이어지는 오프라인 만남',
    title: '취향이 모이는 곳,', emphasis: '다음 만남을 발견하세요.',
    description: '서울·경기 서브컬처 행사와 참가 서클, 부스 위치와 판매 굿즈까지.\n현재 검토·공개된 정보로 방문을 준비하세요.',
    searchHint: '행사명, 장소, 작품·캐릭터 키워드로 찾아보세요', enabled: true, icon: 'sparkles',
    filters: [{ value: '', label: '전체' }, { value: 'COMIC_DOUJIN', label: '코믹·동인' },
      { value: 'DOLL', label: '인형' }, { value: 'ONLY_EVENT', label: '온리전' },
      { value: 'BIRTHDAY_CAFE', label: '생일카페' }, { value: 'STATIONERY_GOODS', label: '문구·굿즈' }] },
  { key: 'exhibitions', code: 'EXHIBITION', label: '박람회', eyebrow: '관심 분야의 새로운 발견',
    title: '새로운 관심사와', emphasis: '브랜드를 만나는 시간.',
    description: '서울·경기 박람회와 참가 브랜드·제품을 살펴보세요.\n검토·공개된 정보만 제공하며 미수집 정보는 별도로 확인하세요.',
    searchHint: '박람회명, 전시장, 관심 분야로 찾아보세요', enabled: true, icon: 'building',
    filters: [{ value: '', label: '전체' }, { value: 'WINE', label: '주류·와인' },
      { value: 'WEDDING', label: '웨딩' }, { value: 'LIFESTYLE', label: '생활·취미' },
      { value: 'DESIGN', label: '디자인·아트' }, { value: 'BUSINESS', label: '창업·산업' }] },
  { key: 'festivals', code: 'FESTIVAL', label: '축제', eyebrow: '도시에서 만나는 특별한 하루',
    title: '익숙한 도시에서', emphasis: '특별한 하루를 만나세요.',
    description: '서울·경기 축제와 공개된 참가·체험 부스를 찾아보세요.\n시간표·현장 변경사항은 공식 안내를 확인하세요.',
    searchHint: '축제명, 장소, 즐길 거리로 찾아보세요', enabled: true, icon: 'festival',
    filters: [{ value: '', label: '전체' }, { value: 'WALK', label: '걷기·거리' },
      { value: 'LIGHT', label: '불꽃·빛' }, { value: 'MUSIC', label: '음악·공연' },
      { value: 'FOOD', label: '먹거리' }, { value: 'CULTURE', label: '지역·문화' }] },
]
export function getCategory(value: string | null | undefined): DiscoveryCategory {
  return categories.find(c => c.key === value) ?? categories[0]
}
export function categoryHref(key: CategoryKey) { return `/discover?category=${key}` }
export function activeCategory(pathname: string, search: string): CategoryKey | null {
  if (pathname === '/' || pathname === '/discover' || pathname === '/discover/')
    return getCategory(new URLSearchParams(search).get('category')).key
  // Detail category comes from the published event, never a user-supplied query.
  if (/^\/discover\/\d+\/?$/.test(pathname)) return null
  return null
}
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string') return categoryHref('subculture')
  try {
    const u = new URL(value, 'https://boothhana.invalid')
    if (u.origin !== 'https://boothhana.invalid' || !['/', '/discover'].includes(u.pathname)) return categoryHref('subculture')
    return u.pathname + u.search
  } catch { return categoryHref('subculture') }
}

export function categoryForType(type: string): DiscoveryCategory {
  return categories.find(c => c.filters.some(f=>f.value===type)) ?? categories[0]
}
