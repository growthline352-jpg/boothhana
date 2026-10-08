import { useState,type FormEvent } from 'react'
import { Link,useLocation,useParams,useSearchParams } from 'react-router'
import { useAuth } from '../../app/useAuth'
import { useRemote } from '../../app/useRemote'
import { LoadingState,ErrorState } from '../../components/ui/States'
import { ContentImage } from '../../components/ui/ContentImage'
import { ProductCard,SafeLink,labels } from '../catalog/Shared'
import { SaveButton } from '../library/SaveButton'
import { eventDateLabel } from '../discovery/browse'
import { useInterests } from './InterestProvider'
import { FollowButton } from './FollowButton'
import { CreatorProductList } from './CreatorProductPages'
import { subcultureApi,newInterest,type Feed,type Creator } from './api'
import '../catalog/catalog.css'
import '../visit/visit.css'
import './subculture.css'

export function SubcultureHome(){const auth=useAuth();return <><SubcultureResults/>{auth.status==='authenticated'&&<CreatorProductList key={auth.user?.id+':'+auth.generation} mine/>}</>}
export function SubcultureResults({subjectId,creatorId}:{subjectId?:string;creatorId?:string}){
 const auth=useAuth(),interests=useInterests(),[params,setParams]=useSearchParams(),location=useLocation()
 const page=Math.max(0,Math.min(1000,Number(params.get('page'))||0)),interest=params.get('interestId')||''
 const isDetail=!!subjectId||!!creatorId,member=!isDetail&&auth.status==='authenticated'
 const query=new URLSearchParams({page:String(page)})
 if(subjectId)query.set('subjectId',subjectId);if(creatorId)query.set('creatorId',creatorId);if(member&&interest)query.set('interestId',interest)
 const data=useRemote(()=>auth.loading||auth.status==='error'?Promise.resolve<Feed|null>(null):subcultureApi.feed(member,query),[auth.status,auth.generation,auth.user?.id,query.toString(),interests.settings?.revision])
 function filter(id:string){const next=new URLSearchParams(params);next.delete('page');next.delete('catalogPage');if(id)next.set('interestId',id);else next.delete('interestId');setParams(next)}
 if(auth.status==='error')return <section className="content-wrap section-pad"><ErrorState error={new Error('계정을 확인하지 못했습니다. 다시 확인해 주세요.')} retry={()=>void auth.refresh()}/></section>
 return <section className={'content-wrap section-pad sc-live'+(isDetail?' is-embedded':'')}>
  {!isDetail&&<><header className="sc-live-title"><h1>좋아하는 취향을, 어디서 만날까요?</h1><p>관심으로 찾은 행사와 굿즈, 함께 만드는 작가를 만나보세요.</p></header><nav className="sc-live-links" aria-label="서브컬처 탐색"><Link to="/discover?category=subculture">행사 찾기</Link><Link to="/subculture/subjects">작품·캐릭터 찾기</Link><Link to="/subculture/creators">작가 찾기</Link><Link to="/subculture/products">작가 상품</Link><Link to="/account/notifications">관심 소식</Link><Link to="/library">내 방문·보관함</Link></nav></>}
  {!isDetail&&member&&interests.error&&<ErrorState error={interests.error} retry={()=>void interests.reload()}/>}
  {!isDetail&&member&&!!interests.settings?.entries.length&&<div className="sc-live-filters" role="group" aria-label="관심으로 결과 좁히기"><button aria-pressed={!interest} onClick={()=>filter('')}>내 관심 전체</button>{interests.settings.entries.map(e=><button key={e.id} aria-pressed={interest===e.id} onClick={()=>filter(e.id)}>{e.label||e.customName||'관심 대상'}</button>)}</div>}
  {!isDetail&&!interests.loading&&!interests.error&&!interests.settings?.entries.length&&<Link className="sc-live-setup" to="/account/interests">관심을 설정하면 내 취향의 소식을 모아볼 수 있어요 →</Link>}
  {auth.loading||data.loading?<LoadingState label="공개된 행사와 판매 정보를 확인하고 있어요"/>:data.error?<><ErrorState error={data.error} retry={()=>void data.reload()}/><Link to="/discover?category=subculture">기존 행사 목록 보기</Link></>:data.data&&<>
   {data.data.unlinked&&<p className="sc-live-notice">아직 이 관심에 연결된 공개 정보가 없어요. 아래는 일반 행사 목록이에요.</p>}
   <FeedResults value={data.data} from={location.pathname+location.search}/>
   <nav className="sc-live-pagination" aria-label="행사 결과 페이지"><button disabled={page===0} onClick={()=>{const next=new URLSearchParams(params);next.set('page',String(page-1));setParams(next)}}>이전</button><span>{page+1}페이지</span><button disabled={!data.data.hasMore} onClick={()=>{const next=new URLSearchParams(params);next.set('page',String(page+1));setParams(next)}}>다음</button></nav>
  </>}
 </section>
}
function FeedResults({value,from}:{value:Feed;from:string}){
 return <><div className="sc-live-results"><section><div className="sc-live-section-title"><h2>{value.personalized?'관심으로 찾은 행사':'다가오는 행사'}</h2><Link to="/discover?category=subculture">행사 전체 →</Link></div>
  {value.events.length?<div className="sc-live-events">{value.events.map(row=><article key={row.id}><Link to={'/discover/'+row.id} state={{subcultureReturnTo:from}}><ContentImage url={row.banner?.url} kind="event" alt=""/><div><small>{row.reasons.join(' · ')||labels[row.event.subcategory]}</small><h3>{row.event.name}</h3><p>{eventDateLabel(row.event.occurrences)}</p><p>{row.event.venueName||row.event.region}</p><span>행사 안내 보기 →</span></div></Link><SaveButton target={{type:'EVENT',eventId:row.id,id:row.id,participantId:null}} compact/></article>)}</div>:<p className="sc-live-empty">현재 연결된 예정 행사는 없어요. 판매 정보가 없다는 뜻은 아니에요.</p>}</section>
  <section><div className="sc-live-section-title"><h2>{value.personalized?'관심으로 찾은 굿즈':'공개된 판매 정보'}</h2></div>{value.goods.length?<div className="sc-live-goods">{value.goods.map(g=><div key={g.eventId+':'+g.id}><ProductCard product={g.data} images={g.images} verification={g.verification??undefined} memoryTarget={{type:'PRODUCT',eventId:g.eventId,id:g.id,participantId:g.participantId}}/><Link className="sc-live-product-context" to={`/discover/${g.eventId}/booths/${g.participantId}?product=${g.id}`} state={{subcultureReturnTo:from}}>{g.eventName} · {g.participantName} →</Link></div>)}</div>:<p className="sc-live-empty">연결된 공개 판매표를 기다리고 있어요. 과거 상품을 이번 행사 판매물로 표시하지 않아요.</p>}</section></div>
  {!!value.creators.length&&<section className="sc-live-artist-section"><div className="sc-live-section-title"><h2>{value.personalized?'이 취향을 그리는 작가':'작가·서클 둘러보기'}</h2><Link to="/subculture/creators">작가 전체 →</Link></div><p>작업 이력과 행사 참가는 별도로 확인해요.</p><div className="sc-live-creator-grid">{value.creators.map(c=><CreatorCard key={c.id} creator={c}/>)}</div></section>}
 </>
}
function CreatorCard({creator}:{creator:Creator}){return <article className="sc-live-person"><Link to={'/subculture/creators/'+creator.id}><span aria-hidden="true">{Array.from(creator.name)[0]}</span><h3>{creator.name}</h3><small>참가 행사·판매 정보 보기 →</small></Link><FollowButton entry={newInterest(undefined,creator)}/></article>}
export function SubcultureBrowse({kind}:{kind:'subjects'|'creators'}){
 const [params,setParams]=useSearchParams(),q=params.get('q')||'',[draft,setDraft]=useState(q),page=Math.max(0,Number(params.get('page'))||0)
 const subjects=useRemote(()=>kind==='subjects'?subcultureApi.subjects(q,'',page):Promise.resolve([]),[kind,q,page])
 const creators=useRemote(()=>kind==='creators'?subcultureApi.creators(q,page):Promise.resolve([]),[kind,q,page])
 const state=kind==='subjects'?subjects:creators
 const submit=(e:FormEvent)=>{e.preventDefault();setParams(new URLSearchParams({q:draft}))}
 return <section className="content-wrap section-pad sc-live"><Link to="/subculture">← 홈</Link><h1>{kind==='subjects'?'작품·캐릭터 찾기':'작가·서클 찾기'}</h1><form className="sc-live-search" onSubmit={submit}><label htmlFor="sc-query">{kind==='subjects'?'작품·캐릭터 이름':'작가 이름'}</label><div><input id="sc-query" value={draft} onChange={e=>setDraft(e.target.value)} maxLength={100}/><button>검색</button></div></form>
 {state.loading?<LoadingState/>:state.error?<ErrorState error={state.error} retry={()=>void state.reload()}/>:<><div className="sc-live-creator-grid">{kind==='subjects'?subjects.data?.map(s=><article className="sc-live-person" key={s.id}><Link to={'/subculture/subjects/'+s.id}><small>{s.workName||s.medium||'작품'}</small><h2>{s.name}</h2><p>관련 행사·굿즈·작가 보기 →</p></Link><FollowButton entry={newInterest(s)}/></article>):creators.data?.map(c=><CreatorCard key={c.id} creator={c}/>)}</div>{!state.data?.length&&<p>검색 결과가 없어요. 목록에 없는 캐릭터는 <Link to="/account/interests">관심 설정에서 직접 입력</Link>할 수 있어요.</p>}<nav className="sc-live-pagination"><button disabled={!page} onClick={()=>setParams({q,page:String(page-1)})}>이전</button><span>{page+1}페이지</span><button disabled={(state.data?.length||0)<(kind==='subjects'?40:20)} onClick={()=>setParams({q,page:String(page+1)})}>다음</button></nav></>}
 </section>
}
export function SubcultureIdentity({kind}:{kind:'subjects'|'creators'}){
 const {id=''}=useParams()
 const data=useRemote(async()=>kind==='subjects'?{subject:await subcultureApi.subject(id),creator:null}:{creator:await subcultureApi.creator(id),subject:null},[kind,id])
 return <section className="content-wrap section-pad sc-live"><Link to={'/subculture/'+kind}>← {kind==='subjects'?'작품·캐릭터':'작가'} 목록</Link>{data.loading?<LoadingState/>:data.error?<ErrorState error={data.error} retry={()=>void data.reload()}/>:data.data&&<><header className="sc-live-identity"><div><small>{data.data.subject?.workName||data.data.subject?.medium||'작가·서클'}</small><h1>{data.data.subject?.name||data.data.creator?.name}</h1><SafeLink url={data.data.subject?.sourceUrl||data.data.creator?.profileUrl||null}>공식 정보 ↗</SafeLink></div><FollowButton entry={newInterest(data.data.subject??undefined,data.data.creator??undefined)}/></header><SubcultureResults subjectId={kind==='subjects'?id:undefined} creatorId={kind==='creators'?id:undefined}/><CreatorProductList subjectId={kind==='subjects'?id:undefined} creatorId={kind==='creators'?id:undefined}/></>}</section>
}
