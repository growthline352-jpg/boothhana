/** Fixed allowlist shared by HTML handlers and the SPA. Never trust arbitrary Host values. */
export const PORTAL_ORIGIN = 'https://boothana.kr'
export const CATEGORY_SITES = Object.freeze({
  popups: { origin: 'https://popup.boothana.kr', label: '팝업', code: 'POPUP', name: '부스하나 팝업', description: '캐릭터·브랜드 팝업스토어, 체험형·전시형 팝업의 일정, 장소와 예약 정보를 찾아보세요.' },
  subculture: { origin: 'https://subculture.boothana.kr', label: '서브컬처', code: 'SUBCULTURE', name: '부스하나 서브컬처', description: '코믹·동인 행사, 온리전, 생일카페와 문구·굿즈 행사의 일정, 참가 부스, 판매 상품과 배치도를 찾아보세요.' },
  exhibitions: { origin: 'https://expo.boothana.kr', label: '박람회', code: 'EXHIBITION', name: '부스하나 박람회', description: '주류·와인, 웨딩, 생활·취미, 디자인과 산업 박람회의 일정, 전시장, 참가업체와 부스 배치도를 확인하세요.' },
  festivals: { origin: 'https://festival.boothana.kr', label: '축제', code: 'FESTIVAL', name: '부스하나 축제', description: '지역 축제, 음악·공연, 빛 축제와 먹거리 행사의 일정, 장소, 운영시간과 체험 부스를 찾아보세요.' },
})
export function categorySite(origin) {
  return Object.entries(CATEGORY_SITES).find(([, site]) => site.origin === origin)?.[0] || null
}
export function requestSiteOrigin(host, fallback = '') {
  if (typeof host !== 'string') return fallback
  const origin = `https://${host.toLowerCase()}`
  return origin === PORTAL_ORIGIN || categorySite(origin) ? origin : fallback
}
export function splitSitesEnabled(origin, enabled = false) {
  return Boolean(categorySite(origin)) || (enabled && [PORTAL_ORIGIN, 'https://boothhana.vercel.app'].includes(origin))
}
export function categoryOrigin(category) { return Object.hasOwn(CATEGORY_SITES, category) ? CATEGORY_SITES[category].origin : '' }
export function categoryHome(category, origin, enabled = false) {
  if (!splitSitesEnabled(origin, enabled)) return `/discover?category=${category}`
  return categoryOrigin(category) === origin ? '/' : `${categoryOrigin(category)}/`
}
/** Return a stable destination without discarding user search/day/map context. */
export function categoryRedirect({ origin, path, search = '', category = null, enabled = false }) {
  if (!splitSitesEnabled(origin, enabled)) return ''
  const params = new URLSearchParams(search)
  const siteCategory = categorySite(origin)
  // Browser-stored itineraries share one origin across all event fields.
  if (siteCategory && /^\/itinerary(?:\/|$)/.test(path)) return `${PORTAL_ORIGIN}${path}${params.size ? `?${params}` : ''}`
  if (siteCategory && /^\/events(?:\/|$)/.test(path)) return `${PORTAL_ORIGIN}${path}${params.size ? `?${params}` : ''}`
  if (path === '/' || path === '/discover') {
    const explicit = params.get('category')
    if (explicit && !Object.hasOwn(CATEGORY_SITES, explicit)) return ''
    const target = explicit || siteCategory || (path === '/discover' ? 'subculture' : null)
    if (!target) return '' // Portal remains an independent entry page.
    params.delete('category')
    const homeStateOnly = [...params.keys()].every(key => ['region', 'openingRegion', 'closingRegion'].includes(key))
    // Local home tabs must retain the mounted page, including when the final tab is cleared.
    // Canonical metadata still points home aliases at the category root.
    if (siteCategory && !explicit && homeStateOnly) return ''
    const targetPath = params.size && !homeStateOnly ? '/discover' : '/'
    const destination = `${categoryOrigin(target)}${targetPath}${params.size ? `?${params}` : ''}`
    const current = `${origin}${path}${search ? `?${new URLSearchParams(search)}` : ''}`
    return destination === current ? '' : destination
  }
  if (/^\/discover\/[1-9]\d*(?:\/booths\/[1-9]\d*)?$/.test(path) && categoryOrigin(category) && categoryOrigin(category) !== origin) {
    return `${categoryOrigin(category)}${path}${params.size ? `?${params}` : ''}`
  }
  return ''
}
