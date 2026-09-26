import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useRemote } from '../../app/useRemote'
import type { GoodsFeed, RankedGood } from './api'
import { carouselEdges, goodsState, isGoodsFeed, rankingDate } from './rankingView'
import './goods.css'

export function BestsellerSection({ category = 'SUBCULTURE' }: { category?: string }) {
  const state = useRemote(async () => {
    const { goodsApi } = await import('./api')
    const response: unknown = await goodsApi.bestsellers(category)
    if (!isGoodsFeed(response)) throw new Error('판매량 집계 응답을 확인하지 못했어요.')
    return response
  }, [category])
  if (state.loading) return <section className="discovery-container goods-section" aria-label="판매량 굿즈 확인 중" aria-busy="true"><h2>많이 판매된 굿즈</h2><p role="status">판매 기록을 확인하고 있어요.</p></section>
  if (state.error) return <section className="discovery-container goods-section goods-empty"><h2>많이 판매된 굿즈</h2><p>판매 기록을 불러오지 못했어요. 아래 행사 목록은 계속 이용할 수 있어요.</p><button className="btn secondary" onClick={() => void state.reload()}>판매 목록 다시 확인</button></section>
  if (!state.data || !isGoodsFeed(state.data) || !state.data.items.length) return <section className="discovery-container goods-section goods-empty"><h2>많이 판매된 굿즈</h2><p>아직 집계된 판매 굿즈가 없어요.</p><small>판매 기록과 메인 노출 승인이 있는 상품부터 소개합니다. 외부 상품의 인기도를 추정해 순위를 만들지 않아요.</small></section>
  return <GoodsCarousel key={category} feed={state.data}/>
}

export function GoodsCarousel({ feed }: { feed: GoodsFeed }) {
  const id = useId()
  const rail = useRef<HTMLOListElement>(null)
  const [edges, setEdges] = useState({previous:false,next:feed.items.length>1})
  const [visible, setVisible] = useState('')
  const update = () => {
    const el = rail.current
    if (!el) return
    setEdges(carouselEdges(el.scrollLeft,el.clientWidth,el.scrollWidth))
    const box = el.getBoundingClientRect()
    const shown = Array.from(el.children).map((child,index) => ({rect:child.getBoundingClientRect(),index}))
      .filter(({rect}) => rect.right > box.left + 8 && rect.left < box.right - 8)
    setVisible(shown.length ? `${shown[0].index+1}–${shown[shown.length-1].index+1} / ${feed.items.length}` : '')
  }
  useEffect(() => {
    const el = rail.current
    if (!el) return
    el.scrollLeft = 0
    update()
    el.addEventListener('scroll',update,{passive:true})
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(el)
    window.addEventListener('resize',update)
    return () => {el.removeEventListener('scroll',update);observer?.disconnect();window.removeEventListener('resize',update)}
  }, [feed])
  const move = (direction:number) => {
    const el = rail.current
    if (!el) return
    const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    el.scrollBy({left:direction * el.clientWidth * .88,behavior})
  }
  return <section className="discovery-container goods-section" aria-roledescription="캐러셀" aria-labelledby={`${id}-title`}>
    <div className="goods-head"><div><p className="goods-kicker">판매 기록으로 만나는 취향</p><h2 id={`${id}-title`}>많이 판매된 굿즈</h2><p className="goods-subtitle">최근 30일 · 부스하나 POS 판매수량순 · 취소 제외</p></div>
      <div className="goods-controls"><span className="goods-visible" aria-live="polite" aria-atomic="true">{visible}</span>
        <button type="button" aria-label="이전 굿즈 보기" aria-controls={`${id}-rail`} disabled={!edges.previous} onClick={() => move(-1)}>←</button>
        <button type="button" aria-label="다음 굿즈 보기" aria-controls={`${id}-rail`} disabled={!edges.next} onClick={() => move(1)}>→</button>
      </div></div>
    <ol ref={rail} id={`${id}-rail`} className="goods-rail" tabIndex={0} aria-label="판매수량순 굿즈 목록. 좌우 방향키 또는 스와이프로 이동하세요."
      onKeyDown={event => {if(event.target!==event.currentTarget)return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();move(event.key==='ArrowRight'?1:-1)}}}>
      {feed.items.map(item => <li className="goods-slide" key={item.productId}><GoodsCard item={item}/></li>)}
    </ol>
    <details className="goods-basis"><summary>어떤 기준으로 집계하나요?</summary><p>{rankingDate(feed.from)}부터 {rankingDate(feed.to)}까지의 최근 30일 판매 기록 중, 공개·노출 승인된 상품을 수량순으로 최대 12개 소개합니다. 결제 검증된 전체 시장 순위가 아니라 부스하나에 기록한 POS 판매 기준입니다.</p><p>아래 행사 검색 기간과 별개로 집계합니다. 예약·취소 판매·미확인 외부 판매량은 포함하지 않습니다. 노출 시점의 가격·품절 표기는 판매 당시와 다를 수 있으며 현장 재고를 보장하지 않습니다. {rankingDate(feed.asOf)} 집계.</p></details>
  </section>
}

export function GoodsCard({ item }: { item: RankedGood }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false),[item.imageUrl])
  return <Link className="goods-card" to={`/products/${item.eventProductId}`} aria-label={`${item.rank}위 ${item.name}, ${item.boothName}, ${goodsState(item)}. 상품 안내 보기`}>
    <div className="goods-picture"><span className="goods-rank" aria-hidden="true">{String(item.rank).padStart(2,'0')}</span>
      {item.imageUrl && !failed ? <img src={item.imageUrl} alt={item.name} loading="lazy" decoding="async" onError={() => setFailed(true)}/>
        : <div className="goods-image-empty" aria-label="상품 이미지 미확보"><span aria-hidden="true">◇</span><small>상품 이미지 준비 중</small></div>}
      {item.soldOut && <span className="goods-stock">품절 표기</span>}
    </div>
    <div className="goods-copy"><p className="goods-maker">{item.boothName}</p><h3>{item.name}</h3><p className="goods-price">{item.price.toLocaleString('ko-KR')}<span>원</span></p>
      <p className="goods-event">{item.eventName}</p><p className="goods-state">{goodsState(item)}</p><span className="goods-action">상품 안내 보기 <span aria-hidden="true">↗</span></span>
    </div></Link>
}
