const DATA = {
  SUBCULTURE: {
    label: '서브컬처', count: 8,
    events: [
      { id: 1, name: '제35회 디. 페스타 (토요일)', date: '10.03', day: '토', venue: 'SETEC', region: '서울', type: '코믹·동인', people: 45, img: '../../frontend/public/assets/boothup/star-courier-posters.png' },
      { id: 2, name: '제9회 쩜오 어워드', date: '10.04', day: '일', venue: 'SETEC', region: '서울', type: '온리전', people: 24, img: '../../frontend/public/assets/boothup/pixel-cat-stickers.png' },
      { id: 3, name: '스크롤의 바다 3화', date: '10.04', day: '일', venue: 'SETEC', region: '서울', type: '온리전', people: 18, img: '../../frontend/public/assets/boothup/moon-rabbit-keychains.png' },
      { id: 4, name: '문구전 2026 가을', date: '10.09', day: '금', venue: '세종대학교 광개토관', region: '서울', type: '문구·굿즈', people: 0, img: '../../frontend/public/assets/boothup/summer-cat-pouch.png' },
      { id: 5, name: '41회 서울 프로젝트돌', date: '10.10', day: '토', venue: 'DDP 아트홀 1관', region: '서울', type: '인형', people: 10, img: 'https://picsum.photos/seed/boothhana-doll/640/440' }
    ]
  },
  EXHIBITION: {
    label: '박람회', count: 31,
    events: [
      { id: 13, name: '제12회 집코노미 박람회 2026', date: '09.30', day: '수', venue: '코엑스 Hall D', region: '서울', type: '산업·비즈니스', people: 0, img: 'https://picsum.photos/seed/boothhana-housing/640/440' },
      { id: 21, name: '제14회 국제첨단소재기술대전', date: '09.30', day: '수', venue: '코엑스 Hall C', region: '서울', type: '산업·비즈니스', people: 0, img: 'https://picsum.photos/seed/boothhana-materials/640/440' },
      { id: 9, name: '2026 서울국제주류&와인박람회 마곡', date: '10.01', day: '목', venue: '코엑스마곡', region: '서울', type: '주류·와인', people: 0, img: 'https://picsum.photos/seed/boothhana-wine/640/440' },
      { id: 14, name: '2026 동아재테크쇼', date: '10.01', day: '목', venue: '코엑스 Hall B1', region: '서울', type: '산업·비즈니스', people: 0, img: 'https://picsum.photos/seed/boothhana-finance/640/440' },
      { id: 33, name: '제일창업박람회 in수원', date: '10.01', day: '목', venue: '수원메쎄', region: '경기', type: '창업', people: 0, img: 'https://picsum.photos/seed/boothhana-startup/640/440' }
    ]
  },
  FESTIVAL: {
    label: '축제', count: 16,
    events: [
      { id: 49, name: '2026 수원화성 미디어아트', date: '09.26', day: '토', venue: '화서문·장안공원 일원', region: '경기', type: '빛·미디어', people: 0, img: 'https://picsum.photos/seed/boothhana-media-art/640/440' },
      { id: 41, name: '2026 서울라이트 한강 빛섬축제', date: '10.02', day: '금', venue: '노들섬', region: '서울', type: '빛·미디어', people: 0, img: 'https://picsum.photos/seed/boothhana-hangang-light/640/440' },
      { id: 48, name: '제63회 수원화성문화제', date: '10.04', day: '일', venue: '수원화성 일원', region: '경기', type: '지역·문화', people: 0, img: 'https://picsum.photos/seed/boothhana-fortress/640/440' },
      { id: 45, name: '2026 크리에이티브 x 성수', date: '10.05', day: '월', venue: '성수동 일대', region: '서울', type: '지역·문화', people: 0, img: 'https://picsum.photos/seed/boothhana-seongsu/640/440' },
      { id: 46, name: '한강 뚜벅뚜벅 축제', date: '10.11', day: '일', venue: '잠수교·반포한강공원', region: '서울', type: '걷기·거리', people: 0, img: 'https://picsum.photos/seed/boothhana-walk/640/440' }
    ]
  }
}

let concept = 'a'
const categoryByConcept = { a: 'SUBCULTURE', b: 'SUBCULTURE', c: 'SUBCULTURE', d: 'SUBCULTURE' }
const queryByConcept = { a: '', b: '', c: '', d: '' }
const savedIds = new Set()
let selectedNearbyId = '1'

function visibleEvents(id) {
  const category = categoryByConcept[id]
  const query = queryByConcept[id].trim().toLowerCase()
  return DATA[category].events.filter(event => !query || `${event.name} ${event.venue} ${event.type}`.toLowerCase().includes(query))
}

function saveButton(event) {
  const saved = savedIds.has(String(event.id))
  return `<button class="save-button${saved ? ' is-saved' : ''}" type="button" data-save="${event.id}" aria-pressed="${saved}">${saved ? '저장됨' : '저장'}</button>`
}

function renderMini(events) {
  return events.slice(0, 3).map(event => `<article class="mini-event"><time>${event.date}<br>${event.day}</time><div><strong>${event.name}</strong><small>${event.venue} | ${event.region}</small></div>${saveButton(event)}</article>`).join('')
}

function renderConceptA(root, events) {
  const first = events[0] || DATA[categoryByConcept.a].events[0]
  const featureImage = root.querySelector('[data-feature-image]')
  featureImage.src = first.img
  featureImage.alt = `${first.name} 행사 참고 이미지`
  root.querySelector('[data-feature-type]').textContent = first.type
  root.querySelector('[data-feature-title]').textContent = first.name
  root.querySelector('[data-feature-meta]').textContent = `${first.date} ${first.day} | ${first.venue} | ${first.region}`
  root.querySelector('[data-side-list]').innerHTML = events.length ? renderMini(events) : emptyMarkup()
  root.querySelector('[data-event-grid]').innerHTML = events.length ? events.slice(0, 4).map(event => `<article class="poster-card"><img src="${event.img}" alt="${event.name} 참고 이미지"><div class="poster-card-body"><span>${event.type}</span><h3>${event.name}</h3><p>${event.date} ${event.day} | ${event.venue}</p>${saveButton(event)}</div></article>`).join('') : emptyMarkup()
}

function renderConceptB(root, events) {
  root.querySelector('[data-event-list]').innerHTML = events.length ? events.map(event => `<article class="event-row"><img src="${event.img}" alt="${event.name} 참고 이미지"><time class="event-date">${event.date}<small>${event.day}</small></time><div class="event-info"><span>${event.type}</span><h3>${event.name}</h3><p>${event.venue} | ${event.region}${event.people ? ` | 참가 부스 ${event.people}곳` : ''}</p></div>${saveButton(event)}</article>`).join('') : emptyMarkup()
  root.querySelector('[data-side-list]').innerHTML = events.length ? renderMini(events) : emptyMarkup()
  root.querySelector('[data-plan-count]').textContent = `${Math.min(events.length, 3)}곳`
}

function renderConceptC(root, events) {
  if (!events.length) {
    root.querySelector('[data-lead-story]').innerHTML = emptyMarkup()
    root.querySelector('[data-story-list]').innerHTML = ''
    root.querySelector('[data-agenda-list]').innerHTML = emptyMarkup()
    return
  }
  const fallback = DATA[categoryByConcept.c].events
  const visible = events.length ? events : fallback
  const lead = visible[0]
  root.querySelector('[data-lead-story]').innerHTML = `<img src="${lead.img}" alt="${lead.name} 행사 참고 이미지"><div><span>${lead.type}</span><h3>${lead.name}</h3><p>${lead.date} ${lead.day} | ${lead.venue} | ${lead.region}</p>${saveButton(lead)}</div>`
  root.querySelector('[data-story-list]').innerHTML = visible.slice(1, 4).map(event => `<article><img src="${event.img}" alt="${event.name} 행사 참고 이미지"><div><span>${event.type}</span><h3>${event.name}</h3><p>${event.date} ${event.day} | ${event.region}</p></div>${saveButton(event)}</article>`).join('')
  root.querySelector('[data-agenda-list]').innerHTML = visible.slice(0, 5).map(event => `<article><time><strong>${event.date}</strong><span>${event.day}</span></time><div><span>${event.type}</span><h3>${event.name}</h3><p>${event.venue} | ${event.region}</p></div>${saveButton(event)}</article>`).join('')
}

function renderConceptD(root, events) {
  if (!events.length) {
    root.querySelector('[data-map-pins]').innerHTML = ''
    root.querySelector('[data-nearby-list]').innerHTML = emptyMarkup()
    root.querySelector('[data-selected-name]').textContent = '선택된 행사가 없습니다'
    root.querySelector('[data-selected-meta]').textContent = '검색 조건을 바꿔 주세요.'
    return
  }

  if (!events.some(event => String(event.id) === selectedNearbyId)) selectedNearbyId = String(events[0].id)
  const pinPositions = [[26, 38], [57, 27], [71, 56], [39, 69], [82, 42]]
  root.querySelector('[data-map-pins]').innerHTML = events.slice(0, 5).map((event, index) => {
    const [x, y] = pinPositions[index]
    const selected = String(event.id) === selectedNearbyId
    return `<button class="map-pin${selected ? ' is-selected' : ''}" type="button" style="--pin-x:${x}%;--pin-y:${y}%" data-select-event="${event.id}" aria-label="${event.name} 지도에서 선택">${index + 1}</button>`
  }).join('')
  root.querySelector('[data-nearby-list]').innerHTML = events.slice(0, 5).map((event, index) => {
    const selected = String(event.id) === selectedNearbyId
    return `<article class="nearby-event${selected ? ' is-selected' : ''}" data-event-item="${event.id}"><button class="event-open" type="button" data-select-event="${event.id}"><span class="event-order">${index + 1}</span><span><strong>${event.name}</strong><small>${event.date} ${event.day} | ${event.venue} | ${event.region}</small></span></button>${saveButton(event)}</article>`
  }).join('')
  const selected = events.find(event => String(event.id) === selectedNearbyId) || events[0]
  root.querySelector('[data-selected-name]').textContent = selected.name
  root.querySelector('[data-selected-meta]').textContent = `${selected.date} ${selected.day} | ${selected.venue} | ${selected.region}`
}

function emptyMarkup() { return '<div class="empty-result">검색 조건에 맞는 행사가 없습니다. 다른 검색어를 입력해 주세요.</div>' }

function render(id) {
  const root = document.querySelector(`[data-concept="${id}"]`)
  const category = categoryByConcept[id]
  const events = visibleEvents(id)
  root.querySelectorAll('[data-category]').forEach(button => button.classList.toggle('is-active', button.dataset.category === category))
  root.querySelectorAll('[data-category-jump]').forEach(button => button.classList.toggle('is-current', button.dataset.categoryJump === category))
  root.querySelectorAll('[data-category-summary]').forEach(node => { node.textContent = `${DATA[category].label} ${DATA[category].count}개 행사가 공개되어 있어요.` })
  if (id === 'a') renderConceptA(root, events)
  if (id === 'b') renderConceptB(root, events)
  if (id === 'c') renderConceptC(root, events)
  if (id === 'd') renderConceptD(root, events)
}

document.querySelectorAll('[data-show-concept]').forEach(button => button.addEventListener('click', () => {
  concept = button.dataset.showConcept
  document.querySelectorAll('[data-show-concept]').forEach(item => item.classList.toggle('is-active', item === button))
  document.querySelectorAll('[data-concept]').forEach(section => {
    const active = section.dataset.concept === concept
    section.hidden = !active
    section.classList.toggle('is-active', active)
  })
  window.scrollTo({ top: 0, behavior: 'instant' })
  render(concept)
}))

document.querySelectorAll('[data-concept]').forEach(root => {
  const id = root.dataset.concept
  root.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
    categoryByConcept[id] = button.dataset.category
    queryByConcept[id] = ''
    const input = root.querySelector('[data-search-input]')
    if (input) input.value = ''
    render(id)
  }))
  root.querySelectorAll('[data-category-jump]').forEach(button => button.addEventListener('click', () => {
    categoryByConcept[id] = button.dataset.categoryJump
    render(id)
  }))
  root.querySelectorAll('[data-search-form]').forEach(form => form.addEventListener('submit', event => {
    event.preventDefault()
    queryByConcept[id] = form.querySelector('[data-search-input]').value
    render(id)
  }))
})

document.addEventListener('click', event => {
  const button = event.target.closest('[data-save]')
  if (!button) return
  const saved = button.getAttribute('aria-pressed') !== 'true'
  const id = button.dataset.save
  if (saved) savedIds.add(id)
  else savedIds.delete(id)
  document.querySelectorAll(`[data-save="${id}"]`).forEach(item => {
    item.setAttribute('aria-pressed', String(saved))
    item.classList.toggle('is-saved', saved)
    item.textContent = saved ? '저장됨' : '저장'
  })
})

document.addEventListener('click', event => {
  const button = event.target.closest('[data-select-event]')
  if (!button) return
  selectedNearbyId = button.dataset.selectEvent
  render('d')
})

document.querySelectorAll('.quick-filters button, .date-rail button').forEach(button => button.addEventListener('click', () => {
  const group = button.parentElement
  group.querySelectorAll('button').forEach(item => item.classList.toggle('is-active', item === button))
}))

document.querySelectorAll('[data-quick-filter]').forEach(button => button.addEventListener('click', () => {
  const group = button.closest('.discovery-path')
  group.querySelectorAll('[data-quick-filter]').forEach(item => item.classList.toggle('is-active', item === button))
}))

document.querySelectorAll('.area-choices button').forEach(button => button.addEventListener('click', () => {
  const group = button.parentElement
  group.querySelectorAll('button').forEach(item => item.classList.toggle('is-active', item === button))
}))

render('a')
render('b')
render('c')
render('d')
