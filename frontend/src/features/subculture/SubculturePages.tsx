import { useEffect,useState,type FormEvent } from 'react'
import { Link,useLocation,useParams,useSearchParams } from 'react-router'
import { useAuth } from '../../app/useAuth'
import { useRemote } from '../../app/useRemote'
import { LoadingState,ErrorState } from '../../components/ui/States'
import { ProductCard,SafeLink } from '../catalog/Shared'
import { useInterests } from './InterestProvider'
import { FollowButton } from './FollowButton'
import { CreatorProductList } from './CreatorProductPages'
import { SubcultureBackLink } from './SubcultureBackLink'
import { subcultureApi,newInterest,type Feed } from './api'
import { TasteTitle,TasteSectionTitle,TasteEmpty,TastePortrait,TasteSubjectCard,TasteCreatorCard,TasteEventCard,TasteExploreNav,subcultureEventsHref } from './SubcultureUI'
import '../catalog/catalog.css'
import '../visit/visit.css'
import './subculture.css'

export { SubcultureHome } from './SubcultureHome'
export function SubcultureResults({subjectId,creatorId}:{subjectId?:string;creatorId?:string}){
 const auth=useAuth(),interests=useInterests(),[params,setParams]=useSearchParams(),location=useLocation()
 const page=Math.max(0,Math.min(1000,Math.trunc(Number(params.get('page'))||0))),interest=params.get('interestId')||''
 const isDetail=!!subjectId||!!creatorId,member=!isDetail&&auth.status==='authenticated'
 const query=new URLSearchParams({page:String(page)})
 if(subjectId)query.set('subjectId',subjectId);if(creatorId)query.set('creatorId',creatorId);if(member&&interest)query.set('interestId',interest)
 const data=useRemote(()=>auth.loading||auth.status==='error'?Promise.resolve<Feed|null>(null):subcultureApi.feed(member,query),[auth.status,auth.generation,auth.user?.id,query.toString(),interests.settings?.revision])
 function filter(id:string){const next=new URLSearchParams(params);next.delete('page');next.delete('catalogPage');if(id)next.set('interestId',id);else next.delete('interestId');setParams(next)}
 if(auth.status==='error')return <section className="content-wrap section-pad"><ErrorState error={new Error('계정을 확인하지 못했습니다. 다시 확인해 주세요.')} retry={()=>void auth.refresh()}/></section>
 return <section className={'sc-live sc-taste-results'+(isDetail?' is-embedded':' content-wrap section-pad')}>
  {!isDetail&&<TasteTitle title="좋아하는 취향을, 어디서 만날까요?" body="관심으로 찾은 행사와 굿즈, 함께 만드는 작가를 만나보세요."/>}
  {!isDetail&&member&&interests.error&&<ErrorState error={interests.error} retry={()=>void interests.reload()}/>}
  {!isDetail&&member&&!!interests.settings?.entries.length&&<div className="sc-live-filters" role="group" aria-label="관심으로 결과 좁히기"><button aria-pressed={!interest} onClick={()=>filter('')}>내 관심 전체</button>{interests.settings.entries.map(e=><button key={e.id} aria-pressed={interest===e.id} onClick={()=>filter(e.id)}>{e.label||e.customName||'관심 대상'}</button>)}</div>}
  {auth.loading||data.loading?<LoadingState label="연결된 행사와 판매 정보를 확인하고 있어요"/>:data.error?<><ErrorState error={data.error} retry={()=>void data.reload()}/><Link to={subcultureEventsHref}>행사 목록 보기</Link></>:data.data&&<>
   {data.data.unlinked&&<p className="sc-live-notice">아직 이 관심에 연결된 공개 정보가 없어요. 아래는 일반 행사 목록이에요.</p>}
   <FeedResults value={data.data} from={location.pathname+location.search} creatorId={creatorId} subjectId={subjectId}/>
   {(page>0||data.data.hasMore)&&<nav className="sc-live-pagination" aria-label="행사 결과 페이지"><button disabled={page===0} onClick={()=>{const next=new URLSearchParams(params);next.set('page',String(page-1));setParams(next)}}>이전</button><span>{page+1}페이지</span><button disabled={!data.data.hasMore} onClick={()=>{const next=new URLSearchParams(params);next.set('page',String(page+1));setParams(next)}}>다음</button></nav>}
  </>}
 </section>
}
function FeedResults({value,from,creatorId,subjectId}:{value:Feed;from:string;creatorId?:string;subjectId?:string}){
 const creators=value.creators.filter(c=>String(c.id)!==creatorId)
 return <><section className="sc-taste-section"><TasteSectionTitle title={subjectId?'만날 수 있는 행사':creatorId?'다음 참가 행사':value.personalized?'관심으로 찾은 행사':'다가오는 행사'} note="공개된 참가·판매 정보 또는 행사 주제로 연결된 행사예요."><Link to={subcultureEventsHref}>행사 전체 →</Link></TasteSectionTitle>
  {value.events.length?<div className="sc-taste-event-grid">{value.events.map(row=><TasteEventCard key={row.id} row={row} from={from}/>)}</div>:<TasteEmpty title="현재 연결된 예정 행사는 없어요" body="행사 참가가 확인되면 여기에서 볼 수 있어요."/>}</section>
  <section className="sc-taste-section"><TasteSectionTitle title={subjectId?'이 캐릭터·작품의 굿즈':creatorId?'이번 행사에서 만날 굿즈':value.personalized?'관심으로 찾은 굿즈':'공개된 판매 정보'} note="해당 행사에서 공개된 판매 정보예요. 작가의 과거 작업과 구분해요."/>
   {value.goods.length?<div className="sc-taste-goods-grid">{value.goods.map(g=><div key={g.eventId+':'+g.id}><ProductCard product={g.data} images={g.images} verification={g.verification??undefined} memoryTarget={{type:'PRODUCT',eventId:g.eventId,id:g.id,participantId:g.participantId}}/><Link className="sc-live-product-context" to={`/discover/${g.eventId}/booths/${g.participantId}?product=${g.id}`} state={{subcultureReturnTo:from}}>{g.eventName} · {g.participantName} →</Link></div>)}</div>:<TasteEmpty title="아직 확인된 판매 굿즈가 없어요" body="판매표가 공개되면 연결해요. 과거 상품을 이번 행사 판매물로 표시하지 않아요."/>}</section>
  {!!creators.length&&<section className="sc-taste-section"><TasteSectionTitle title={subjectId?'함께 만드는 작가':value.personalized?'이 취향을 그리는 작가':'작가·서클 둘러보기'} note="캐릭터 작업 이력과 행사 참가는 별도로 확인해요."><Link to="/subculture/creators">작가 전체 →</Link></TasteSectionTitle><div className="sc-taste-creator-grid">{creators.map(c=><TasteCreatorCard key={c.id} creator={c}/>)}</div></section>}
 </>
}
export function SubcultureBrowse({kind}:{kind:'subjects'|'creators'}){
 const [params,setParams]=useSearchParams(),q=(params.get('q')||'').slice(0,100),[draft,setDraft]=useState(q),page=Math.max(0,Math.min(1000,Math.trunc(Number(params.get('page'))||0)))
 const filter=['WORK','CHARACTER'].includes(params.get('kind')||'')?params.get('kind')!:''
 useEffect(()=>setDraft(q),[q,kind])
 const subjects=useRemote(()=>kind==='subjects'?subcultureApi.subjects(q,filter,page):Promise.resolve([]),[kind,q,filter,page])
 const creators=useRemote(()=>kind==='creators'?subcultureApi.creators(q,page):Promise.resolve([]),[kind,q,page])
 const state=kind==='subjects'?subjects:creators
 const change=(part:Record<string,string>)=>{const next=new URLSearchParams(params);next.delete('page');Object.entries(part).forEach(([key,value])=>value?next.set(key,value):next.delete(key));setParams(next)}
 const submit=(e:FormEvent)=>{e.preventDefault();change({q:draft.trim()})}
 return <section className="content-wrap section-pad sc-live sc-taste-browse"><TasteTitle title={kind==='subjects'?'작품·캐릭터':'작가·서클'} body={kind==='subjects'?'좋아하는 캐릭터에서 다음 만남을 찾아보세요.':'좋아하는 그림에서 작가를 발견하고, 다음 참가 소식을 만나보세요.'}/><form className="sc-taste-search" role="search" onSubmit={submit}><label className="discovery-sr-only" htmlFor="sc-query">{kind==='subjects'?'작품·캐릭터 이름':'작가 이름'}</label><input id="sc-query" type="search" value={draft} onChange={e=>setDraft(e.target.value)} maxLength={100} placeholder={kind==='subjects'?'작품, 캐릭터 이름으로 검색':'작가 또는 서클 이름으로 검색'}/><button>검색</button></form><TasteExploreNav q={q}/>
 {kind==='subjects'&&<div className="sc-taste-chips" role="group" aria-label="작품·캐릭터 구분">{[['','전체'],['CHARACTER','캐릭터'],['WORK','작품']].map(([value,label])=><button key={label} aria-pressed={filter===value} onClick={()=>change({kind:value})}>{label}</button>)}</div>}
 {state.loading?<LoadingState/>:state.error?<ErrorState error={state.error} retry={()=>void state.reload()}/>:<><p className="sc-taste-result-count">{q&&'‘'+q+'’ · '}{state.data?.length||0}개의 결과{page>0&&' · '+(page+1)+'페이지'}</p><div className={kind==='subjects'?'sc-taste-subject-grid':'sc-taste-creator-grid'}>{kind==='subjects'?subjects.data?.map(s=><TasteSubjectCard key={s.id} subject={s}/>):creators.data?.map(c=><TasteCreatorCard key={c.id} creator={c}/>)}</div>{!state.data?.length&&(kind==='subjects'?<TasteEmpty title="찾는 작품·캐릭터가 아직 없어요" body="검색어를 바꾸거나 관심 설정에서 직접 입력할 수 있어요."><Link className="btn secondary" to="/account/interests">관심 설정에서 직접 입력</Link></TasteEmpty>:<TasteEmpty title={q?'일치하는 작가·서클을 찾지 못했어요':'아직 공개된 작가·서클이 없어요.'} body={q?'다른 이름이나 서클명으로 검색해 보세요.':undefined}>{(q||page>0)&&<button className="btn secondary" onClick={()=>{setDraft('');setParams({})}}>작가 전체 보기</button>}</TasteEmpty>)}{(page>0||(state.data?.length||0)>=(kind==='subjects'?40:20))&&<nav className="sc-live-pagination" aria-label="탐색 결과 페이지"><button disabled={!page} onClick={()=>{const next=new URLSearchParams(params);next.set('page',String(page-1));setParams(next)}}>이전</button><span>{page+1}페이지</span><button disabled={(state.data?.length||0)<(kind==='subjects'?40:20)} onClick={()=>{const next=new URLSearchParams(params);next.set('page',String(page+1));setParams(next)}}>다음</button></nav>}</>}
 </section>
}
export function SubcultureIdentity({kind}:{kind:'subjects'|'creators'}){
 const {id=''}=useParams()
 const data=useRemote(async()=>kind==='subjects'?{subject:await subcultureApi.subject(id),creator:null}:{creator:await subcultureApi.creator(id),subject:null},[kind,id])
 const subject=data.data?.subject,creator=data.data?.creator,name=subject?.name||creator?.name||''
 const source=subject?.sourceUrl||creator?.profileUrl
 return <section className="content-wrap section-pad sc-live sc-taste-detail"><SubcultureBackLink fallback={'/subculture/'+kind} label={kind==='subjects'?'작품·캐릭터':'작가·서클'}/>{data.loading?<LoadingState/>:data.error?<ErrorState error={data.error} retry={()=>void data.reload()}/>:data.data&&<><header className="sc-taste-identity"><TastePortrait name={name} kind={creator?'creator':subject?.kind==='WORK'?'work':'character'}/><div><span className="sc-taste-eyebrow">{subject?[subject.workName||subject.medium,subject.kind==='CHARACTER'?'캐릭터':'작품'].filter(Boolean).join(' · '):'작가·서클'}</span><div className="sc-taste-identity-title"><h1>{name}</h1><FollowButton entry={newInterest(subject??undefined,creator??undefined)}/></div><p>{subject?'이 작품·캐릭터와 연결된 행사, 굿즈와 작가를 찾아보세요.':'공개된 작업과 굿즈를 살펴보고, 다음 참가 행사에서 만나보세요.'}</p>{subject?.workId&&<Link className="sc-taste-source-work" to={'/subculture/subjects/'+subject.workId}>{subject.workName} 작품 보기 →</Link>}{source&&<SafeLink url={source}>공식 정보 ↗</SafeLink>}</div></header>
 {creator&&<CreatorProductList creatorId={id} title="작가의 상품과 작업"/>}<SubcultureResults subjectId={subject?id:undefined} creatorId={creator?id:undefined}/>{subject&&<CreatorProductList subjectId={id} title="이 캐릭터·작품의 작업 기록"/>}</>}</section>
}
