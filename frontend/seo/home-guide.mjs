import { CATEGORY_SITES } from './category-sites.mjs'

// Authored copy shared by the initial HTML and the interactive homepage.
export const homeGuide = {
  summary: '부스하나 소개와 행사 탐색 안내',
  title: '부스하나, 행사부터 부스·상품까지 한곳에서',
  intro: '부스하나(Boothana)는 서울·경기의 서브컬처 행사, 박람회, 축제, 팝업과 공개된 참가 부스·업체·작가·상품 정보를 연결하는 행사 탐색 서비스입니다.',
  usageTitle: '관심 있는 행사를 찾고 방문을 준비하세요',
  usage: '분야별 일정과 장소를 살펴보고, 행사 상세에서 공개된 참가 부스와 판매 상품, 배치도를 확인하세요. 관심 있는 행사·부스·상품을 보관함에 저장해 다시 찾을 수 있습니다.',
  notice: '수집된 정보는 일부 누락되거나 이후 변경될 수 있습니다. 방문 전 행사 상세에 연결된 주최 측 공식 공지와 참가자의 최신 안내를 함께 확인하세요.',
  categoriesTitle: '분야별 행사와 전체 목록',
  categories: ['subculture', 'exhibitions', 'festivals', 'popups'].map(key => {
    const site = CATEGORY_SITES[key]
    return { key, label: site.label, description: site.description, href: `${site.origin}/`, directoryHref: `${site.origin}/discover?period=all&sort=recent` }
  }),
  aboutHref: '/about',
  aboutLabel: '부스하나와 운영사 그로스라인 소개',
}

const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
export function renderHomeGuide() {
  const guide = homeGuide
  return `<details class="home-guide"><summary>${esc(guide.summary)}</summary><div class="home-guide-content"><h2>${esc(guide.title)}</h2><p>${esc(guide.intro)}</p><h3>${esc(guide.usageTitle)}</h3><p>${esc(guide.usage)}</p><h3>${esc(guide.categoriesTitle)}</h3><ul class="home-guide-categories">${guide.categories.map(category => `<li><a href="${esc(category.href)}">${esc(category.label)} 행사 찾기</a><p>${esc(category.description)}</p><a href="${esc(category.directoryHref)}">${esc(category.label)} 전체 행사 목록</a></li>`).join('')}</ul><p>${esc(guide.notice)}</p><p><a href="${esc(guide.aboutHref)}">${esc(guide.aboutLabel)}</a></p></div></details>`
}
