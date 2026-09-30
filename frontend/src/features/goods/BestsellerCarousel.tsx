import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useRemote } from '../../app/useRemote'
import { ContentImage } from '../../components/ui/ContentImage'
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
  if (state.loading || state.error || !state.data?.items.length) return null
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
  return <Link className="goods-card" to={`/products/${item.eventProductId}`} aria-label={`${item.rank}위 ${item.name}, ${item.boothName}, ${goodsState(item)}. 상품 안내 보기`}>
    <div className="goods-picture"><span className="goods-rank" aria-hidden="true">{String(item.rank).padStart(2,'0')}</span>
      <ContentImage url={item.imageUrl} kind="product" alt={item.name}/>
      {item.soldOut && <span className="goods-stock">품절 표기</span>}
    </div>
    <div className="goods-copy"><p className="goods-maker">{item.boothName}</p><h3>{item.name}</h3><p className="goods-price">{item.price.toLocaleString('ko-KR')}<span>원</span></p>
      <p className="goods-event">{item.eventName}</p><p className="goods-state">{goodsState(item)}</p><span className="goods-action">상품 안내 보기 <span aria-hidden="true">↗</span></span>
    </div></Link>
}
