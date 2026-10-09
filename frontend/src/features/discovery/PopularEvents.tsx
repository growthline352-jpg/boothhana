import { BookingBadge } from '../catalog/BookingBadge'
import { useRemote } from '../../app/useRemote'
import { ContentImage } from '../../components/ui/ContentImage'
import { eventDateLabel, seoulToday } from './browse'
import { categories, categoryForType, categoryEventHref } from './categories'
import { loadPopularEvents } from './popular'

export function PopularEvents({ categoryCode }: { categoryCode?: string }) {
  const today = seoulToday()
  const popular = useRemote("features/discovery/PopularEvents:PopularEvents:popular", () => loadPopularEvents(categoryCode, today), [categoryCode, today])
  const rows = popular.data?.items || []
  const hasSaves = rows.some(row => row.saveCount > 0)
  const field = categories.find(category => category.code === categoryCode)?.label || '전체 분야'
  const description = popular.data && !hasSaves
    ? `아직 저장된 행사가 없어 ${field}의 가까운 일정부터 보여드려요.`
    : `${field}에서 회원들이 많이 저장한 순으로 보여드려요.`
  return <section className="category-popular" aria-labelledby="category-popular-title">
    <div className="category-popular-heading"><h2 id="category-popular-title">인기있는 행사</h2><p>{description}</p></div>
    {popular.loading ? <p className="category-popular-status" role="status">인기 행사를 불러오는 중이에요.</p>
      : popular.error ? <div className="category-popular-status" role="alert">인기 행사를 불러오지 못했어요. <button type="button" onClick={() => void popular.reload()}>다시 시도</button></div>
        : !rows.length ? <p className="category-popular-status">현재 조건에 맞는 공개된 개최 예정 행사가 없어요.</p>
          : <div className="category-popular-grid">{rows.map((row, index) => {
            const category = categoryForType(row.event.subcategory)
            const href = categoryEventHref(category.key, row.id)
            return <a className="category-popular-card" href={href} key={row.id}>
              <div className="category-popular-image"><ContentImage url={row.banner?.url} kind="event" eventType={row.event.subcategory} alt={`${row.event.name} 대표 이미지`}/><span className="category-popular-rank">{index + 1}</span></div>
              <div className="category-popular-copy"><span className="category-popular-type">{category.label}</span><h3>{row.event.name}</h3><BookingBadge event={row.event}/><p>{eventDateLabel(row.event.occurrences)} · {row.event.venueName || '장소 확인 필요'}</p><span className="category-popular-saves">보관함에 저장 {row.saveCount.toLocaleString('ko-KR')}명</span></div>
            </a>
          })}</div>}
  </section>
}
