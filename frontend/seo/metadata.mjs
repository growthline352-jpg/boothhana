import { taxonomy } from './taxonomy.mjs'
import { CATEGORY_SITES, PORTAL_ORIGIN, categorySite, categoryOrigin, splitSitesEnabled } from './category-sites.mjs'
/** Shared server/SPA metadata. Only PUBLIC catalog responses may be supplied here. */
export const SITE_TITLE = '부스하나 | 서울·경기 행사·부스·상품 찾기'
export const SITE_DESCRIPTION = '서울·경기 서브컬처·박람회·축제·팝업과 참가 부스, 상품을 찾아 저장하세요. 방문을 준비하고 다녀온 뒤에도 다시 찾을 수 있습니다.'
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const text = (value, max) => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''
const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/
const CATEGORY_BY_TYPE = Object.fromEntries(taxonomy.fields.flatMap(field => field.types.map(type => [type.code, field.key])))
const CATEGORY_LABEL = { subculture: '서브컬처 행사', exhibitions: '박람회', festivals: '축제', popups: '팝업' }
function verificationToken(raw) { return typeof raw === 'string' && /^[A-Za-z0-9_-]{20,200}$/.test(raw) ? raw : '' }

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
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || /[\\?#]/.test(raw) || [...raw].some(char => char.charCodeAt(0) <= 0x20)) return '/not-found'
  return raw.length > 500 ? '/not-found' : raw.replace(/\/+$/, '') || '/'
}
export function categoryFor(event) { return CATEGORY_BY_TYPE[event?.subcategory] || null }
function categoryUrl(origin, category) { return categorySite(origin) ? `${categoryOrigin(category) || origin}/` : category === 'subculture' ? `${origin}/discover` : `${origin}/discover?category=${category}` }
function dateTime(date, time) {
  if (!DATE.test(date || '')) return ''
  if (!TIME.test(time || '')) return date
  return `${date}T${time.length === 5 ? `${time}:00` : time}+09:00`
}
function eventStatus(state) {
  return ({ CANCELED: 'https://schema.org/EventCancelled', POSTPONED: 'https://schema.org/EventPostponed', RESCHEDULED: 'https://schema.org/EventRescheduled' })[state] || 'https://schema.org/EventScheduled'
}
function selectedBanner(catalog) {
  // Explicit null banner means no selection. Never fall back to unreviewed image candidates.
  return catalog?.banner === undefined ? catalog?.assets?.find(asset => asset.type === 'BANNER' && asset.participantId === null) : catalog?.banner
}
function selectedParticipantImage(catalog, participant) {
  return catalog?.assets?.find(asset => asset.participantId === participant?.id && ['BOOTH_CUT', 'PRODUCT', 'LOGO'].includes(asset.type))
}
function baseGraph(origin, canonical, title, description, image) {
  const websiteId = `${origin}/#website`, pageId = `${canonical}#webpage`
  const webpage = {
    '@type': 'WebPage', '@id': pageId, url: canonical, name: title, description, inLanguage: 'ko-KR',
    isPartOf: { '@id': websiteId },
  }
  if (image) webpage.primaryImageOfPage = { '@type': 'ImageObject', url: image }
  return {
    webpage,
    graph: [{ '@type': 'WebSite', '@id': websiteId, url: `${origin}/`, name: CATEGORY_SITES[categorySite(origin)]?.name || '부스하나', description: CATEGORY_SITES[categorySite(origin)]?.description || SITE_DESCRIPTION, inLanguage: 'ko-KR' }, webpage],
  }
}
function breadcrumb(items, canonical) {
  return {
    '@type': 'BreadcrumbList', '@id': `${canonical}#breadcrumb`,
    itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: item.url })),
  }
}
function eventNode(catalog, canonical, image) {
  const event = catalog.event
  const occurrence = event.occurrences?.find(item => DATE.test(item.startDate || '') && DATE.test(item.endDate || ''))
  const startDate = occurrence ? dateTime(occurrence.startDate, occurrence.startTime) : ''
  const endDate = occurrence ? dateTime(occurrence.endDate, occurrence.endTime) : ''
  const name = text(event.name, 160), address = text(event.address, 300), venue = text(event.venueName, 160)
  // Google requires a dated event and a real Place. Skip Event markup instead of inventing missing fields.
  if (!name || !startDate || (!address && !venue)) return null
  const node = {
    '@type': 'Event', '@id': `${canonical}#event`, name, url: canonical,
    description: text(event.description, 2000) || `${name}의 공개 일정과 장소, 참가 부스 안내입니다.`,
    startDate, eventStatus: eventStatus(event.operationStatus?.state),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place', name: venue || address,
      address: { '@type': 'PostalAddress', streetAddress: address || venue, addressRegion: event.region === 'SEOUL' ? '서울특별시' : event.region === 'GYEONGGI' ? '경기도' : undefined, addressCountry: 'KR' },
    },
  }
  if (endDate) node.endDate = endDate
  if (image) node.image = [image]
  const organizer = text(event.organizer, 160)
  if (organizer) node.organizer = { '@type': 'Organization', name: organizer }
  const keywords = Array.isArray(event.subjects) ? event.subjects.map(value => text(value, 80)).filter(Boolean).slice(0, 20) : []
  if (keywords.length) node.keywords = keywords.join(', ')
  return node
}
function listingHref(row, origin, absolute = true) { return categorySite(origin) && categoryOrigin(row.category) ? `${categoryOrigin(row.category)}${row.urlPath}` : absolute ? `${origin}${row.urlPath}` : row.urlPath }
function listingRows(rows) {
  if (!Array.isArray(rows)) return []
  return rows.flatMap(row => {
    const id = Number(row?.id), name = text(row?.name, 160), urlPath = typeof row?.urlPath === 'string' && /^\/(?:discover|events)\/[1-9]\d*$/.test(row.urlPath) ? row.urlPath : ''
    return Number.isSafeInteger(id) && id > 0 && name && urlPath ? [{ ...row, id, name, urlPath }] : []
  }).slice(0, 200)
}
function schemaForPage({ origin, canonical, title, description, image, catalog, participant, listing, path, category }) {
  const { graph, webpage } = baseGraph(origin, canonical, title, description, image)
  if (!catalog?.event) {
    const rows = listingRows(listing)
    if (rows.length) {
      const itemList = {
        '@type': 'ItemList', '@id': `${canonical}#events`, name: title, numberOfItems: rows.length,
        itemListElement: rows.map((row, index) => ({ '@type': 'ListItem', position: index + 1, name: row.name, url: listingHref(row, origin) })),
      }
      webpage.mainEntity = { '@id': itemList['@id'] }
      graph.push(itemList)
    }
    if (path !== '/') {
      const label = path === '/events' ? '예약 가능한 행사' : CATEGORY_LABEL[category] || '행사 찾기'
      const trail = breadcrumb([{ name: '홈', url: `${origin}/` }, { name: label, url: canonical }], canonical)
      webpage.breadcrumb = { '@id': trail['@id'] }; graph.push(trail)
    }
    return { '@context': 'https://schema.org', '@graph': graph }
  }
  const eventCategory = categoryFor(catalog.event) || 'subculture'
  const eventCanonical = `${origin}/discover/${catalog.id}`
  const crumbs = [
    { name: '홈', url: `${origin}/` },
    { name: CATEGORY_LABEL[eventCategory], url: categoryUrl(origin, eventCategory) },
    { name: text(catalog.event.name, 160), url: eventCanonical },
  ]
  const event = eventNode(catalog, eventCanonical, imageUrl(selectedBanner(catalog)?.url))
  if (participant) {
    crumbs.push({ name: text(participant.participant?.registrationName, 160), url: canonical })
    const entity = {
      '@type': 'Thing', '@id': `${canonical}#booth`, url: canonical,
      name: text(participant.participant?.registrationName, 160), description,
    }
    if (image && image !== `${origin}/assets/brand/logo.png`) entity.image = image
    webpage.mainEntity = { '@id': entity['@id'] }
    webpage.about = event ? { '@id': event['@id'] } : { '@type': 'Event', name: text(catalog.event.name, 160), url: eventCanonical }
    if (event) graph.push(event)
    graph.push(entity)
  } else if (event) {
    webpage.mainEntity = { '@id': event['@id'] }
    graph.push(event)
  }
  const trail = breadcrumb(crumbs, canonical)
  webpage.breadcrumb = { '@id': trail['@id'] }
  graph.push(trail)
  return { '@context': 'https://schema.org', '@graph': graph }
}

export function pageMetadata({ path = '/', search = '', siteUrl = '', verification = '', naverVerification = '', catalog = null, participant = null, listing = [], unavailable = false, splitSites = false } = {}) {
  path = normalizePath(path)
  let origin = siteOrigin(siteUrl)
  const split = splitSitesEnabled(origin, splitSites)
  const hostCategory = categorySite(origin)
  const params = new URLSearchParams(search)
  const browse = path === '/' || path === '/discover'
  const detailMatch = /^\/discover\/([1-9]\d*)$/.exec(path)
  const boothMatch = /^\/discover\/([1-9]\d*)\/booths\/([1-9]\d*)$/.exec(path)
  const category = hostCategory || params.get('category') || 'subculture'
  const supported = Object.hasOwn(CATEGORY_SITES, category) && (!params.has('category') || Object.hasOwn(CATEGORY_SITES, params.get('category')))
  const filtered = [...params.keys()].some(key => key !== 'category')
  let title = SITE_TITLE, description = SITE_DESCRIPTION, indexable = browse && supported && !filtered
  let image = origin ? `${origin}/assets/brand/logo.png` : ''
  const requestedEventId = Number(detailMatch?.[1] || boothMatch?.[1])
  const validCatalog = !unavailable && Number(catalog?.id) === requestedEventId && catalog?.event && text(catalog.event.name, 160)
  const validParticipant = validCatalog && boothMatch && Number(participant?.id) === Number(boothMatch[2]) && text(participant?.participant?.registrationName, 160)

  if (browse && !supported) {
    title = '행사 분야 확인 | 부스하나'
    description = '서울·경기 서브컬처·박람회·축제·팝업 정보를 제공합니다. 지원하는 분야를 선택해 주세요.'
  } else if (browse && supported && category !== 'subculture') {
    title = `${category === 'exhibitions' ? '서울·경기 박람회' : '서울·경기 축제'} | 부스하나`
    description = `${category === 'exhibitions' ? '박람회 참가 브랜드·제품' : '축제와 공개된 참가·체험 부스'}를 찾고 방문을 준비하세요. 검토·공개된 정보만 제공합니다.`
  } else if (boothMatch) {
    if (validParticipant) {
      const boothName = text(participant.participant.registrationName, 100)
      const eventName = text(catalog.event.name, 100)
      title = `${boothName} · ${eventName} | 부스하나`
      const topics = [...(participant.participant.subjects || []), ...(participant.sales?.subjects || []), ...(participant.sales?.categories || [])].map(value => text(value, 60)).filter(Boolean)
      description = text(participant.sales?.summary, 170) || `${eventName}의 ${boothName} 부스 위치${topics.length ? `와 ${topics.slice(0, 3).join('·')} 상품 정보` : '와 공개 상품 정보'}를 확인하세요.`
      image = imageUrl(selectedParticipantImage(catalog, participant)?.url) || imageUrl(selectedBanner(catalog)?.url) || image
      indexable = true
    } else {
      title = unavailable ? '공개 부스 안내를 확인할 수 없습니다 | 부스하나' : '부스 안내 확인 중 | 부스하나'
      description = '공개된 부스 정보를 확인하고 있습니다. 잠시 후 다시 확인해 주세요.'
    }
  } else if (detailMatch) {
    if (validCatalog) {
      title = `${text(catalog.event.name, 100)} | 부스하나`
      description = text(catalog.event.description, 170) || `${text(catalog.event.name, 100)}의 공개 일정, 장소, 참가 부스와 판매 안내를 확인하세요.`
      image = imageUrl(selectedBanner(catalog)?.url) || image
      indexable = true
    } else {
      title = unavailable ? '공개 행사 안내를 확인할 수 없습니다 | 부스하나' : '행사 안내 확인 중 | 부스하나'
      description = '공개된 행사 정보를 확인하고 있습니다. 잠시 후 다시 확인해 주세요.'
    }
  } else if (path === '/discover') {
    title = '서울·경기 서브컬처 행사 | 부스하나'
    description = '서울·경기 동인 행사, 인형 행사, 온리전과 팝업의 일정·장소·참가 부스를 찾아보세요.'
  } else if (path === '/events') {
    title = '예약 가능한 행사 | 부스하나'
    description = '부스하나에 직접 등록된 예약 가능 행사를 확인하세요. 외부 수집 행사·상품과 예약 운영 정보는 별개입니다.'
    indexable = true
  } else if (!browse) {
    title = path.startsWith('/admin') ? '관리자 작업 공간 | 부스하나' : path.startsWith('/creator') ? '크리에이터 작업 공간 | 부스하나' : path === '/library' ? '내 보관함 | 부스하나' : path === '/account' ? '내 정보 | 부스하나' : '부스하나'
    description = '계정별 정보와 작업 내용은 공개 검색 및 공유 미리보기에 포함하지 않습니다.'
  }

  if (split && validCatalog && categoryFor(catalog.event)) origin = categoryOrigin(categoryFor(catalog.event))
  if (split && browse && supported && (hostCategory || path === '/discover' || params.has('category'))) {
    origin = categoryOrigin(category)
    title = `서울·경기 ${CATEGORY_SITES[category].label} 일정 | ${CATEGORY_SITES[category].name}`
    description = CATEGORY_SITES[category].description
  }
  const canonicalPath = split && browse && (hostCategory || path === '/discover' || params.has('category')) && supported ? '/' : path
  // Queries remain usable but only the unfiltered category home is an index target.
  const canonical = origin ? origin + canonicalPath + (!split && browse && category !== 'subculture' ? `?category=${encodeURIComponent(category)}` : '') : ''
  const robots = indexable && origin ? 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1' : 'noindex,follow'
  const schema = indexable && origin ? schemaForPage({ origin, canonical, title, description, image, catalog: validCatalog ? catalog : null, participant: validParticipant ? participant : null, listing, path, category }) : null
  return { title, description, canonical, robots, image, schema, siteName: CATEGORY_SITES[categorySite(origin)]?.name || '부스하나', verification: verificationToken(verification), naverVerification: verificationToken(naverVerification) }
}

export function renderMetadata(meta) {
  const tag = (name, content, property = false) => `<meta data-booth-meta ${property ? 'property' : 'name'}="${name}" content="${esc(content)}" />`
  const tags = [
    `<title data-booth-meta>${esc(meta.title)}</title>`, tag('description', meta.description), tag('robots', meta.robots),
    tag('og:type', 'website', true), tag('og:site_name', meta.siteName || '부스하나', true), tag('og:locale', 'ko_KR', true),
    tag('og:title', meta.title, true), tag('og:description', meta.description, true),
    tag('twitter:card', meta.image ? 'summary_large_image' : 'summary'), tag('twitter:title', meta.title), tag('twitter:description', meta.description),
  ]
  if (meta.canonical) tags.push(`<link data-booth-meta rel="canonical" href="${esc(meta.canonical)}" />`, tag('og:url', meta.canonical, true))
  if (meta.image) tags.push(tag('og:image', meta.image, true), tag('og:image:alt', meta.title, true), tag('twitter:image', meta.image), tag('twitter:image:alt', meta.title))
  if (meta.verification) tags.push(tag('google-site-verification', meta.verification))
  if (meta.naverVerification) tags.push(tag('naver-site-verification', meta.naverVerification))
  if (meta.schema) tags.push(`<script data-booth-meta type="application/ld+json">${JSON.stringify(meta.schema).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')}</script>`)
  return tags.join('\n    ')
}

function list(values, max = 12) {
  return Array.isArray(values) ? values.map(value => text(value, 100)).filter(Boolean).slice(0, max) : []
}
/** Real public content for non-JavaScript crawlers; React replaces this same-content fallback after loading. */
export function renderCrawlableContent({ path = '/', search = '', catalog = null, participant = null, listing = [], siteUrl = '', splitSites = false } = {}) {
  path = normalizePath(path)
  if (!catalog?.event) {
    if (!['/', '/discover', '/events'].includes(path)) return ''
    const params = new URLSearchParams(search)
    if ((path === '/' || path === '/discover') && [...params.keys()].some(key => key !== 'category')) return ''
    if (path === '/' && siteUrl === PORTAL_ORIGIN && splitSites && !params.size) {
      return `<main class="content-wrap section-pad" data-seo-fallback><h1>어떤 행사를 찾고 계세요?</h1><p>관심 있는 분야의 행사와 참가 부스를 찾아보세요.</p>${Object.values(CATEGORY_SITES).map(site => `<section><h2><a href="${site.origin}/">${esc(site.name)}</a></h2><p>${esc(site.description)}</p></section>`).join('')}</main>`
    }
    const category = categorySite(siteUrl) || params.get('category') || 'subculture'
    if ((path === '/' || path === '/discover') && !Object.hasOwn(CATEGORY_SITES, category)) return ''
    const rows = listingRows(listing)
    const heading = categorySite(siteUrl) && path !== '/events' ? CATEGORY_SITES[category].name : path === '/' ? '서울·경기 행사와 참가 부스 찾기' : path === '/events' ? '예약 가능한 행사' : CATEGORY_LABEL[category]
    const intro = path === '/events' ? '부스하나에 직접 등록된 예약 가능 행사입니다.' : '공개된 일정과 장소를 확인하고 행사별 참가 부스와 상품 정보를 찾아보세요.'
    return `<main class="content-wrap section-pad" data-seo-fallback><h1>${esc(heading)}</h1><p>${esc(intro)}</p>
      ${rows.length ? `<h2>공개 행사</h2><ul>${rows.map(row => `<li><a href="${esc(listingHref(row, siteOrigin(siteUrl), false))}">${esc(row.name)}</a>${row.startDate ? ` · <time datetime="${esc(text(row.startDate, 10))}">${esc(text(row.startDate, 10))}</time>` : ''}${row.venue ? ` · ${esc(text(row.venue, 160))}` : ''}</li>`).join('')}</ul>` : '<p>공개 행사 목록을 불러오고 있습니다.</p>'}</main>`
  }
  const event = catalog.event
  const eventPath = `/discover/${catalog.id}`
  if (/\/booths\/[1-9]\d*$/.test(path) && participant?.participant) {
    const products = participant.productRows?.map(row => row.data) || participant.sales?.products || []
    const productNames = list(products.map(product => product?.name), 20)
    const subjects = list([...(participant.participant.subjects || []), ...(participant.sales?.subjects || [])], 12)
    return `<main class="content-wrap section-pad" data-seo-fallback>
      <nav aria-label="현재 위치"><a href="/">홈</a> / <a href="${eventPath}">${esc(text(event.name, 160))}</a> / 부스 상세</nav>
      <article><h1>${esc(text(participant.participant.registrationName, 160))}</h1>
      <p>${esc(text(participant.sales?.summary, 1000) || `${text(event.name, 160)} 참가 부스입니다.`)}</p>
      ${subjects.length ? `<p>분야: ${subjects.map(esc).join(' · ')}</p>` : ''}
      ${productNames.length ? `<h2>공개 상품</h2><ul>${productNames.map(name => `<li>${esc(name)}</li>`).join('')}</ul>` : '<p>공개 확인된 상품 정보를 준비하고 있습니다.</p>'}
      <p><a href="${eventPath}">${esc(text(event.name, 160))} 행사 상세 보기</a></p></article>
    </main>`
  }
  const occurrence = event.occurrences?.[0]
  const participants = Array.isArray(catalog.participants) ? catalog.participants.slice(0, 200) : []
  return `<main class="content-wrap section-pad" data-seo-fallback>
    <article><h1>${esc(text(event.name, 160))}</h1>
    <p>${esc(text(event.description, 3000) || '공개된 행사 일정과 참가 부스를 안내합니다.')}</p>
    <dl>${occurrence ? `<dt>일정</dt><dd>${esc(occurrence.startDate)}${occurrence.endDate && occurrence.endDate !== occurrence.startDate ? ` ~ ${esc(occurrence.endDate)}` : ''}${occurrence.startTime ? ` ${esc(occurrence.startTime)}` : ''}${occurrence.endTime ? ` ~ ${esc(occurrence.endTime)}` : ''}</dd>` : ''}
    ${event.venueName || event.address ? `<dt>장소</dt><dd>${esc(text(event.venueName, 160))}${event.address ? ` · ${esc(text(event.address, 300))}` : ''}</dd>` : ''}
    ${event.admission ? `<dt>입장</dt><dd>${esc(text(event.admission, 500))}</dd>` : ''}</dl>
    ${participants.length ? `<h2>공개 참가 부스</h2><ul>${participants.map(row => `<li><a href="${eventPath}/booths/${Number(row.id)}">${esc(text(row.participant?.registrationName, 160) || '부스 정보')}</a></li>`).join('')}</ul>` : ''}
    </article></main>`
}

export function injectMetadata(template, meta) {
  const marker = /<!-- BOOTH_META_START -->[\s\S]*?<!-- BOOTH_META_END -->/
  if (!marker.test(template)) throw new Error('Built HTML metadata slot missing; rebuild frontend.')
  return template.replace(marker, () => `<!-- BOOTH_META_START -->\n    ${renderMetadata(meta)}\n    <!-- BOOTH_META_END -->`)
}
export function injectCrawlableContent(template, content) {
  if (!content) return template
  const root = '<div id="root"></div>'
  if (!template.includes(root)) throw new Error('Built HTML root slot missing; rebuild frontend.')
  return template.replace(root, `<div id="root">${content}</div>`)
}
