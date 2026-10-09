import { Link,useLocation,useParams,useSearchParams } from 'react-router'
import { useRemote } from '../../app/useRemote'
import { LoadingState,ErrorState } from '../../components/ui/States'
import { SafeLink } from '../catalog/Shared'
import { ContentImage } from '../../components/ui/ContentImage'
import { subcultureApi,type CreatorProduct } from './api'
import { useAuth } from '../../app/useAuth'
import { useInterests } from './InterestProvider'
import { TasteTitle,TasteSectionTitle,TasteEmpty,TasteExploreNav } from './SubcultureUI'
import './subculture.css'
export function creatorPrice(product:CreatorProduct['data']){
 const price=product.price;if(!price)return '가격 미확인'
 const amount=Number(price.amount)
 return price.currency==='KRW'&&Number.isFinite(amount)?amount.toLocaleString('ko-KR')+'원':price.amount+' '+price.currency
}
export function TasteProductCard({product:p}:{product:CreatorProduct}){
 const location=useLocation()
 return <article className="sc-taste-product-card"><Link to={'/subculture/products/'+p.id} state={{productReturnTo:location.pathname+location.search}}><div className="sc-taste-product-art"><ContentImage url={null} kind="product" alt={p.data.name+' · 공개 대표 이미지 미등록'}/></div><div><small>{p.creator.name}</small><h3>{p.data.name}</h3><strong>{creatorPrice(p.data)}</strong><p>{p.status}</p><span>{p.subjects.map(s=>s.name).join(' · ')}</span></div></Link></article>
}
export function CreatorProductList({subjectId,creatorId,mine=false,title}:{subjectId?:string;creatorId?:string;mine?:boolean;title?:string}){
 const auth=useAuth(),interests=useInterests()
 const [params,setParams]=useSearchParams(),page=Math.max(0,Math.min(1000,Math.trunc(Number(params.get('catalogPage'))||0))),q=(subjectId||creatorId||mine?'':params.get('q')||'').trim().slice(0,100)
 const query=new URLSearchParams({page:String(page)});if(subjectId)query.set('subjectId',subjectId);if(creatorId)query.set('creatorId',creatorId)
 if(mine&&params.get('interestId'))query.set('interestId',params.get('interestId')!)
 const state=useRemote(()=>mine?subcultureApi.myProducts(query):subcultureApi.products(query),[query.toString(),mine,auth.generation,auth.user?.id,interests.settings?.revision])
 const embedded=!!subjectId||!!creatorId||mine
 function move(value:number){const next=new URLSearchParams(params);next.set('catalogPage',String(value));setParams(next)}
 const items=state.data?.items.filter(p=>embedded||!q||[p.data.name,p.creator.name,...p.subjects.map(s=>s.name)].join(' ').toLocaleLowerCase('ko-KR').includes(q.toLocaleLowerCase('ko-KR')))||[]
 return <section className={embedded?'sc-live sc-taste-section is-embedded':'content-wrap section-pad sc-live sc-taste-browse'}>{embedded?<TasteSectionTitle title={title||(mine?'내 관심과 관련된 작가 상품':'작가의 상품과 작업')} note="작가의 공개된 작업·판매 기록이에요. 이번 행사 판매 여부는 별도로 확인해요."/>:<><TasteTitle title="작가의 굿즈와 작업" body="관심 캐릭터와 작가의 공개된 상품을 살펴보세요."/><form className="sc-taste-search" key={q} role="search" onSubmit={event=>{event.preventDefault();const next=new URLSearchParams(params),value=String(new FormData(event.currentTarget).get('q')||'').trim();if(value)next.set('q',value);else next.delete('q');setParams(next)}}><label className="discovery-sr-only" htmlFor="sc-product-query">현재 페이지 상품 검색</label><input id="sc-product-query" type="search" name="q" defaultValue={q} maxLength={100} placeholder="현재 페이지의 상품·작가 이름 검색"/><button>검색</button></form><TasteExploreNav q={q}/>{q&&<button className="btn secondary" onClick={()=>{const next=new URLSearchParams(params);next.delete('q');setParams(next)}}>상품 검색 조건 지우기</button>}</>}
 {state.loading?<LoadingState/>:state.error?<ErrorState error={state.error} retry={()=>void state.reload()}/>:<><div className="sc-taste-goods-grid">{items.map(p=><TasteProductCard key={p.id} product={p}/>)}</div>{!items.length&&<TasteEmpty title={q?'이 페이지에서 검색한 상품이 없어요':'아직 확인된 상품이 없어요'} body={q?'검색 조건을 지우거나 다음 페이지를 확인해 보세요.':'작가의 작업과 판매 정보가 공개되면 여기에 모아드려요.'}/>}<nav className="sc-live-pagination" aria-label="작가 상품 페이지"><button disabled={!page} onClick={()=>move(page-1)}>이전</button><span>{page+1}페이지</span><button disabled={!state.data?.hasMore} onClick={()=>move(page+1)}>다음</button></nav></>}
 </section>
}
export function CreatorProductDetail(){
 const {id=''}=useParams(),location=useLocation()
 const state=useRemote(()=>subcultureApi.product(id),[id])
 const candidate=(location.state as {productReturnTo?:unknown}|null)?.productReturnTo
 const back=typeof candidate==='string'&&/^\/subculture(?:\/|\?|$)/.test(candidate)?candidate:'/subculture/products'
 const p=state.data
 return <section className="content-wrap section-pad sc-live sc-taste-detail"><Link className="sc-live-back" to={back}>← 둘러보던 목록</Link>
  {state.loading?<LoadingState/>:state.error?<ErrorState error={state.error} retry={()=>void state.reload()}/>:p&&<div className="sc-taste-product-detail"><div className="sc-taste-product-photo"><ContentImage url={null} kind="product" alt={p.data.name+' · 공개 대표 이미지 미등록'}/><p>공개된 상품 이미지를 준비하고 있어요.</p></div><section className="sc-taste-product-description">
   <Link className="sc-taste-product-creator" to={'/subculture/creators/'+p.creatorId}>{p.creator.name} →</Link><h1>{p.data.name}</h1><p>{p.data.summary}</p><strong className="sc-taste-product-price">{creatorPrice(p.data)}</strong>{p.data.price&&<small>{p.data.price.checkedOn} 확인 · {p.data.price.note||'옵션·배송 조건은 판매 원문에서 확인하세요.'}</small>}
   <div className="sc-taste-chips">{p.subjects.map(s=><Link key={s.id} to={'/subculture/subjects/'+s.id}>{s.name}{s.workName&&' · '+s.workName}</Link>)}</div>
   <div className="sc-taste-sale-location"><span className="sc-taste-evidence">{p.status}</span><h2>행사 판매 여부는 별도 확인해요</h2><p>작가의 공개 판매 기록이에요. 이 상품이 다음 참가 행사에서 판매된다는 뜻은 아니에요.</p><Link to={'/subculture/creators/'+p.creatorId}>작가의 참가 행사 보기 →</Link></div>
   <details className="sc-taste-source-details" open><summary>판매 원문과 확인 근거</summary>{p.data.sources.map((s,i)=><p key={s.url+':'+i}><SafeLink url={s.url}>판매 원문 확인 ↗</SafeLink><br/>{s.evidence}</p>)}{!p.data.sources.length&&<p>공개 판매 원문이 아직 연결되지 않았어요.</p>}</details>
  </section></div>}
 </section>
}
