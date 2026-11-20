const toast = document.querySelector('.toast')
let toastTimer
function showToast(message) {
  toast.textContent = message
  toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800)
}

document.querySelectorAll('.save-button').forEach(button => button.addEventListener('click', () => {
  const saved = !button.classList.contains('is-saved')
  document.querySelectorAll('.save-button').forEach(item => {
    item.classList.toggle('is-saved', saved)
    item.querySelector('i').className = saved ? 'ph ph-bookmark-simple-fill' : 'ph ph-bookmark-simple'
    const label = item.querySelector('span')
    if (label) label.textContent = saved ? '저장됨' : item.closest('.visit-panel') ? '방문 목록에 저장' : '부스 저장'
  })
  showToast(saved ? '방문 목록에 저장했어요.' : '저장을 취소했어요.')
}))

function highlightMap() {
  const map = document.querySelector('#miniMap')
  map.classList.add('is-highlighted')
  document.querySelector('#visit').scrollIntoView({ behavior: 'smooth', block: 'center' })
  setTimeout(() => map.classList.remove('is-highlighted'), 1600)
  showToast('L 구역 L-14a 위치를 표시했어요.')
}
document.querySelector('#mapButton').addEventListener('click', highlightMap)
document.querySelector('#sideMapButton').addEventListener('click', highlightMap)
document.querySelector('.mobile-map').addEventListener('click', highlightMap)

document.querySelector('.share-button').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(location.href) } catch { /* local file fallback */ }
  showToast('부스 링크를 복사했어요.')
})

const savedBooths = new Set()
let activeFilter = 'all'
const boothRows = [...document.querySelectorAll('.booth-row')]
const search = document.querySelector('#boothSearch')
const empty = document.querySelector('.empty-booths')
const more = document.querySelector('.booth-more')

function applyBoothFilters() {
  const term = search.value.trim().toLocaleLowerCase('ko-KR')
  let visible = 0
  boothRows.forEach(row => {
    const key = row.dataset.name
    const matchesTerm = !term || key.toLocaleLowerCase('ko-KR').includes(term)
    const matchesFilter = activeFilter === 'all'
      || (activeFilter === 'zone-l' && row.dataset.zone === 'l')
      || (activeFilter === 'saved' && savedBooths.has(key))
    row.hidden = !(matchesTerm && matchesFilter)
    if (!row.hidden) visible += 1
  })
  empty.hidden = visible > 0
  more.hidden = activeFilter !== 'all' || Boolean(term)
}

search.addEventListener('input', applyBoothFilters)
document.querySelectorAll('[data-booth-filter]').forEach(button => button.addEventListener('click', () => {
  activeFilter = button.dataset.boothFilter
  document.querySelectorAll('[data-booth-filter]').forEach(item => item.classList.toggle('active', item === button))
  applyBoothFilters()
}))

document.querySelectorAll('.row-save').forEach(button => button.addEventListener('click', () => {
  const row = button.closest('.booth-row')
  const key = row.dataset.name
  const saved = !savedBooths.has(key)
  if (saved) savedBooths.add(key)
  else savedBooths.delete(key)
  button.classList.toggle('is-saved', saved)
  button.querySelector('i').className = saved ? 'ph ph-bookmark-simple-fill' : 'ph ph-bookmark-simple'
  showToast(saved ? '부스를 저장했어요.' : '부스 저장을 취소했어요.')
  if (activeFilter === 'saved') applyBoothFilters()
}))

document.querySelectorAll('.row-map').forEach(button => button.addEventListener('click', () => {
  const row = button.closest('.booth-row')
  const location = row.querySelector('.booth-location').textContent
  showToast(`배치도에서 ${location} 위치를 열어요.`)
}))

more.addEventListener('click', () => showToast('다음 부스 목록을 불러오는 동작입니다.'))
