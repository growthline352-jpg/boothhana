import { Link, useLocation, useSearchParams } from 'react-router'
import { useAuth } from '../../app/useAuth'
import { useRemote } from '../../app/useRemote'
import { ContentImage } from '../../components/ui/ContentImage'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { DiscoveryIcon as Icon } from '../discovery/DiscoveryIcon'
import { eventDateLabel, seoulToday } from '../discovery/browse'
import { labels, saleStates, scopes } from '../catalog/Shared'
import { SaveButton } from '../library/SaveButton'
import { useInterests } from './InterestProvider'
import { FollowButton } from './FollowButton'
import { newInterest, subcultureApi, type Creator, type CreatorProduct, type Feed } from './api'
import './subcultureHome.css'
import { CharacterHomeHero } from './CharacterHomeHero'

// Presentation follows the user-selected character hero screenshot. All relationships and
// sale evidence come from the existing API, never from the preview fixtures.
export function SubcultureHome() {
  const auth = useAuth(), interests = useInterests(), location = useLocation()
  const [params, setParams] = useSearchParams()
  const member = auth.status === 'authenticated'
  const entries = member ? interests.settings?.entries ?? [] : []
  const requested = params.get('interestId') || ''
  const active = entries.some(entry => entry.id === requested) ? requested : ''
  const page = Math.max(0, Math.min(1000, Math.trunc(Number(params.get('page')) || 0)))
  const catalogPage = Math.max(0, Math.min(1000, Math.trunc(Number(params.get('catalogPage')) || 0)))
  const ready = !auth.loading && auth.status !== 'error' && (!member || !interests.loading && !interests.error)
  const query = new URLSearchParams({ page: String(page) })
  const productQuery = new URLSearchParams({ page: String(catalogPage) })
  if (member && active) { query.set('interestId', active); productQuery.set('interestId', active) }
  const feed = useRemote(() => ready ? subcultureApi.feed(member, query) : Promise.resolve<Feed | null>(null),
    [ready, member, auth.generation, auth.user?.id, query.toString(), interests.settings?.revision])
  const products = useRemote(() => ready && member ? subcultureApi.myProducts(productQuery) : Promise.resolve<{items: CreatorProduct[]; hasMore: boolean} | null>(null),
    [ready, member, auth.generation, auth.user?.id, productQuery.toString(), interests.settings?.revision])
  const from = location.pathname + location.search
  function filter(id: string) {
    const next = new URLSearchParams(params)
    next.delete('page'); next.delete('catalogPage')
    if (id) next.set('interestId', id); else next.delete('interestId')
    setParams(next, { replace: true })
  }
  function move(key: string, value: number) {
    const next = new URLSearchParams(params); next.set(key, String(value)); setParams(next)
  }
  const busy = auth.loading || member && interests.loading || feed.loading
  return <section className="sc-home sc-container" aria-label="서브컬처 발견">
    <CharacterHomeHero/>
    {auth.status === 'error' ? <ErrorState error={new Error('계정을 확인하지 못했습니다. 다시 확인해 주세요.')} retry={() => void auth.refresh()}/> : <>
      {member && interests.error && <ErrorState error={interests.error} retry={() => void interests.reload()}/>}
      {!!entries.length && <div className="sc-interest-filters" role="group" aria-label="관심으로 결과 좁히기"><button aria-pressed={!active} onClick={() => filter('')}>내 관심 전체</button>{entries.map(entry => <button key={entry.id} aria-pressed={entry.id === active} onClick={() => filter(entry.id)}>{entry.label || entry.customName || '관심 대상'}</button>)}</div>}

      {busy ? <LoadingState label="공개된 행사와 판매 정보를 확인하고 있어요"/> : feed.error ? <ErrorState error={feed.error} retry={() => void feed.reload()}/> : ready && feed.data && <>
        {feed.data.unlinked && <p className="sc-discovery-unlinked"><Icon name="info" size={17}/>아직 이 관심에 연결된 공개 정보가 없어요. 아래 행사는 일반 행사 목록이에요.</p>}
        <HomeFeed value={feed.data} from={from}/>
        {(page > 0 || feed.data.hasMore) && <HomePager label="행사 결과 페이지" page={page} hasMore={feed.data.hasMore} move={value => move('page', value)}/>}
      </>}
      {ready && member && (products.error || products.data && (products.data.items.length > 0 || catalogPage > 0)) && <section className="sc-home-section"><div className="sc-discovery-section-head"><div><h2>내 관심과 관련된 작가 상품</h2><p>행사 판매 정보와 별도로, 작가의 작업과 판매 기록을 둘러보세요.</p></div><Link to="/subculture/products">상품 전체 <Icon name="chevron" size={14}/></Link></div>
        {products.error ? <ErrorState error={products.error} retry={() => void products.reload()}/> : <><div className="sc-home-catalog">{products.data?.items.map(product => <Link key={product.id} to={'/subculture/products/' + product.id} state={{productReturnTo: from}}><small>{product.creator.name}</small><h3>{product.data.name}</h3><p>{product.subjects.map(subject => subject.name).join(' · ')}</p><span>판매 원문·행사 관련성 확인 <Icon name="arrow" size={15}/></span></Link>)}</div>{!products.data?.items.length && <p>이 페이지에는 상품이 없어요. 이전 페이지로 돌아가 주세요.</p>}{(catalogPage > 0 || products.data?.hasMore) && <HomePager label="작가 상품 페이지" page={catalogPage} hasMore={!!products.data?.hasMore} move={value => move('catalogPage', value)}/>}</>}
      </section>}
    </>}
  </section>
}

export function homeEventDate(event: Feed['events'][number]['event'], today = seoulToday()) {
  const dates = [...event.occurrences].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const next = dates.find(date => date.endDate >= today) ?? dates[0]
  return next?.startDate || ''
}

export function HomeFeed({value, from}: {value: Feed; from: string}) {
  const hasGoods = value.goods.length > 0
  return <>
    <div className={'sc-discovery-lead' + (hasGoods ? '' : ' is-events-only')}>
      <section aria-labelledby="home-events-title"><div className="sc-discovery-section-head"><h2 id="home-events-title">{value.personalized ? '관심으로 찾은 행사' : '다가오는 행사'}</h2><Link to="/discover?category=subculture">행사 전체 <Icon name="chevron" size={14}/></Link></div>
        {value.events.length ? <div className="sc-discovery-events">{value.events.map((row, index) => {
          const date = homeEventDate(row.event), state = row.event.operationStatus?.state
          return <Link key={row.id} to={'/discover/' + row.id} state={{subcultureReturnTo: from}} className={'sc-discovery-event ' + ['', 'navy', 'green'][index % 3]}>
            <span className="sc-discovery-date" aria-label={date || '날짜 미확인'}>{date ? <><small>{Number(date.slice(5, 7))}월</small><strong>{date.slice(8)}</strong></> : <small>일정<br/>미확인</small>}</span>
            <div><span className={'sc-discovery-evidence' + (row.reasons.length ? ' is-confirmed' : '')}>{row.reasons.join(' · ') || labels[row.event.subcategory] || '서브컬처 행사'}</span><h3>{row.event.name}</h3><p>{eventDateLabel(row.event.occurrences)}<br/>{[row.event.region, row.event.venueName].filter(Boolean).join(' · ')}</p>{state && ['CANCELED', 'POSTPONED', 'RESCHEDULED'].includes(state) && <p className="sc-home-warning">{state === 'CANCELED' ? '행사 취소' : state === 'POSTPONED' ? '행사 연기' : '일정 변경'} · 공식 안내 확인</p>}<span className="sc-discovery-action">행사 안내 보기 <Icon name="arrow" size={15}/></span></div>
          </Link>
        })}</div> : <p className="sc-discovery-empty">{value.personalized ? '연결된 예정 행사는 아직 없어요. 작가와 판매 정보를 먼저 살펴보세요.' : '현재 공개된 예정 행사가 없어요. 새 일정이 확인되면 안내할게요.'}</p>}
      </section>
      {hasGoods && <section aria-labelledby="home-goods-title"><div className="sc-discovery-section-head"><h2 id="home-goods-title">{value.personalized ? '관심으로 찾은 굿즈' : '눈여겨볼 굿즈'}</h2><Link to="/subculture/products">작가 상품 <Icon name="chevron" size={14}/></Link></div><div className="sc-discovery-goods">{value.goods.map(good => <HomeGood key={good.eventId + ':' + good.id} good={good} from={from}/>)}</div></section>}
    </div>
    {!!value.creators.length && <section className="sc-home-section"><div className="sc-discovery-section-head"><div><h2>{value.personalized ? '이 취향을 그리는 작가' : '작가·서클 둘러보기'}</h2><p>{value.personalized ? '관심과 연결된 작가예요. 행사 참가는 각각의 안내에서 확인하세요.' : '작가의 상품과 참가 행사를 둘러보며 새로운 취향을 발견해 보세요.'}</p></div><Link to="/subculture/creators">작가 전체 <Icon name="chevron" size={14}/></Link></div><div className="sc-home-creators">{value.creators.map(creator => <HomeCreator key={creator.id} creator={creator}/>)}</div></section>}
  </>
}

function HomeGood({good, from}: {good: Feed['goods'][number]; from: string}) {
  const product = good.data, path = `/discover/${good.eventId}/booths/${good.participantId}?product=${good.id}`
  const stale = good.verification?.state === 'NOT_RECONFIRMED', inactive = ['SOLD_OUT', 'CANCELED'].includes(product.saleState)
  const confirmed = product.evidenceScope === 'EVENT_SALE_CONFIRMED' && !stale && !inactive
  const amount = product.price ? Number(product.price.amount) : NaN
  const price = product.price && Number.isFinite(amount) ? `${amount.toLocaleString('ko-KR')}${product.price.currency === 'KRW' ? '원' : ' ' + product.price.currency}` : '가격 미확인'
  return <article className="sc-home-good"><div className="sc-good-image"><Link to={path} state={{subcultureReturnTo: from}}><ContentImage url={good.images[0]?.url} kind="product" alt={product.name}/></Link><SaveButton target={{type: 'PRODUCT', eventId: good.eventId, id: good.id, participantId: good.participantId}} compact/></div><div className="sc-good-info"><Link className="sc-meta" to={`/discover/${good.eventId}/booths/${good.participantId}`} state={{subcultureReturnTo: from}}>{product.memberName || good.participantName}</Link><h3><Link to={path} state={{subcultureReturnTo: from}}>{product.name}</Link></h3><strong className="sc-price">{price}</strong><p className={confirmed ? 'sc-confirmed' : 'sc-muted'}><Icon name={confirmed ? 'check' : 'info'} size={14}/>{inactive ? saleStates[product.saleState] : stale ? '최근 판매 여부 재확인 필요' : scopes[product.evidenceScope]}</p></div><Link className="sc-discovery-sale" to={path} state={{subcultureReturnTo: from}}>{good.eventName} · {good.participantName} <Icon name="chevron" size={12}/></Link></article>
}

function HomeCreator({creator}: {creator: Creator}) {
  const path = '/subculture/creators/' + creator.id
  return <article className="sc-home-creator"><div className="sc-creator-heading"><Link to={path} className="sc-avatar" aria-label={creator.name}>{Array.from(creator.name)[0]}</Link><div><h3><Link to={path}>{creator.name}</Link></h3><span className="sc-meta">{creator.kind === 'CIRCLE' ? '서클' : '작가·창작자'}</span></div></div><p>작업과 판매 정보, 참가 행사를 한곳에서 살펴보세요.</p><div className="sc-card-bottom"><Link to={path}>작가 둘러보기 <Icon name="arrow" size={15}/></Link><FollowButton entry={newInterest(undefined, creator)}/></div></article>
}

function HomePager({label, page, hasMore, move}: {label: string; page: number; hasMore: boolean; move: (page: number) => void}) {
  return <nav className="sc-home-pagination" aria-label={label}><button disabled={!page} onClick={() => move(page - 1)}>이전</button><span>{page + 1}페이지</span><button disabled={!hasMore} onClick={() => move(page + 1)}>다음</button></nav>
}
