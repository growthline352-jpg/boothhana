import { Link, useSearchParams } from 'react-router'
import { useAuth } from '../../app/useAuth'
import { useRemote } from '../../app/useRemote'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { DiscoveryIcon as Icon } from '../discovery/DiscoveryIcon'
import { useInterests } from './InterestProvider'
import { FollowButton } from './FollowButton'
import { newInterest, subcultureApi, type Interest } from './api'
import { TastePortrait } from './SubcultureUI'
import './characterHomeHero.css'

export function CharacterHomeHero() {
  const auth = useAuth(), interests = useInterests(), [params, setParams] = useSearchParams()
  const entries = auth.status === 'authenticated' ? interests.settings?.entries ?? [] : []
  const favorites = entries.filter(entry => entry.kind === 'CHARACTER' || !entry.subjectId && !entry.exhibitorId)
  const works = [...new Set(entries.filter(entry => entry.kind !== 'CREATOR').map(entry => entry.kind === 'WORK' ? entry.label || '' : entry.workName || entry.customWork).filter(Boolean))]
  const requested = params.get('work') || (!favorites.length && params.get('characters') !== 'browse' ? works[0] || '' : ''), work = works.includes(requested) ? requested : ''
  const browse = params.get('characters') === 'browse' || !favorites.length
  const page = Math.max(0, Math.min(1000, Math.trunc(Number(params.get('characterPage')) || 0)))
  const ready = !auth.loading && auth.status !== 'error' && (!interests.loading && !interests.error || auth.status === 'anonymous')
  const catalog = useRemote("features/subculture/CharacterHomeHero:CharacterHomeHero:catalog", () => ready && browse ? subcultureApi.subjects(work, 'CHARACTER', page) : Promise.resolve([]), [ready, browse, work, page, auth.generation])
  const workEntry = entries.find(entry => entry.kind === 'WORK' && entry.label === work)
  const cards: Interest[] = browse
    ? (catalog.data ?? []).filter(subject => !work || (workEntry ? subject.workId === workEntry.subjectId : subject.workName === work)).map(subject => newInterest(subject))
    : favorites.filter(entry => !work || (entry.workName || entry.customWork) === work)
  const offset = Math.max(0, Math.min(Math.max(0, Math.ceil(cards.length / 2) - 1), Math.trunc(Number(params.get('characterSlide')) || 0)))
  function choose(name: string, explore = false) {
    const next = new URLSearchParams(params)
    next.delete('characterPage'); next.delete('characterSlide')
    if (name) next.set('work', name); else next.delete('work')
    if (explore) next.set('characters', 'browse'); else next.delete('characters')
    setParams(next, {replace: true})
  }
  function move(delta: number) {
    const next = new URLSearchParams(params)
    if (offset + delta >= Math.ceil(cards.length / 2) && browse && catalog.data?.length === 40) {
      next.set('characterPage', String(page + 1)); next.delete('characterSlide')
    } else if (offset + delta < 0 && browse && page > 0) {
      next.set('characterPage', String(page - 1)); next.set('characterSlide', '19')
    } else next.set('characterSlide', String(offset + delta))
    setParams(next, {replace: true})
  }
  return <>
    <section className="sc-taste-hero" aria-label="관심 캐릭터 탐색">
      <div className="sc-taste-intro"><span className="sc-eyebrow">FIND YOUR FAVORITES</span><h1>{favorites.length ? '좋아하는 캐릭터부터,\n다시 만나볼까요?' : '어떤 캐릭터를\n만나볼까요?'}</h1><p>관심 캐릭터를 둘러보고 새로운 취향도 발견해보세요.</p><div className="sc-taste-hint"><Icon name="bookmark" size={18}/><span>작품과 캐릭터를 알아두면<br/>다음에 더 쉽게 찾을 수 있어요.</span></div></div>
      <div className="sc-taste-browser">
        <div className="sc-work-switch" role="group" aria-label="관심 작품으로 캐릭터 찾기"><button disabled={!favorites.length} aria-pressed={!work && !browse} onClick={() => choose('')}>내 관심 <span>{favorites.length}</span></button>{works.map(name => <button key={name} aria-pressed={work === name} onClick={() => choose(name, true)}>{name}</button>)}<button className="sc-more-characters" aria-pressed={!work && browse} onClick={() => choose('', true)}>캐릭터 더 찾기 ＋</button></div>
        <div className="sc-taste-results"><div className="sc-taste-result-title"><strong>{browse ? work ? work + '의 캐릭터' : '새로운 캐릭터 둘러보기' : '내가 좋아하는 캐릭터'}</strong>{!browse && <span>{cards.length}명 관심 등록</span>}</div>
          {!ready ? auth.status === 'error' || interests.error ? <ErrorState error={interests.error || new Error('계정을 다시 확인해 주세요.')} retry={() => void (auth.status === 'error' ? auth.refresh() : interests.reload())}/> : <LoadingState label="관심 캐릭터를 불러오고 있어요"/> : browse && catalog.loading ? <LoadingState label="캐릭터를 찾고 있어요"/> : catalog.error && browse ? <ErrorState error={catalog.error} retry={() => void catalog.reload()}/> : <div className="sc-taste-cards">{cards.slice(offset * 2, offset * 2 + 2).map(entry => <CharacterCard key={entry.subjectId || entry.id} entry={entry}/>)}{!cards.length && <div className="sc-taste-empty"><strong>{work ? '이 작품의 등록된 캐릭터를 아직 찾지 못했어요.' : '등록된 캐릭터를 준비하고 있어요.'}</strong><p>목록에 없는 작품·캐릭터도 직접 관심에 추가할 수 있어요.</p><Link to="/account/interests">작품·캐릭터 직접 입력 <Icon name="chevron" size={14}/></Link></div>}</div>}
        </div>
        {(cards.length > 2 || page > 0) && <nav className="sc-character-pager" aria-label="캐릭터 카드 페이지"><button disabled={!offset && !page} onClick={() => move(-1)}>이전</button><span>{page * 20 + offset + 1}페이지</span><button disabled={(offset + 1) * 2 >= cards.length && !(browse && catalog.data?.length === 40)} onClick={() => move(1)}>다음</button></nav>}
        <div className="sc-taste-bottom"><span>캐릭터를 선택하면 출처와 관련 정보를 볼 수 있어요.</span><Link to="/subculture/subjects">캐릭터 전체 보기 <Icon name="arrow" size={15}/></Link></div>
      </div>
    </section>
    <nav className="sc-home-shortcuts" aria-label="서브컬처 바로가기"><Link to="/subculture/creators"><Icon name="sparkles"/><span><strong>작가·서클 둘러보기</strong><small>그리는 캐릭터에서 작가를 발견해요</small></span><Icon name="chevron" size={16}/></Link><Link to="/discover?category=subculture&period=all&sort=recent"><Icon name="calendar"/><span><strong>갈 행사부터 찾기</strong><small>일정과 장소를 먼저 살펴보세요</small></span><Icon name="chevron" size={16}/></Link><Link to="/library"><Icon name="bookmark"/><span><strong>내 방문 준비</strong><small>저장한 부스와 방문 계획을 확인해요</small></span><Icon name="chevron" size={16}/></Link></nav>
  </>
}

function CharacterCard({entry}: {entry: Interest}) {
  const name = entry.label || entry.customName || '관심 캐릭터', linked = !!entry.subjectId && entry.available !== false
  const contents = <><TastePortrait name={name} imageUrl={linked?entry.imageUrl:null} className="sc-taste-placeholder" fallbackNote="캐릭터 이미지 준비 중" loading="eager"/><small>{entry.workName || entry.customWork || '출처 작품 미확인'}</small><h2>{name}</h2><span>{linked ? '캐릭터 알아보기' : '관심 정보 확인'} <Icon name="chevron" size={13}/></span></>
  return <article className="sc-taste-card"><Link className="sc-taste-character" to={linked ? '/subculture/subjects/' + entry.subjectId : '/account/interests'}>{contents}</Link><FollowButton entry={entry}/>{!linked && <p className="sc-taste-pending">{entry.subjectId ? '현재 비공개' : '직접 입력 · 정보 연결 대기'}</p>}</article>
}
