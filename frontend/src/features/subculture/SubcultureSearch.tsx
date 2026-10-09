import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useRemote } from '../../app/useRemote'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { subcultureApi } from './api'

export function SubcultureSearch() {
  const [params, setParams] = useSearchParams(), q = (params.get('q') || '').slice(0, 100)
  const [draft, setDraft] = useState(q)
  useEffect(() => setDraft(q), [q])
  const subjects = useRemote(() => subcultureApi.subjects(q), [q])
  const creators = useRemote(() => subcultureApi.creators(q), [q])
  return <section className="content-wrap section-pad sc-live"><h1>캐릭터·작가 검색</h1><form className="sc-live-search" role="search" onSubmit={event => {event.preventDefault(); setParams({q: draft.trim()})}}><label htmlFor="sc-unified-search">작품·캐릭터·작가 이름</label><div><input id="sc-unified-search" type="search" value={draft} maxLength={100} onChange={event => setDraft(event.target.value)}/><button>검색</button></div></form><nav className="sc-live-links" aria-label="탐색 바로가기"><Link to="/subculture/subjects">작품·캐릭터 전체</Link><Link to="/subculture/creators">작가·서클 전체</Link><Link to="/discover?category=subculture">행사 찾기</Link><Link to="/subculture/products">작가 상품</Link></nav>
    <section><div className="sc-live-section-title"><h2>작품·캐릭터</h2><Link to={'/subculture/subjects?' + new URLSearchParams({q})}>결과 더 보기 →</Link></div>{subjects.loading ? <LoadingState/> : subjects.error ? <ErrorState error={subjects.error} retry={() => void subjects.reload()}/> : subjects.data?.length ? <div className="sc-live-creator-grid">{subjects.data.slice(0, 6).map(subject => <article key={subject.id} className="sc-live-person"><Link to={'/subculture/subjects/' + subject.id}><small>{subject.workName || subject.medium || '작품'}</small><h3>{subject.name}</h3><p>관련 행사·굿즈·작가 보기 →</p></Link></article>)}</div> : <p>일치하는 작품·캐릭터가 없어요. <Link to="/account/interests">직접 관심에 추가</Link>할 수 있어요.</p>}</section>
    <section><div className="sc-live-section-title"><h2>작가·서클</h2><Link to={'/subculture/creators?' + new URLSearchParams({q})}>결과 더 보기 →</Link></div>{creators.loading ? <LoadingState/> : creators.error ? <ErrorState error={creators.error} retry={() => void creators.reload()}/> : creators.data?.length ? <div className="sc-live-creator-grid">{creators.data.slice(0, 6).map(creator => <article key={creator.id} className="sc-live-person"><Link to={'/subculture/creators/' + creator.id}><h3>{creator.name}</h3><p>참가 행사·판매 정보 보기 →</p></Link></article>)}</div> : <p>일치하는 작가·서클이 없어요. 다른 이름으로 검색해 보세요.</p>}</section>
  </section>
}
