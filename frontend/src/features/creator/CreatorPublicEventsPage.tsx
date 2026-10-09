import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useRemote } from '../../app/useRemote'
import { PageHeader } from '../../components/layout/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { categories, getCategory, type CategoryKey } from '../discovery/categories'
import { currentSiteCategory } from '../discovery/site'
import { creatorCatalogApi } from './catalogApi'

export function registrationQuery(params: URLSearchParams, today: string, site: CategoryKey | null) {
  const category = categories.find(c => c.key === params.get('category')) || getCategory(site)
  const rawPage = Number(params.get('page') || 0)
  const page = Number.isSafeInteger(rawPage) && rawPage >= 0 && rawPage <= 100000 ? rawPage : 0
  return new URLSearchParams({ category: category.code, q: (params.get('q') || '').trim().slice(0, 100),
    page: String(page), size: '20', from: today, sort: 'DATE_ASC', grouped: 'false' })
}

export function CreatorPublicEventsPage() {
  const [params, setParams] = useSearchParams()
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
  const query = registrationQuery(params, today, currentSiteCategory())
  const category = categories.find(c => c.code === query.get('category'))!
  const page = Number(query.get('page'))
  const state = useRemote("features/creator/CreatorPublicEventsPage:CreatorPublicEventsPage:state", async () => {
    const [events, booths] = await Promise.all([creatorCatalogApi.events(query), creatorCatalogApi.mine()])
    return { events, booths }
  }, [query.toString()])
  const data = state.data
  const changePage = (next: number) => {
    setParams({ category: category.key, q: query.get('q') || '', page: String(next) })
  }
  return <>
    <PageHeader eyebrow="Creator · Events" title="공개 행사 부스 등록"
      description="참가할 행사를 선택하고, 이번 행사에서 사용할 부스 소개와 상품을 등록하세요."
      actions={<Link className="btn secondary" to="/creator/booths">내 부스 목록</Link>} />
    <p>기존 부스 연결을 포함해 계정당 행사별 1개만 등록할 수 있습니다. 이미 연결한 부스는 <Link to="/support/management">내 공개 행사·부스</Link>에서 관리해 주세요.</p>
    <p className="item-meta">부스 정보 등록은 주최 측 참가 승인이나 현장 부스 배정을 대신하지 않습니다.</p>
    <EventSearch key={`${category.key}:${query.get('q')}`} category={category.key} search={query.get('q') || ''}
      submit={(selected, q) => setParams({ category: selected, q })} />
    {state.loading ? <LoadingState label="공개 행사를 불러오고 있습니다" />
      : state.error ? <ErrorState error={state.error} retry={() => void state.reload()} />
      : data && <>
        <p className="item-meta">{category.label} · 진행 중이거나 예정된 행사 {data.events.total}개</p>
        {!data.events.items.length ? <EmptyState title="조건에 맞는 공개 행사가 없습니다"
          description="검색어나 분야를 바꿔보세요. 종료된 행사는 목록에서 제외됩니다." />
          : <div className="console-list">{data.events.items.map(({ id, event }) => {
            const booth = data.booths.find(b => b.eventId === id && b.reviewState !== 'EXCLUDED')
            const closed = ['CANCELED', 'POSTPONED', 'RESCHEDULED'].includes(event.operationStatus?.state || '')
            const dates = event.occurrences.filter(o => o.endDate >= today)
            return <article className="list-row" key={id}><div>
              <h2>{event.name}</h2>
              <p className="item-meta">{event.venueName || '장소 미정'}</p>
              <p className="item-meta">{dates.map(o => o.startDate === o.endDate ? o.startDate : `${o.startDate} ~ ${o.endDate}`).join(' · ') || '일정 확인 필요'}</p>
              {closed && <p className="form-alert">일정 취소·변경으로 부스 등록·수정이 마감되었습니다.</p>}
            </div><div className="row-actions">
              {closed || !dates.length ? <span className="item-meta">등록 마감</span>
                : <Link className="btn primary" to={`/creator/catalog/events/${id}/booths/${booth ? booth.participantId : 'new'}`}>{booth ? '부스 관리' : '내 부스 등록'}</Link>}
            </div></article>
          })}</div>}
        <nav className="row-actions" aria-label="공개 행사 페이지" style={{ marginTop: 20 }}>
          <button className="btn secondary" disabled={page === 0} onClick={() => changePage(page - 1)}>이전</button>
          <span>{page + 1} / {Math.max(1, Math.ceil(data.events.total / data.events.size))}</span>
          <button className="btn secondary" disabled={(page + 1) * data.events.size >= data.events.total} onClick={() => changePage(page + 1)}>다음</button>
        </nav>
      </>}
  </>
}

function EventSearch({ category, search, submit }: {
  category: CategoryKey; search: string; submit: (category: CategoryKey, search: string) => void
}) {
  const [selected, setSelected] = useState(category), [q, setQ] = useState(search)
  const searchEvents = (e: FormEvent) => { e.preventDefault(); submit(selected, q.trim()) }
  return <form className="panel form-panel" onSubmit={searchEvents}>
    <div className="form-grid">
      <label className="field"><span>행사 분야</span><select className="select" value={selected} onChange={e => setSelected(e.target.value as CategoryKey)}>
        {categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select></label>
      <label className="field"><span>행사명·장소·취향 주제</span><input className="input" value={q} maxLength={100} placeholder="참가할 행사를 검색하세요" onChange={e => setQ(e.target.value)} /></label>
    </div><button className="btn secondary" type="submit">행사 찾기</button>
  </form>
}
