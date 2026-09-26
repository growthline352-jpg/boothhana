/** Shared server/SPA metadata. Only PUBLIC catalog responses may be supplied here. */
export const SITE_TITLE = '부스하나 | 서울·경기 행사·부스·상품 찾기'
export const SITE_DESCRIPTION = '서울·경기 서브컬처·박람회·축제와 참가 부스, 상품을 찾아 저장하세요. 방문을 준비하고 다녀온 뒤에도 다시 찾을 수 있습니다.'
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const text = (value, max) => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''
export function siteOrigin(raw) {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash ? u.origin : ''
  } catch { return '' }
}
function imageUrl(raw) {
  try { const u = new URL(raw); return u.protocol === 'https:' && !u.username && !u.password ? u.href : '' } catch { return '' }
}
export function normalizePath(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || /[\\\x00-\x20?#]/.test(raw)) return '/not-found'
  return raw.length > 500 ? '/not-found' : raw.replace(/\/+$/, '') || '/'
}
export function pageMetadata({ path = '/', search = '', siteUrl = '', catalog = null, unavailable = false } = {}) {
  path = normalizePath(path)
  const origin = siteOrigin(siteUrl)
  const params = new URLSearchParams(search)
  const browse = path === '/' || path === '/discover'
  const detail = /^\/discover\/[1-9]\d*$/.test(path)
  const category = params.get('category') || 'subculture'
  const supported = ['subculture','exhibitions','festivals'].includes(category)
  const filtered = [...params.keys()].some(key => key !== 'category')
  let title = SITE_TITLE, description = SITE_DESCRIPTION, indexable = browse && supported && !filtered
  let image = origin ? `${origin}/assets/brand/logo.png` : ''
  if (browse && !supported) {
    title = '행사 분야 확인 | 부스하나'
    description = '서울·경기 서브컬처·박람회·축제 정보를 제공합니다. 지원하는 분야를 선택해 주세요.'
  } else if (browse && supported && category !== 'subculture') {
    title = `${category === 'exhibitions' ? '서울·경기 박람회' : '서울·경기 축제'} | 부스하나`
    description = `${category === 'exhibitions' ? '박람회 참가 브랜드·제품' : '축제와 공개된 참가·체험 부스'}를 찾고 방문을 준비하세요. 검토·공개된 정보만 제공합니다.`
  } else if (detail) {
    const event = catalog?.event
    const valid = !unavailable && Number(catalog?.id) === Number(path.split('/')[2]) && event && text(event.name, 160)
    if (valid) {
      title = `${text(event.name, 100)} | 부스하나`
      description = text(event.description, 170) || `${text(event.name, 100)}의 공개 일정, 장소, 참가 부스와 판매 안내를 확인하세요.`
      // Explicit null banner means no selection. Never fall back to unreviewed image candidates.
      const banner = catalog.banner === undefined ? catalog.assets?.find(a => a.type === 'BANNER' && a.participantId === null) : catalog.banner
      image = imageUrl(banner?.url) || image
      indexable = true
    } else {
      title = unavailable ? '공개 행사 안내를 확인할 수 없습니다 | 부스하나' : '행사 안내 확인 중 | 부스하나'
      description = '공개된 행사 정보를 확인하고 있습니다. 잠시 후 다시 확인해 주세요.'
    }
  } else if (path === '/events') {
    title = '예약 가능한 행사 | 부스하나'
    description = '부스하나에 직접 등록된 예약 가능 행사를 확인하세요. 외부 수집 행사·상품과 예약 운영 정보는 별개입니다.'
    indexable = true
  } else if (!browse) {
    title = path.startsWith('/admin') ? '관리자 작업 공간 | 부스하나' : path.startsWith('/creator') ? '크리에이터 작업 공간 | 부스하나' : path === '/library' ? '내 보관함 | 부스하나' : '부스하나'
    description = '계정별 정보와 작업 내용은 공개 검색 및 공유 미리보기에 포함하지 않습니다.'
  }
  // No guessed deployment domain. Missing explicit public origin remains noindex.
  const canonical = origin ? origin + path + (browse && category !== 'subculture' ? `?category=${encodeURIComponent(category)}` : '') : ''
  const robots = indexable && origin ? 'index,follow' : 'noindex,follow'
  const schema = robots === 'index,follow' ? { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description, url: canonical, inLanguage: 'ko-KR' } : null
  return { title, description, canonical, robots, image, schema }
}
export function renderMetadata(meta) {
  const tag = (name, content, property = false) => `<meta data-booth-meta ${property ? 'property' : 'name'}="${name}" content="${esc(content)}" />`
  const tags = [
    `<title data-booth-meta>${esc(meta.title)}</title>`, tag('description', meta.description), tag('robots', meta.robots),
    tag('og:type', 'website', true), tag('og:site_name', '부스하나', true), tag('og:locale', 'ko_KR', true),
    tag('og:title', meta.title, true), tag('og:description', meta.description, true),
    tag('twitter:card', 'summary'), tag('twitter:title', meta.title), tag('twitter:description', meta.description),
  ]
  if (meta.canonical) tags.push(`<link data-booth-meta rel="canonical" href="${esc(meta.canonical)}" />`, tag('og:url', meta.canonical, true))
  if (meta.image) tags.push(tag('og:image', meta.image, true), tag('twitter:image', meta.image))
  if (meta.schema) tags.push(`<script data-booth-meta type="application/ld+json">${JSON.stringify(meta.schema).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')}</script>`)
  return tags.join('\n    ')
}
export function injectMetadata(template, meta) {
  const marker = /<!-- BOOTH_META_START -->[\s\S]*?<!-- BOOTH_META_END -->/
  if (!marker.test(template)) throw new Error('Built HTML metadata slot missing; rebuild frontend.')
  return template.replace(marker, () => `<!-- BOOTH_META_START -->\n    ${renderMetadata(meta)}\n    <!-- BOOTH_META_END -->`)
}
