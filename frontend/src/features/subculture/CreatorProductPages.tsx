import { Link,useLocation,useParams,useSearchParams } from 'react-router'
import { useRemote } from '../../app/useRemote'
import { LoadingState,ErrorState } from '../../components/ui/States'
import { SafeLink } from '../catalog/Shared'
import { subcultureApi } from './api'
import { useAuth } from '../../app/useAuth'
import { useInterests } from './InterestProvider'
import './subculture.css'
export function CreatorProductList({subjectId,creatorId,mine=false}:{subjectId?:string;creatorId?:string;mine?:boolean}){
 const auth=useAuth(),interests=useInterests(),location=useLocation()
 const [params,setParams]=useSearchParams(),page=Math.max(0,Math.min(1000,Math.trunc(Number(params.get('catalogPage'))||0)))
 const query=new URLSearchParams({page:String(page)});if(subjectId)query.set('subjectId',subjectId);if(creatorId)query.set('creatorId',creatorId)
 if(mine&&params.get('interestId'))query.set('interestId',params.get('interestId')!)
 const state=useRemote(()=>mine?subcultureApi.myProducts(query):subcultureApi.products(query),[query.toString(),mine,auth.generation,auth.user?.id,interests.settings?.revision])
 function move(value:number){const next=new URLSearchParams(params);next.set('catalogPage',String(value));setParams(next)}
 return <section className={subjectId||creatorId?'sc-live is-embedded':'content-wrap section-pad sc-live'}><div className="sc-live-section-title">{!mine&&!subjectId&&!creatorId?<h1>작가의 상품과 작업</h1>:<h2>{mine?'내 관심과 관련된 작가 상품':'작가의 상품과 작업'}</h2>}</div><p>작가의 판매 기록이에요. 현재 구매 가능 여부와 행사 판매 여부는 원문에서 확인해 주세요.</p>
 {state.loading?<LoadingState/>:state.error?<ErrorState error={state.error} retry={()=>void state.reload()}/>:<><div className="sc-live-creator-grid">{state.data?.items.map(p=><article className="sc-live-person sc-live-product-card" key={p.id}><small>{p.status}</small><Link to={'/subculture/products/'+p.id} state={{productReturnTo:location.pathname+location.search}}><h3>{p.data.name}</h3><p>{p.creator.name}</p><p>{p.subjects.map(s=>s.name).join(' · ')}</p><span>상품 정보 보기 →</span></Link></article>)}</div>{!state.data?.items.length&&<p className="sc-live-empty">아직 확인된 상품이 없어요.</p>}<nav className="sc-live-pagination" aria-label="작가 상품 페이지"><button disabled={!page} onClick={()=>move(page-1)}>이전</button><span>{page+1}페이지</span><button disabled={!state.data?.hasMore} onClick={()=>move(page+1)}>다음</button></nav></>}
 </section>
}
export function CreatorProductDetail(){
 const {id=''}=useParams(),location=useLocation()
 const state=useRemote(()=>subcultureApi.product(id),[id])
 const candidate=(location.state as {productReturnTo?:unknown}|null)?.productReturnTo
 const back=typeof candidate==='string'&&/^\/subculture(?:\/|\?|$)/.test(candidate)?candidate:'/subculture/products'
 return <section className="content-wrap section-pad sc-live"><Link to={back}>← 둘러보던 목록</Link>
  {state.loading?<LoadingState/>:state.error?<ErrorState error={state.error} retry={()=>void state.reload()}/>:state.data&&<>
   <p>{state.data.status}</p><h1>{state.data.data.name}</h1>
   <Link to={'/subculture/creators/'+state.data.creatorId}>{state.data.creator.name}의 다른 상품과 참가 행사 →</Link>
   <p>{state.data.data.summary}</p>
   {state.data.data.price&&<p>확인 당시 가격: {state.data.data.price.amount} {state.data.data.price.currency} · {state.data.data.price.checkedOn}</p>}
   <div className="sc-live-links">{state.data.subjects.map(s=><Link key={s.id} to={'/subculture/subjects/'+s.id}>{s.name} · {s.workName}</Link>)}</div>
   <h2>판매 원문</h2>{state.data.data.sources.map(s=><p key={s.url}><SafeLink url={s.url}>원문에서 확인 ↗</SafeLink><br/>{s.evidence}</p>)}
  </>}
 </section>
}
