import { PageHeader } from '../../components/layout/PageHeader'
import { CatalogBoothList } from '../creator/CreatorCatalogBoothPage'
import { OwnerProducts } from './OwnerProducts'
import { useState,type FormEvent } from 'react'
import { Link,useSearchParams } from 'react-router'
import { useAuth } from '../../app/useAuth'
import { useRemote } from '../../app/useRemote'
import { ErrorState,LoadingState,EmptyState } from '../../components/ui/States'
import { ownershipApi,type OwnerValue } from './ownershipApi'
import { supportApi } from './api'
import { supportPath } from './rules'
import { useUnsaved } from './useSupportUnsaved'
export function OwnershipManagement(){
 const {user,loading,loginUrl}=useAuth(),[params]=useSearchParams()
 const events=useRemote("features/support/OwnershipManagement:OwnershipManagement:events", ()=>user?ownershipApi.events():Promise.resolve([]),[user?.id]),booths=useRemote("features/support/OwnershipManagement:OwnershipManagement:booths", ()=>user?supportApi.managed():Promise.resolve([]),[user?.id])
 if(loading)return <LoadingState/>
 if(!user)return <EmptyState title="로그인 후 관리할 수 있어요" description="인증 신청한 계정으로 로그인해 주세요." action={<a href={loginUrl}>카카오 로그인</a>}/>
 const event=Number(params.get('event')),participant=Number(params.get('participant')||0),type=params.get('type')||'EVENT'
 if(event>0&&type==='PRODUCTS')return <OwnerProducts key={`${event}:${participant}`} event={event} participant={participant}/>
 if(event>0)return <OwnerEditor key={`${event}:${participant}:${type}`} event={event} participant={participant} type={type}/>
 return <div className="ownership-workspace">
  <PageHeader eyebrow="Creator · Public" title="내 공개 행사·부스" description="직접 등록하거나 운영자로 연결한 부스와 주최 행사를 관리하세요." actions={<Link className="btn secondary" to="/support?kind=CLAIM">인증 신청 내역</Link>}/>
  {user.permissions.includes('CREATOR')&&<CatalogBoothList/>}
  <section className="panel" aria-labelledby="managed-booths-title">
   <div className="panel-header"><div><h2 id="managed-booths-title">연결한 부스</h2><p className="item-meta">기존에 소개된 부스를 운영자 확인 후 연결한 목록입니다.</p></div></div>
   {booths.loading?<LoadingState/>:booths.error?<ErrorState error={booths.error} retry={()=>void booths.reload()}/>:!booths.data?.length?<EmptyState title="아직 연결한 부스가 없어요" description="이미 소개된 내 부스가 있다면 부스 상세에서 운영자 확인을 신청해 주세요." action={<Link className="btn secondary" to="/discover">내 부스 찾아보기</Link>}/>:<div className="console-list">{booths.data.map(b=><article className="ownership-card" key={b.exhibitorId}>
    <div className="panel-header"><div><h3>{b.name}</h3><p className="item-meta">{b.state==='ACTIVE'?(b.permission==='CATALOG_EDIT'?'운영자 확인 완료':'정정 요청 가능 · 직접 편집은 재인증 필요'):'관리 권한 해제'}</p></div><Link className="btn subtle" to={`/support/tickets/${b.claimId}`}>신청 내역</Link></div>
    {b.state==='ACTIVE'&&b.participants.map(p=><div className="list-row" key={p.id}><div><h3><Link to={p.route}>{p.name}</Link></h3>{p.editCapabilities?.reason&&<p className="item-meta">{p.editCapabilities.reason}</p>}{p.editCapabilities?.participant&&p.editCapabilities.salesReason&&<p className="item-meta">{p.editCapabilities.salesReason}</p>}</div><div className="row-actions">
     {p.editCapabilities?.participant&&<><Link className="btn secondary" to={`?event=${p.eventId}&participant=${p.id}&type=PARTICIPANT`}>부스 소개</Link>{p.editCapabilities?.sales&&<Link className="btn secondary" to={`?event=${p.eventId}&participant=${p.id}&type=SALES`}>판매 안내</Link>}{p.editCapabilities?.products&&<Link className="btn secondary" to={`?event=${p.eventId}&participant=${p.id}&type=PRODUCTS`}>상품 관리</Link>}</>}
     <Link className="btn subtle" to={supportPath('REPORT',{namespace:'CATALOG',type:'PARTICIPANT',eventId:p.eventId,id:p.id})}>정정 요청</Link>
    </div></div>)}
   </article>)}</div>}
  </section>
  <section className="panel" aria-labelledby="managed-events-title">
   <div className="panel-header"><div><h2 id="managed-events-title">주최 행사</h2><p className="item-meta">주최자 확인을 받은 행사의 공개 안내를 관리합니다.</p></div></div>
   {events.loading?<LoadingState/>:events.error?<ErrorState error={events.error} retry={()=>void events.reload()}/>:!events.data?.length?<EmptyState title="아직 연결한 주최 행사가 없어요" description="행사 상세에서 주최자 확인을 신청하면 이곳에서 관리할 수 있어요."/>:<div className="console-list">{events.data.map(e=><article className="list-row" key={e.eventId}><div><h3>{e.name}</h3><p className="item-meta">{e.organizerName} · {e.state==='ACTIVE'?'주최자 확인 완료':'관리 권한 해제'}</p></div><div className="row-actions">{e.state==='ACTIVE'&&<><Link className="btn secondary" to={`?event=${e.eventId}&type=EVENT`}>행사 정보 수정</Link><Link className="btn secondary" to={supportPath('REPORT',{namespace:'CATALOG',type:'EVENT',eventId:e.eventId,id:e.eventId})+'&category=OTHER&template=VISITOR_GUIDE'}>입장권·프로그램 변경 요청</Link></>}<Link className="btn subtle" to={`/discover/${e.eventId}`}>공개 화면</Link><Link className="btn subtle" to={`/support/tickets/${e.claimId}`}>신청 내역</Link></div></article>)}</div>}
   <p className="item-meta ownership-help">입장권·프로그램·FAQ 변경 요청은 관리자 검토 후 공개됩니다.</p>
  </section>
 </div>
}
function OwnerEditor({event,participant,type}:{event:number;participant:number;type:string}){
 const [savedNotice,setSavedNotice]=useState(false)
 const state=useRemote("features/support/OwnershipManagement:OwnerEditor:state", ()=>ownershipApi.editable(event,type,participant),[event,type,participant])
 return <section className="ownership-workspace"><nav className="creator-breadcrumb" aria-label="현재 위치"><Link to="/support/management">내 공개 행사·부스</Link><span>/ 정보 수정</span></nav><PageHeader eyebrow="Creator · Public" title={`${type==='EVENT'?'행사 정보':type==='SALES'?'판매 안내':'부스 소개'} 수정`}/><p>수집기가 다시 조사해도 직접 수정한 값은 유지됩니다. 이미지·배치도·상품 추가는 권리·참가 범위 확인을 위해 정정 요청으로 접수해 주세요.</p><Link to={supportPath('REPORT',{namespace:'CATALOG',type:participant?'PARTICIPANT':'EVENT',eventId:event,id:participant||event})}>이미지·배치도 등 정정 요청</Link>{savedNotice&&<p role="status">수정했습니다.</p>}{state.loading?<LoadingState/>:state.error||!state.data?<ErrorState error={state.error??new Error('정보 없음')} retry={()=>void state.reload()}/>:<OwnerForm key={state.data.revision} event={event} participant={participant} type={type} value={state.data} saved={next=>{state.setData(next);setSavedNotice(true)}}/>}</section>
}
const labels:Record<string,string>={description:'소개',venueName:'장소명',address:'주소',admission:'입장 안내',summary:'판매 안내',salesMethod:'판매 방식',officialLinks:'공식 링크 (한 줄에 하나)',occurrences:'행사 일시'}
function OwnerForm({event,participant,type,value,saved}:{event:number;participant:number;type:string;value:OwnerValue;saved:(x:OwnerValue)=>void}){
 const keys=type==='EVENT'?['description','venueName','address','admission']:type==='PARTICIPANT'?['description','officialLinks']:['summary','salesMethod']
 const [fields,setFields]=useState<Record<string,string>>(Object.fromEntries(keys.map(k=>[k,Array.isArray(value.data[k])?(value.data[k] as string[]).join('\n'):String(value.data[k]??'')]))),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false)
 const [dates,setDates]=useState((value.data.occurrences??[]) as {startDate:string;endDate:string;startTime:string|null;endTime:string|null}[])
 const [dirty,setDirty]=useState(false),clear=useUnsaved((dirty||!!note)&&!busy)
 const send=async(e:FormEvent)=>{e.preventDefault();if(busy)return;setBusy(true);setError('');try{const patch:Record<string,unknown>={};for(const k of keys){const v=k==='officialLinks'?fields[k].split('\n').map(x=>x.trim()).filter(Boolean):fields[k];if(JSON.stringify(v)!==JSON.stringify(value.data[k]??''))patch[k]=v}if(type==='EVENT'&&JSON.stringify(dates)!==JSON.stringify(value.data.occurrences))patch.occurrences=dates;if(!Object.keys(patch).length)throw new Error('변경된 내용이 없습니다.');const result=await ownershipApi.edit(event,type,participant,value.revision,patch,note);clear();setDirty(false);setDone(true);saved(result)}catch(e){setError(e instanceof Error?e.message:'수정 실패')}finally{setBusy(false)}}
 return <form className="panel support-form" onSubmit={e=>void send(e)}><fieldset disabled={busy}>{keys.map(k=><label className="field" key={k}><span>{labels[k]}</span><textarea className="textarea" rows={k==='description'?5:2} maxLength={k==='description'?10000:4000} value={fields[k]} onChange={e=>{setFields({...fields,[k]:e.target.value});setDirty(true)}}/></label>)}{type==='EVENT'&&dates.map((d,i)=><fieldset key={i}><legend>행사 일시 {i+1}</legend>{(['startDate','endDate','startTime','endTime'] as const).map(k=><label className="field" key={k}><span>{{startDate:'시작일',endDate:'종료일',startTime:'시작 시간',endTime:'종료 시간'}[k]}</span><input className="input" type={k.endsWith('Date')?'date':'time'} required={k.endsWith('Date')} value={d[k]??''} onChange={e=>{setDates(dates.map((row,n)=>n===i?{...row,[k]:e.target.value||null}:row));setDirty(true)}}/></label>)}</fieldset>)}<label className="field"><span>변경 사유</span><input className="input" required maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}{done&&<p role="status">수정했습니다.</p>}<button className="btn primary" disabled={busy}>{busy?'저장 중…':'공개 정보 수정'}</button><Link to={`/discover/${event}${participant?`/booths/${participant}`:''}`}>사용자 화면 확인</Link></fieldset></form>
}
