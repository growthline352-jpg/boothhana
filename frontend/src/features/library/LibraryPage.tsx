import {discoveryFeatures} from '../discovery/features'
import {VisitPreparation} from './VisitPreparation'
import {DiscoveryIcon} from '../discovery/DiscoveryIcon'
import {compareHref} from '../discovery/compare'
import { lazy,Suspense,useEffect,useMemo,useRef,useState } from 'react'
import { Link,useSearchParams } from 'react-router'
import { useAuth } from '../../app/useAuth'
import { useRemote } from '../../app/useRemote'
import { ErrorState,LoadingState } from '../../components/ui/States'
import { ContentImage } from '../../components/ui/ContentImage'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useDirty } from '../visit/UnsavedChanges'
import { relevantLocations,validDay,visitDays } from '../visit/visit'
import { seoulToday } from '../discovery/browse'
import { openCatalogDialog } from '../catalog/dialogLifecycle'
import { LocationText,SafeLink,scopes,saleStates } from '../catalog/Shared'
import type { EventData,EvidenceScope } from '../catalog/api'
import { libraryApi } from './api'
import { useLibrary } from './LibraryProvider'
import { PUBLIC_MEMORY_TTL_MS } from './publicCache'
import { guestPage } from './guestPage'
import { libraryParams, lastMemoryPage } from './navigation'
import { VerificationNotice } from './VerificationNotice'
import { MemoryDrafts,type MemoryDraft } from './MemoryDrafts'
import { guestEntry,memoryHref,refreshedEntry } from './memory'
import { ShareQr } from './ShareQr'
import { OfflineEventButton } from '../offline/OfflineDownloadPanel'
import {libraryBoothsHref} from './purchaseModel'
import {purchaseApi} from './purchaseApi'
import type { MemoryEntry,MemoryPage,ResolvedMemory } from './types'
const kindNames:Record<string,string>={EVENT:'행사',PARTICIPANT:'업체·서클',PRODUCT:'제품·상품'}
const EventPurchasePlan=lazy(()=>import('./PurchasePlanPage').then(module=>({default:module.EventPurchasePlan})))

export function LibraryPage(){
 const library=useLibrary(),auth=useAuth(),[params,setParams]=useSearchParams(),[message,setMessage]=useState(''),[importing,setImporting]=useState(false)
 const guard=useRef(false),trigger=useRef<HTMLElement|null>(null)
 const owner=library?.owner||'loading',guest=owner==='guest',q=(params.get('q')||'').slice(0,100),eventId=params.get('event')||'',kind=params.get('type')||'',visited=params.get('visited')==='1',group=params.get('group')==='event',item=params.get('item')||''
 const drafts=useMemo(()=>new MemoryDrafts(),[]);drafts.bind(owner)
 const ready=owner==='guest'||owner.startsWith('member:')
 const booths=ready&&!guest&&params.get('view')==='booths'&&/^[1-9]\d*$/.test(eventId)
 const page=Math.floor(Math.max(0,Math.min(10000,Number(params.get('page'))||0))),version=library?.version||0,guestSignature=JSON.stringify(library?.guest||[])
 const [search,setSearch]=useState(q);useEffect(()=>{const timer=setTimeout(()=>setSearch(q),250);return()=>clearTimeout(timer)},[q])
 const query=new URLSearchParams({q:search,type:kind,visited:String(visited),page:String(page),size:'24'});if(/^\d+$/.test(eventId)&&Number(eventId)>0)query.set('eventId',eventId)
 // Public data is independent of local notes/search/page. One snapshot is shared for up to 30 seconds.
 const targetSignature=JSON.stringify((library?.guest||[]).map(g=>g.target))
 const publicState=useRemote<ResolvedMemory[]>(async()=>guest&&library?library.resolvePublic((library.guest||[]).map(g=>g.target)):[],[owner,library?.publicVersion,targetSignature])
 const memberState=useRemote<MemoryPage>(async()=>owner.startsWith('member:')?libraryApi.list(query):{items:[],page,size:24,total:0,groups:[]},[owner,version,query.toString(),library?.publicVersion])
 const purchaseIndex=useRemote(()=>owner.startsWith('member:')?purchaseApi.list():Promise.resolve([]),[owner])
 const localPage=useMemo(()=>guestPage(library?.guest||[],Array.isArray(publicState.data)?publicState.data:[],query),[guestSignature,publicState.data,query.toString()])
 const state=guest?{data:localPage,loading:publicState.loading,error:publicState.error,reload:async()=>{library?.refreshPublic()}}:memberState
 const eventGroups=[...(ready?state.data?.groups||[]:[])];if(ready&&!guest)for(const record of purchaseIndex.data||[])if(!eventGroups.some(g=>g.eventId===record.plan.eventId))eventGroups.push({eventId:record.plan.eventId,name:record.plan.eventName,count:0})
 useEffect(()=>{
  if(!ready)return
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')library?.refreshPublic()},PUBLIC_MEMORY_TTL_MS)
  return()=>window.clearInterval(timer)
 },[ready,library?.refreshPublic])
 // Guest storage arrives after the owner is known; retry a deep link once its item is loaded.
 const hasGuestItem=guest&&!!library?.guest.some(g=>g.key===item)
 const selected=useRemote<MemoryEntry|null>(async()=>{
  if(!item||!ready)return null
  if(!guest){if(!/^[0-9a-f-]{36}$/i.test(item))throw Error('잘못된 보관함 주소예요.');return libraryApi.detail(item)}
  const g=library?.guest.find(g=>g.key===item);if(!g||!library)throw Error('이 기기에 저장한 항목이 없어요. 다른 기기에서는 계정 동기화 후 확인할 수 있어요.')
  const result=(await library.resolvePublic([g.target]))[0];return result?guestEntry(g,result):null
 },[owner,item,hasGuestItem])
 // Revalidate only public details in the open editor, without unmounting its private unsaved note.
 const editorTarget=selected.data?.target
 const editorPublic=useRemote<ResolvedMemory|null>(async()=>ready&&editorTarget&&library?(await library.resolvePublic([editorTarget]))[0]:null,[owner,item,editorTarget?.eventId,editorTarget?.type,editorTarget?.id,editorTarget?.participantId,library?.publicVersion])
 const editorEntry=selected.data?refreshedEntry(selected.data,editorPublic.data,!editorPublic.loading&&!editorPublic.error):null
 const update=(part:Record<string,string>)=>{setParams(libraryParams(params,part),{replace:!('item' in part),preventScrollReset:true})}
 const open=(e:MemoryEntry,button:HTMLElement)=>{trigger.current=button;update({item:e.id});if(!guest)void libraryApi.activity(e.id,'OPEN').catch(()=>{/* telemetry must never block opening */})}
 const close=()=>{drafts.clear(owner);setParams(libraryParams(params,{item:''}),{replace:true,preventScrollReset:true})}
 const importNow=async()=>{if(!library||guard.current)return;if(!window.confirm(`${auth.user?.displayName||'현재 사용자'}님의 계정으로 이 기기의 임시 저장 ${library.guest.length}개를 가져올까요? 다른 사람이 남긴 기록인지 확인해 주세요. 기존 계정 메모는 덮어쓰지 않습니다.`))return
  guard.current=true;setImporting(true);setMessage('')
  try{const r=await library.importGuest();setMessage(`${r.imported}개를 계정에 가져왔어요.${r.remaining?` ${r.remaining}개는 기기에 남아 있어요.`:''} ${r.issues.join(' ')}`)}catch(e){setMessage(e instanceof Error?e.message:'가져오지 못했어요.')}finally{guard.current=false;setImporting(false)}
 }
 const rows=ready?(state.data?.items||[]):[],total=ready?(state.data?.total||0):0
 useEffect(()=>{
  if(ready&&!state.loading&&!state.error&&state.data&&page>lastMemoryPage(total))setParams(libraryParams(params,{page:String(lastMemoryPage(total))}),{replace:true,preventScrollReset:true})
 },[ready,state.loading,state.error,state.data,page,total,params,setParams])
 const sectionGroups=group?[...new Set(rows.map(x=>x.target.eventId))].map(id=>({id,name:rows.find(x=>x.target.eventId===id)?.current?.memory.eventName||'현재 공개되지 않는 행사',items:rows.filter(x=>x.target.eventId===id)})):[{id:0,name:'',items:rows}]
 return <section className="content-wrap section-pad memory-page">
  <header className="memory-page-heading"><div><p className="eyebrow">MY COLLECTION</p><h1>내 보관함</h1><p>{booths?'선택한 행사의 부스와 구매 메모를 정리하세요.':'가보기 전에 발견하고, 다녀온 뒤에도 다시 찾아보세요.'}</p></div><div className="row-actions"><Link className="btn primary" to="/discover">행사 찾기</Link></div></header>
  <nav className="row-actions" aria-label="보관함 보기"><Link className="btn secondary" to="/library" aria-current={!params.has('offline')&&!booths?'page':undefined}>{booths?'← 전체 보관함':'저장한 항목'}</Link>{!booths&&<Link className="btn secondary" to="/library?offline=1" aria-current={params.has('offline')?'page':undefined}>오프라인 저장한 행사</Link>}</nav>
  {params.has('offline')?<iframe title="보관함에 오프라인 저장한 행사" src={`/offline/index.html?embedded=1${/^[1-9]\d*$/.test(params.get('offlineEvent')||'')?'#'+params.get('offlineEvent'):''}`} style={{width:'100%',height:'75vh',minHeight:480,border:0,marginTop:20}}/>:<>
  {!booths&&<p className="memory-offline-hint">인터넷 없이 볼 행사는 아래의 행사 카드에서 <strong>오프라인 정보 저장</strong>을 눌러 주세요. 함께 저장한 부스·상품 표시도 포함됩니다.</p>}
  <aside hidden={booths} className={`memory-storage-notice ${guest?'is-device':''}`}>
   {owner==='loading'?<p>계정을 확인하고 있어요.</p>:owner==='error'?<><strong>계정 확인이 필요해요</strong><p>개인 기록은 잠시 숨겼으며 기기 저장으로 바꾸지 않았어요. 기존 기록은 삭제하지 않았습니다.</p><button className="btn secondary" onClick={()=>void auth.refresh()}>계정 다시 확인</button></>:guest?<><strong>이 기기에 임시 저장 중</strong><p>로그인 없이 90일간 사용할 수 있어요. 브라우저 기록 삭제·시크릿 모드 종료 시 사라질 수 있고, 같은 기기를 사용하는 사람이 메모를 볼 수 있어요.</p><a className="btn secondary" href={auth.loginUrl}>로그인하고 계정에 보관</a></>:<><strong>{auth.user?.displayName}님의 개인 보관함</strong><p>메모와 방문 기록은 나만 볼 수 있어요. 저장은 업체에 연락처를 전달하거나 마케팅에 동의하는 행동이 아닙니다.</p></>}
  </aside>
  {ready&&!guest&&!booths&&library&&library.guest.length>0&&<section className="memory-import"><h2>이 기기의 임시 저장 {library.guest.length}개</h2><p>계정으로 가져오기는 직접 선택할 때만 실행합니다. 일부 항목이 비공개됐거나 메모가 다르면 기기 기록을 남겨요.</p><button className="btn primary" disabled={importing} onClick={()=>void importNow()}>{importing?'가져오는 중…':'확인 후 계정에 가져오기'}</button><details><summary>기기에 남은 기록 확인·정리</summary>{library.guest.map(g=><div className="memory-local-row" key={g.key}><Link to={memoryHref(g.target,g.day,g.hall)}>공개 대상 확인 · {kindNames[g.target.type]}</Link><small>{g.savedAt.slice(0,10)} · {g.note||'메모 없음'}</small><button className="btn secondary" disabled={importing} onClick={()=>{if(window.confirm('이 기기의 해당 임시 기록만 삭제할까요?'))library.discardGuest(g.key)}}>기기 기록 삭제</button></div>)}</details></section>}
  {(message||library?.error)&&<p className="memory-feedback" role="status">{message||library?.error}</p>}
  <form className="memory-search" hidden={!ready} role="search" onSubmit={e=>{e.preventDefault();setSearch(q)}}>{!booths&&<><label className="field"><span>이름이 기억나지 않아도 찾아보세요</span><input className="input" type="search" value={q} maxLength={100} placeholder="업체·제품·행사·내 메모로 검색" onChange={e=>update({q:e.target.value})}/></label><div className="memory-search-actions"><button className="btn primary" type="submit">검색</button>{q&&<button className="btn secondary" type="button" onClick={()=>{setSearch('');update({q:''})}}>검색어 지우기</button>}</div></>}
   <div className="memory-filter-row"><label className="field"><span>행사</span><select className="select" value={eventId} onChange={e=>update({event:e.target.value,view:!guest&&e.target.value?'booths':'',focus:'',item:'',q:'',type:'',visited:''})}><option value="">모든 행사</option>{eventId&&!eventGroups.some(g=>String(g.eventId)===eventId)&&<option value={eventId}>선택한 행사 · 이름 미확인</option>}{eventGroups.map(g=><option key={g.eventId} value={g.eventId}>{g.name} {g.count?`(${g.count})`:'· 구매 메모'}</option>)}</select></label>{!booths&&<><label className="field"><span>종류</span><select className="select" value={kind} onChange={e=>update({type:e.target.value})}><option value="">모든 저장 항목</option>{Object.entries(kindNames).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label className="memory-check"><input type="checkbox" checked={visited} onChange={e=>update({visited:e.target.checked?'1':''})}/>방문 표시한 항목</label><label className="memory-check"><input type="checkbox" checked={group} onChange={e=>update({group:e.target.checked?'event':''})}/>행사별로 보기</label></>}</div>
  </form>
  {ready&&!guest&&/^[1-9]\d*$/.test(eventId)&&<nav className="memory-event-views" aria-label="선택한 행사의 보관함"><Link className={`btn ${booths?'secondary':'primary'}`} aria-current={!booths?'page':undefined} to={`/library?event=${eventId}`}>저장한 항목</Link><Link className={`btn ${booths?'primary':'secondary'}`} aria-current={booths?'page':undefined} to={libraryBoothsHref(Number(eventId))}>부스·구매 메모</Link></nav>}
  {booths?<Suspense fallback={<p role="status">저장한 부스를 열고 있어요.</p>}><EventPurchasePlan key={`${owner}:${eventId}`} eventId={Number(eventId)} focusId={params.get('focus')||''} onDeleted={()=>void purchaseIndex.reload()}/></Suspense>:owner==='error'?null:owner==='loading'||state.loading?<LoadingState label="저장한 기억을 불러오고 있어요"/>:state.error?<><ErrorState error={state.error} retry={()=>void state.reload()}/><p>현재 공개 상태를 확인할 수 없어 오래된 이미지나 설명을 대신 표시하지 않습니다. 기기·계정의 저장 기록은 삭제하지 않았어요.</p></>:<>
   <div className="memory-list-heading"><h2>{total}개의 관심 기록</h2><small>{guest?'기기 임시 기록 · 저장일로부터 90일':'행사가 끝나도 계정 저장 기록은 유지돼요.'}</small></div>
   {!rows.length?<div className="memory-empty"><span aria-hidden="true">▱</span><h2>{q||kind||eventId||visited?'이 조건으로 찾은 기록이 없어요.':'기억하고 싶은 곳을 하나 저장해 보세요.'}</h2><p>행사·부스·상품의 저장 버튼을 누르면 업체와 행사 맥락이 함께 남아요.</p>{q||kind||eventId||visited?<button className="btn secondary" onClick={()=>setParams({})}>조건 초기화</button>:<Link className="btn primary" to="/discover">행사 둘러보기</Link>}</div>:sectionGroups.map(g=><section key={g.id}>{g.name&&<div className="memory-group-actions"><h2 className="memory-group-title">{g.name}</h2>{!guest&&<Link className="btn secondary" to={libraryBoothsHref(g.id)}>저장한 부스 보기</Link>}</div>}<div className="memory-grid">{g.items.map(e=><MemoryCard key={e.id} entry={e} guest={guest} open={open}/>)}</div></section>)}
   {total>24&&<nav className="catalog-pager" aria-label="보관함 페이지"><button className="btn secondary" disabled={!page} onClick={()=>update({page:String(page-1)})}>이전</button><span>{page+1} / {Math.ceil(total/24)}</span><button className="btn secondary" disabled={(page+1)*24>=total} onClick={()=>update({page:String(page+1)})}>다음</button></nav>}
  </>}
  {ready&&item&&selected.loading&&<div className="notice-banner" role="status">메모·방문 기록을 불러오고 있어요.<button type="button" className="btn secondary" onClick={close}>취소</button></div>}
  {ready&&item&&selected.error&&<div className="notice-banner" role="alert">{selected.error.message}<button className="btn secondary" onClick={close}>닫기</button></div>}
  {ready&&item&&editorEntry&&<MemoryEditor key={`${owner}:${editorEntry.id}:${editorEntry.revision}`} entry={editorEntry} draft={drafts.read(owner,editorEntry.id,editorEntry.revision)} preserveDraft={value=>drafts.put(owner,value)} publicLoading={editorPublic.loading} publicError={!!editorPublic.error} guest={guest} trigger={trigger.current} close={close}/>}
  {guest&&library&&<details className="memory-device-settings"><summary>기기 임시 저장 관리</summary><p>계정에 가져오기 전 삭제하면 되돌릴 수 없어요.</p><button className="btn secondary" onClick={()=>{if(window.confirm('이 기기의 임시 저장과 메모를 모두 삭제할까요?'))library.clearGuest()}}>이 기기 임시 저장 모두 삭제</button></details>}
 </>}
 </section>
}
export function MemoryCard({entry:e,guest,open}:{entry:MemoryEntry;guest:boolean;open:(entry:MemoryEntry,button:HTMLElement)=>void}){
 const title=e.current?.memory.title||'현재 공개되지 않는 정보',context=e.current?.memory,locations=e.current?relevantLocations(e.current.locations,e.day,e.hall):[]
 return <article className={`memory-card${e.available?' has-image':''}${!e.available?' is-unavailable':''}`}>
  {e.available&&<figure><ContentImage url={e.image?.url} kind={e.target.type==='EVENT'?'event':e.target.type==='PRODUCT'?'product':'booth'} eventType={e.current?.eventSubcategory} alt={title}/>{e.image&&<figcaption>{e.image.credit} · <SafeLink url={e.image.sourceUrl}>출처</SafeLink></figcaption>}</figure>}
  <div className="memory-card-content"><div className="memory-card-meta"><span>{kindNames[e.target.type]}</span><span>{guest?'기기 임시 저장':'계정 저장'} · {e.savedAt.slice(0,10)}</span></div>
   <p className="memory-event-name">{context?.eventName||'공개 안내 중지 · 내 메모는 유지'}</p><h3>{title}</h3>{context?.participantName&&e.target.type==='PRODUCT'&&<p className="item-meta">{context.participantName}</p>}
   {e.current&&['CANCELED','POSTPONED','RESCHEDULED'].includes(e.current.operationState)&&<p className="visit-important-note">{({CANCELED:'행사 취소 안내',POSTPONED:'행사 연기 안내',RESCHEDULED:'일정 변경 안내'} as Record<string,string>)[e.current.operationState]} · 현재 공지를 확인하세요.</p>}
   {e.current&&((e.current.warnings?.length||0)>0||e.current.notice)&&<p className="visit-warning">방문 전 안내 확인 · {e.current.notice||e.current.warnings?.[0]}</p>}{e.day&&<p className="memory-planned">방문할 날 {e.day}{e.hall?` · ${e.hall}`:''}</p>}{locations.length>0&&<LocationText locations={locations}/>}
   {e.available&&e.current&&e.target.type==='PRODUCT'&&<><p className="memory-sale-state">{saleStates[e.current.saleState]||saleStates.UNKNOWN}</p><VerificationNotice verification={e.current.verification}/></>}
   <p className="memory-summary">{context?.summary||(!e.available?'이전에 보던 자료는 더 이상 제공하지 않아요. 메모 열람·기록 삭제는 가능합니다.':'소개를 확인하고 있어요.')}</p>
   {e.note&&<p className="memory-note-preview"><span>내 메모</span>{e.note}</p>}{e.visitedDays.length>0&&<p className="memory-visited">✓ 직접 방문 표시 · {e.visitedDays.join(' · ')}</p>}
   {e.available&&e.target.type==='EVENT'&&<OfflineEventButton eventId={e.target.eventId} day={e.day}/>}
   <div className="row-actions">{!guest&&e.available&&<Link className="btn secondary" to={libraryBoothsHref(e.target.eventId,e.target.type==='EVENT'?'':e.id)}>{e.target.type==='EVENT'?'저장한 부스 보기':'부스·구매 메모'}</Link>}<button className="btn primary" onClick={ev=>open(e,ev.currentTarget)}>{discoveryFeatures.visitPreparation&&e.target.type==='EVENT'?'방문 준비·메모':'메모·방문 기록'}</button>{e.available&&<Link className="btn secondary" to={memoryHref(e.target,e.day,e.hall,true)}>지도에서 보기</Link>}</div>
   {e.available&&<Link className="memory-record-link" to={memoryHref(e.target,e.day,e.hall)} onClick={()=>{if(!guest)void libraryApi.activity(e.id,'OPEN').catch(()=>{})}}>업체·상품 다시 보기 →</Link>}
  </div></article>
}
export function MemoryEditor({entry:e,guest,trigger,close,publicLoading=false,publicError=false,draft,preserveDraft}:{entry:MemoryEntry;draft?:MemoryDraft;preserveDraft?:(value:MemoryDraft)=>void;guest:boolean;trigger:HTMLElement|null;close:()=>void;publicLoading?:boolean;publicError?:boolean}){
 const lib=useLibrary()!,ref=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null),guard=useRef(false)
 const [note,setNote]=useState(draft?.note??e.note),[day,setDay]=useState(draft?.day??e.day),[hall,setHall]=useState(draft?.hall??e.hall),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [confirmation,setConfirmation]=useState<'discard'|'remove'|null>(null)
 useEffect(()=>{preserveDraft?.({id:e.id,revision:e.revision,note,day,hall})},[e.id,e.revision,note,day,hall,preserveDraft])
 const dirty=note!==e.note||day!==e.day||hall!==e.hall,clearDirty=useDirty(`memory:${e.id}`,{note:e.note,day:e.day,hall:e.hall},{note,day,hall})
 const [visitDay,setVisitDay]=useState(e.day&&e.day<=seoulToday()?e.day:seoulToday())
 useEffect(()=>ref.current?openCatalogDialog(ref.current,heading.current,trigger):undefined,[trigger])
 const dismiss=()=>{if(busy)return;if(dirty){setConfirmation('discard');return}clearDirty();close()}
 const run=async(action:()=>Promise<void>,closing=true)=>{if(guard.current)return;guard.current=true;setBusy(true);setError('');try{await action();if(closing){clearDirty();close()}}catch(x){setError(x instanceof Error?x.message:'처리하지 못했어요.')}finally{guard.current=false;setBusy(false)}}
 const dates=e.current?visitDays({occurrences:e.current.occurrences} as EventData):[],marked=e.visitedDays.includes(visitDay)
 const planning=discoveryFeatures.visitPreparation&&e.available&&e.target.type==='EVENT'
 const visitDate=<label className={planning?'field memory-plan-date':'field'}><span>방문할 날</span><select className="select" value={day} onChange={ev=>setDay(ev.target.value)}><option value="">{planning?'날짜 선택':'정하지 않음'}</option>{dates.map(d=><option key={d} value={d}>{planning?new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'short',timeZone:'Asia/Seoul'}).format(new Date(`${d}T12:00:00+09:00`)):d}</option>)}{day&&!dates.includes(day)&&<option value={day}>{day} · 현재 일정과 다를 수 있음</option>}</select></label>
 const hallField=<label className="field"><span>{planning?'전시관·위치 메모':'전시관 메모'}</span><input className="input" value={hall} maxLength={150} onChange={ev=>setHall(ev.target.value)} placeholder={planning?'예: 아트홀 1관, 입구 앞에서 만나기':'선택 사항'}/></label>
 const extraContent=<><section className="memory-visit-section"><h3>다녀왔다면 직접 표시하세요</h3><p>{planning?'직접 방문한 날짜를 남겨 주세요.':'저장·QR 열람·페이지 조회만으로 방문 표시하지 않습니다.'}</p><label className="field"><span>실제 방문일</span><input className="input" type="date" max={seoulToday()} value={visitDay} disabled={busy} onChange={ev=>setVisitDay(ev.target.value)}/></label><button className="btn secondary" disabled={busy||dirty||!validDay(visitDay)||visitDay>seoulToday()||(!marked&&!e.available)} onClick={()=>void run(()=>lib.visit(e,visitDay,!marked))}>{marked?'이 날짜의 방문 표시 해제':'이 날짜에 방문했어요'}</button>{dirty&&<small>메모를 먼저 저장한 뒤 방문을 표시해 주세요.</small>}{e.visitedDays.length>0&&<p>{e.visitedDays.join(' · ')}에 직접 방문 표시</p>}</section>
  {e.available&&e.current&&<><section><h3>현재 확인되는 안내</h3>{e.target.type==='PRODUCT'&&<VerificationNotice verification={e.current.verification}/>}{e.current.notice&&<p className="visit-important-note">{e.current.notice}</p>}{e.current.warnings?.map((w,i)=><p className="visit-warning" key={i}>{w}</p>)}{e.current.price&&<p>{Number(e.current.price.amount).toLocaleString('ko-KR')} {e.current.price.currency} · 현재 공개된 표시금액</p>}{e.current.evidenceScope&&<p>{scopes[e.current.evidenceScope as EvidenceScope]||'행사 관련성 확인 필요'}</p>}{e.current.saleState&&<p className="visit-warning">{saleStates[e.current.saleState]||'판매 상태 미확인'}</p>}<p>지난 행사 가격·혜택은 지금 유효하지 않을 수 있어요. 공식 안내에서 확인해 주세요.</p><div className="row-actions">{e.current.links.map(l=><a className="btn secondary" key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" onClick={()=>{if(!guest)void libraryApi.activity(e.id,'OUTBOUND').catch(()=>{})}}>{l.label} ↗</a>)}</div></section>
   {e.changed&&<details><summary>저장할 때와 이름·소개가 달라졌어요</summary><p>저장 당시: {e.saved?.title}</p><p>{e.saved?.summary}</p><p>현재: {e.current.memory.title}</p><p>{e.current.memory.summary}</p></details>}
   <div className="row-actions"><Link className="btn secondary" to={memoryHref(e.target,day,hall)}>{planning?'행사 상세 보기':'공개 안내 다시 보기'}</Link>{planning&&discoveryFeatures.comparison&&<Link className="btn secondary" to={compareHref([e.target.eventId])}>다른 행사와 비교</Link>}<ShareQr target={e.target} day={day} hall={hall} title={e.current.memory.title}/></div>
  </>}
  <footer><button className="btn secondary memory-delete" disabled={busy} onClick={()=>setConfirmation('remove')}>저장 항목 삭제</button></footer></>
 const editorContent=<>
  {!planning&&<p className="item-meta">{guest?'기기 임시 기록이며 같은 기기의 다른 사용자가 볼 수 있어요.':'메모는 업체·관리자의 일반 화면이나 공유 링크에 나타나지 않아요.'}</p>}
  {(publicLoading||publicError)&&<p className="notice-banner" role="status">{publicError?'공개 안내를 확인하지 못해 이미지·설명을 잠시 숨겼어요. 메모는 그대로입니다.':'최신 공개 안내를 확인하고 있어요. 작성 중인 메모는 그대로입니다.'}<button type="button" className="btn secondary" onClick={()=>lib.refreshPublic()}>공개 안내 다시 확인</button></p>}
  {error&&<p className="form-alert" role="alert">{error} <button type="button" className="btn secondary" disabled={busy} onClick={dismiss}>닫고 다시 확인</button></p>}
  <form id={planning?'memory-plan-form':undefined} onSubmit={ev=>{ev.preventDefault();void run(()=>lib.edit(e,note,day,hall))}}><fieldset disabled={busy} className={planning?'memory-plan-fields':undefined}>
   {planning&&<>{visitDate}<VisitPreparation eventId={e.target.eventId} day={day}/></>}
   <div className={planning?'memory-plan-note':undefined}><label className="field"><span>{planning?'방문 메모 (선택)':'왜 관심이 갔나요?'}</span><textarea className="textarea" rows={planning?2:4} maxLength={1000} value={note} onChange={ev=>setNote(ev.target.value)} placeholder={planning?'만날 장소, 챙길 것, 보고 싶은 부스를 적어두세요.':'선물 후보, 집 크기 확인, 소음 비교… 기억할 단서를 남겨보세요.'}/><small>{note.length}/1,000</small></label>
   {planning?<details className="memory-plan-hall"><summary>전시관·위치 메모{hall?' · 작성됨':''}</summary>{hallField}</details>:<div className="memory-filter-row">{visitDate}{hallField}</div>}</div>
   {!planning&&<div><button className="btn primary" type="submit">{busy?'저장 중…':'메모·방문 계획 저장'}</button></div>}
  </fieldset></form>
  {planning?<details className="memory-plan-more"><summary>방문 기록·공유·더보기</summary>{extraContent}</details>:extraContent}
 </>
 return <><dialog ref={ref} className={`memory-editor${planning?' memory-editor--plan':''}`} aria-labelledby="memory-editor-title" onCancel={ev=>{ev.preventDefault();dismiss()}}>
  <header><div><p className="eyebrow">{planning?'방문 준비':'나만의 관심 기록'}</p><h2 id="memory-editor-title" tabIndex={-1} ref={heading}>{e.current?.memory.title||'현재 공개되지 않는 정보'}</h2></div><button type="button" className={planning?'memory-plan-close':'btn secondary'} aria-label="닫기" disabled={busy} onClick={dismiss}>{planning?<DiscoveryIcon name="close" size={20}/>:'닫기'}</button></header>
  {planning?<><div className="memory-plan-body">{editorContent}</div><footer className="memory-plan-save"><p className="memory-plan-privacy">{guest?'메모는 이 기기에 임시 저장돼요.':'메모는 나에게만 보여요.'}</p><button className="btn primary" type="submit" form="memory-plan-form" disabled={busy}>{busy?'저장 중…':'방문 계획 저장'}</button></footer></>:editorContent}
 </dialog>{confirmation&&<ConfirmDialog title={confirmation==='discard'?'저장하지 않고 닫을까요?':'저장 항목을 삭제할까요?'} description={confirmation==='discard'?'작성 중인 메모와 방문 계획의 변경 내용이 사라집니다.':'이 항목과 메모가 삭제됩니다. 같은 부스의 마지막 저장 항목이면 방문 기록도 삭제됩니다.'} confirmLabel={confirmation==='discard'?'저장하지 않고 닫기':'저장 항목 삭제'} cancel={()=>setConfirmation(null)} confirm={()=>{setConfirmation(null);if(confirmation==='discard'){clearDirty();close()}else void run(()=>lib.remove(e))}}/>}</>
}
