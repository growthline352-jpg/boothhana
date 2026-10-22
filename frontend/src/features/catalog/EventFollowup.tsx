import type { EventData } from '../collection/api'
import { categoryForType, categoryHref } from '../discovery/categories'
import { seoulToday } from '../discovery/browse'

export function EventFollowup({ event, today = seoulToday() }: { event: EventData; today?: string }) {
  if (!event.occurrences.length || event.occurrences.some(row => row.endDate >= today)) return null
  const category = categoryForType(event.subcategory), base = categoryHref(category.key)
  const next = new URL(base, 'https://local.invalid')
  next.searchParams.set('period', 'upcoming')
  next.searchParams.set('view', 'results')
  if (['SEOUL', 'GYEONGGI'].includes(event.region)) next.searchParams.set('region', event.region)
  const href = next.origin === 'https://local.invalid' ? next.pathname + next.search : next.href
  return <section className="visit-next-discovery" aria-label="다음 행사 찾기">
    <h2>다음에 갈 곳을 찾아보세요</h2>
    <p>공개된 일정이 지난 행사입니다. 이 페이지는 당시 행사와 참가 부스의 기록입니다. 다음 회차의 일정·참가 정보는 별도로 확인해 주세요.</p>
    <div className="row-actions"><a className="btn primary" href={href}>같은 지역의 예정 {category.label} 찾기 →</a><a className="btn secondary" href={base}>{category.label} 전체 둘러보기</a></div>
  </section>
}
