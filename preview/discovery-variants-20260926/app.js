const ASSETS = {
  poster: '../../frontend/public/assets/boothup/star-courier-posters.png',
  sticker: '../../frontend/public/assets/boothup/pixel-cat-stickers.png',
  keyring: '../../frontend/public/assets/boothup/moon-rabbit-keychains.png',
  pouch: '../../frontend/public/assets/boothup/summer-cat-pouch.png'
}

const DATA = {
  SUBCULTURE: {
    label: '서브컬처',
    total: 8,
    events: [
      { id: 's1', name: '제35회 디. 페스타', date: '10.03', day: '토', venue: 'SETEC', region: '서울', type: '코믹 동인', note: '참가 부스 45곳', image: ASSETS.poster },
      { id: 's2', name: '제9회 쩜오 어워드', date: '10.04', day: '일', venue: 'SETEC', region: '서울', type: '온리전', note: '사전 예매 확인', image: ASSETS.sticker },
      { id: 's3', name: '스크롤의 바다 3화', date: '10.04', day: '일', venue: 'SETEC', region: '서울', type: '일러스트 굿즈', note: '참가 부스 18곳', image: ASSETS.keyring },
      { id: 's4', name: '문구전 2026 가을', date: '10.09', day: '금', venue: '세종대학교 광개토관', region: '서울', type: '문구 굿즈', note: '현장 입장', image: ASSETS.pouch },
      { id: 's5', name: '41회 서울 프로젝트돌', date: '10.10', day: '토', venue: 'DDP 아트홀 1관', region: '서울', type: '인형 창작', note: '참가 부스 10곳', image: ASSETS.sticker }
    ]
  },
  EXHIBITION: {
    label: '박람회',
    total: 31,
    events: [
      { id: 'e1', name: '제12회 집코노미 박람회 2026', date: '09.30', day: '수', venue: '코엑스 Hall D', region: '서울', type: '산업 비즈니스', note: '사전 등록', image: ASSETS.poster },
      { id: 'e2', name: '제14회 국제첨단소재기술대전', date: '09.30', day: '수', venue: '코엑스 Hall C', region: '서울', type: '산업 기술', note: '전문 참관객', image: ASSETS.keyring },
      { id: 'e3', name: '2026 서울국제주류&와인박람회', date: '10.01', day: '목', venue: '코엑스마곡', region: '서울', type: '와인 라이프', note: '성인 인증 필요', image: ASSETS.pouch },
      { id: 'e4', name: '2026 동아재테크쇼', date: '10.01', day: '목', venue: '코엑스 Hall B1', region: '서울', type: '금융 비즈니스', note: '무료 등록', image: ASSETS.sticker },
      { id: 'e5', name: '제일창업박람회 in수원', date: '10.01', day: '목', venue: '수원메쎄', region: '경기', type: '창업 산업', note: '현장 상담', image: ASSETS.poster }
    ]
  },
  FESTIVAL: {
    label: '축제',
    total: 16,
    events: [
      { id: 'f1', name: '2026 수원화성 미디어아트', date: '09.26', day: '토', venue: '화서문과 장안공원', region: '경기', type: '빛 미디어 문화', note: '야간 관람', image: ASSETS.keyring },
      { id: 'f2', name: '2026 서울라이트 한강 빛섬축제', date: '10.02', day: '금', venue: '노들섬', region: '서울', type: '빛 미디어 문화', note: '무료 관람', image: ASSETS.poster },
      { id: 'f3', name: '제63회 수원화성문화제', date: '10.04', day: '일', venue: '수원화성 일원', region: '경기', type: '지역 문화', note: '야외 행사', image: ASSETS.pouch },
      { id: 'f4', name: '2026 크리에이티브 x 성수', date: '10.05', day: '월', venue: '성수동 일대', region: '서울', type: '지역 문화 창작', note: '다수 공간 운영', image: ASSETS.sticker },
      { id: 'f5', name: '한강 뚜벅뚜벅 축제', date: '10.11', day: '일', venue: '잠수교와 반포한강공원', region: '서울', type: '걷기 야외', note: '무료 참여', image: ASSETS.keyring }
    ]
  }
}

const states = {
  shop: { category: 'SUBCULTURE', query: '', region: '전체', companion: '혼자' },
  poster: { category: 'SUBCULTURE', query: '', region: '전체', companion: '혼자' },
  taste: { category: 'SUBCULTURE', query: '', region: '전체', companion: '혼자' },
  weekend: { category: 'SUBCULTURE', query: '', region: '전체', companion: '혼자' }
}

const saved = new Set()
let activeConcept = 'shop'
let toastTimer

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])
}

function filteredEvents(concept) {
  const state = states[concept]
  const query = state.query.trim().toLocaleLowerCase('ko-KR')
  return DATA[state.category].events.filter(event => {
    const matchesQuery = !query || `${event.name} ${event.venue} ${event.region} ${event.type} ${event.note}`.toLocaleLowerCase('ko-KR').includes(query)
    const matchesRegion = state.region === '전체' || event.region === state.region
    return matchesQuery && matchesRegion
  })
}

function saveButton(event) {
  const isSaved = saved.has(event.id)
  return `<button class="save-button${isSaved ? ' is-saved' : ''}" type="button" data-save="${event.id}" aria-pressed="${isSaved}" aria-label="${escapeHtml(event.name)} ${isSaved ? '저장 취소' : '저장'}">${isSaved ? '저장됨' : '저장'}</button>`
}

function eventMeta(event) {
  return `${event.date} ${event.day} / ${event.venue} / ${event.region}`
}

function renderShop(root, events) {
  const feature = events[0] || DATA[states.shop.category].events[0]
  root.querySelector('[data-feature]').innerHTML = `
    <img src="${feature.image}" alt="${escapeHtml(feature.name)} 참고 이미지">
    <div class="shop-feature__caption">
      <div><span>${escapeHtml(feature.type)}</span><h2>${escapeHtml(feature.name)}</h2><p>${eventMeta(feature)}</p></div>
      ${saveButton(feature)}
    </div>`

  root.querySelector('[data-results]').innerHTML = events.map(event => `
    <article class="shop-card">
      <img src="${event.image}" alt="${escapeHtml(event.name)} 참고 이미지">
      <div class="shop-card__body">
        <div class="shop-card__top"><span>${escapeHtml(event.type)}</span>${saveButton(event)}</div>
        <h3>${escapeHtml(event.name)}</h3>
        <p>${eventMeta(event)}<br>${escapeHtml(event.note)}</p>
      </div>
    </article>`).join('')
}

function renderPoster(root, events) {
  root.querySelector('[data-results]').innerHTML = events.map(event => `
    <article class="poster-card">
      <img src="${event.image}" alt="${escapeHtml(event.name)} 참고 이미지">
      <div class="poster-card__copy">
        <div><span>${escapeHtml(event.type)}</span><h3>${escapeHtml(event.name)}</h3><p>${eventMeta(event)}</p></div>
        ${saveButton(event)}
      </div>
    </article>`).join('')
}

function renderTaste(root, events) {
  const companionLabels = { 혼자: '혼자 천천히 보기 좋은 행사', 친구: '친구와 같이 즐기기 좋은 행사', 가족: '가족과 편하게 다녀올 행사' }
  root.querySelector('[data-taste-label]').textContent = companionLabels[states.taste.companion]
  root.querySelector('[data-results]').innerHTML = events.map(event => `
    <article class="taste-card">
      <img src="${event.image}" alt="${escapeHtml(event.name)} 참고 이미지">
      <div class="taste-card__copy">
        <span>${escapeHtml(event.type)}</span>
        <h3>${escapeHtml(event.name)}</h3>
        <p>${eventMeta(event)}<br>${escapeHtml(event.note)}</p>
        ${saveButton(event)}
      </div>
    </article>`).join('')
}

function renderWeekend(root, events) {
  root.querySelector('[data-total]').textContent = DATA[states.weekend.category].total
  root.querySelector('[data-results]').innerHTML = events.map(event => `
    <article class="schedule-row">
      <time datetime="2026-${event.date.replace('.', '-')}">${event.date}<br>${event.day}</time>
      <img src="${event.image}" alt="">
      <div class="schedule-row__copy"><span>${escapeHtml(event.type)}</span><h3>${escapeHtml(event.name)}</h3><p>${escapeHtml(event.venue)} / ${event.region} / ${escapeHtml(event.note)}</p></div>
      ${saveButton(event)}
    </article>`).join('')
}

function render(concept) {
  const root = document.querySelector(`[data-concept="${concept}"]`)
  const state = states[concept]
  const events = filteredEvents(concept)
  const info = DATA[state.category]

  root.querySelectorAll('[data-category]').forEach(button => {
    const selected = button.dataset.category === state.category
    button.classList.toggle('is-active', selected)
    button.setAttribute('aria-pressed', String(selected))
  })
  root.querySelectorAll('[data-region]').forEach(button => {
    const selected = button.dataset.region === state.region
    button.classList.toggle('is-selected', selected)
    button.setAttribute('aria-pressed', String(selected))
  })
  root.querySelectorAll('[data-companion]').forEach(button => {
    const selected = button.dataset.companion === state.companion
    button.classList.toggle('is-selected', selected)
    button.setAttribute('aria-pressed', String(selected))
  })
  root.querySelectorAll('[data-summary]').forEach(node => {
    const suffix = state.query || state.region !== '전체' ? `현재 ${events.length}개 표시` : `${info.total}개 행사 정보`
    node.textContent = `${info.label} / ${suffix}`
  })

  const empty = root.querySelector('[data-empty]')
  const results = root.querySelector('[data-results]')
  empty.hidden = events.length > 0
  results.hidden = events.length === 0

  if (concept === 'shop') renderShop(root, events)
  if (concept === 'poster') renderPoster(root, events)
  if (concept === 'taste') renderTaste(root, events)
  if (concept === 'weekend') renderWeekend(root, events)
  updateSavedCounts()
}

function updateSavedCounts() {
  document.querySelectorAll('[data-saved-count]').forEach(node => { node.textContent = saved.size })
}

function showToast(message) {
  const toast = document.querySelector('.toast')
  toast.textContent = message
  toast.classList.add('is-visible')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 1800)
}

function showConcept(name) {
  activeConcept = name
  document.querySelectorAll('[data-show]').forEach(button => {
    const selected = button.dataset.show === name
    button.classList.toggle('is-active', selected)
    button.setAttribute('aria-selected', String(selected))
  })
  document.querySelectorAll('[data-concept]').forEach(section => {
    const selected = section.dataset.concept === name
    section.hidden = !selected
    section.classList.toggle('is-active', selected)
  })
  render(name)
  window.scrollTo({ top: 0, behavior: 'auto' })
  history.replaceState(null, '', `#${name}`)
}

document.querySelectorAll('[data-show]').forEach(button => {
  button.addEventListener('click', () => showConcept(button.dataset.show))
})

document.querySelectorAll('[data-concept]').forEach(root => {
  const concept = root.dataset.concept

  root.querySelectorAll('[data-category]').forEach(button => {
    button.addEventListener('click', () => {
      states[concept].category = button.dataset.category
      states[concept].query = ''
      const input = root.querySelector('[data-search]')
      if (input) input.value = ''
      render(concept)
    })
  })

  root.querySelectorAll('[data-region]').forEach(button => {
    button.addEventListener('click', () => {
      states[concept].region = button.dataset.region
      render(concept)
    })
  })

  root.querySelectorAll('[data-companion]').forEach(button => {
    button.addEventListener('click', () => {
      states[concept].companion = button.dataset.companion
      render(concept)
    })
  })

  root.querySelectorAll('[data-search-form]').forEach(form => {
    form.addEventListener('submit', event => {
      event.preventDefault()
      states[concept].query = form.querySelector('[data-search]').value
      render(concept)
    })
  })

  root.querySelectorAll('[data-keyword]').forEach(button => {
    button.addEventListener('click', () => {
      states[concept].query = button.dataset.keyword
      const input = root.querySelector('[data-search]')
      if (input) input.value = button.dataset.keyword
      render(concept)
    })
  })

  root.querySelectorAll('[data-reset]').forEach(button => {
    button.addEventListener('click', () => {
      states[concept].query = ''
      states[concept].region = '전체'
      const input = root.querySelector('[data-search]')
      if (input) input.value = ''
      render(concept)
    })
  })
})

document.addEventListener('click', event => {
  const button = event.target.closest('[data-save]')
  if (!button) return
  const id = button.dataset.save
  const eventRecord = Object.values(DATA).flatMap(group => group.events).find(item => item.id === id)
  if (saved.has(id)) {
    saved.delete(id)
    showToast(`${eventRecord?.name || '행사'} 저장을 취소했습니다.`)
  } else {
    saved.add(id)
    showToast(`${eventRecord?.name || '선택한'} 행사를 보관함에 저장했습니다.`)
  }
  render(activeConcept)
})

const initial = location.hash.slice(1)
showConcept(states[initial] ? initial : 'shop')
