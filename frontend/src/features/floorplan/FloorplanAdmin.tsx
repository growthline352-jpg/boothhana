import { useState } from 'react'
import { useDirty, useUnsavedGuard } from '../visit/UnsavedChanges'
import { DateListFields } from '../visit/AdminFields'
import { useRemote } from '../../app/useRemote'
import { useSubmission } from '../../app/useSubmission'
import { SafeLink } from '../catalog/Shared'
import { floorplanApi } from './api'
import type { Source, PlanVersion, Roster, ManualLink, Geometry, MapElementKind } from './api'
import { safePoints } from './geometry'
import { PlanCanvas } from './PlanCanvas'
import './floorplan.css'
const states:Record<string,string>={NOT_FOUND:'아직 배치도를 찾지 못했어요',ANNOUNCED:'공개 예정',ERROR:'확인 중 일시적인 오류',FOUND:'원본 발견',READY:'위치 확인 가능',NEEDS_REVIEW:'위치 검토 필요',ANALYZED:'분석 완료',PENDING:'다음 분석 대기',REVIEWED:'검토 완료',PUBLISHED:'공개 중',SOURCE_CHANGED:'원본이 변경됐어요',MAPPING_STALE:'참가자 연결 재확인 필요',PUBLICATION_STALE:'공개 정보 갱신 필요',SUPERSEDED:'수정본 확인 필요',STORED:'원본 저장 완료',REJECTED:'사용 불가',DISABLED:'탐색 중지'}
const label=(value:string)=>states[value]||'상세 확인 필요'
const elementKinds:Record<MapElementKind,string>={BOOTH:'참가 부스',RESTROOM:'화장실',ENTRANCE:'입구',EXIT:'출구',INFORMATION:'안내·운영본부',ELEVATOR:'엘리베이터',ESCALATOR:'에스컬레이터',STAIRS:'계단',FIRST_AID:'의무실',FOOD:'식음시설',STAGE:'무대',SERVICE:'기타 편의시설',OTHER:'기타 시설'}
const time=(value:string|null)=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'아직 없음'
function message(e:unknown){return e instanceof Error?e.message:'저장하지 못했습니다.'}
export function FloorplanAdmin({eventId}:{eventId:number}){
 const guard=useUnsavedGuard();const data=useRemote("features/floorplan/FloorplanAdmin:FloorplanAdmin:data", ()=>floorplanApi.admin(eventId),[eventId]);const [selected,setSelected]=useState('');const [error,setError]=useState('');const action=useSubmission()
 if(data.loading)return <p>배치도 작업을 확인하고 있습니다…</p>
 if(data.error||!data.data)return <p className="form-alert">배치도 작업 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요. <button className="btn secondary" onClick={()=>void data.reload()}>다시 조회</button></p>
 const refresh=()=>{void floorplanApi.admin(eventId).then(data.setData).catch(e=>setError(message(e)))}
 const value=data.data,version=value.versions.find(v=>v.id===selected)||value.versions[0],w=value.watch
 const watch=async()=>{if(!w||!guard()||!action.begin())return;try{await floorplanApi.watch(eventId,w.revision,!w.disabled);refresh()}catch(e){setError(message(e))}finally{action.finish()}}
 return <section className="floorplan-admin"><h3>배치도 자동 수집·변환</h3><p>주간 전체 조사 + 행사 14일 전부터 매일 보완 확인. 일일 작업은 별도 스케줄러 설치가 필요합니다.</p>
 {w&&<div className="notice-banner"><strong>{w.disabled?'재탐색 중지':label(w.last_status)}</strong><p>마지막 확인 {time(w.lastCheckedAt)} · 다음 확인 {time(w.nextCheckAt)}</p>{w.last_error&&<details><summary>오류 상세 (관리 담당자용)</summary><p>{w.last_error}</p></details>}<p>{w.result.warnings?.join(' · ')}</p><button className="btn secondary" disabled={action.pending} onClick={()=>void watch()}>{w.disabled?'배치도 탐색 재개':'해당 없음·탐색 중지'}</button></div>}
 {error&&<p role="alert">{error}</p>}<button className="btn secondary" onClick={()=>{if(guard())refresh()}}>상태 새로고침</button>
 <h4>발견된 원본 · 분석 및 웹 지도 변환 허용</h4><p>원본 열람·저장과 구역별 분석·웹 배치도 변환에 대한 사용 근거를 직접 확인하세요. LLM은 사용 승인을 하지 않습니다.</p>
 {value.sources.map(s=><SourceCard key={`${s.asset.id}-${s.asset.revision}-${s.sourceRevision}`} event={eventId} source={s} saved={refresh}/>)}{!value.sources.length&&<p>아직 배치도 원본을 찾지 못했습니다. 다음 수집에서 다시 찾습니다.</p>}
 <h4>분석 버전 · {value.versions.length}건</h4>{version&&<><label className="field"><span>원본·분석 버전</span><select disabled={action.pending} className="select" value={version.id} onChange={e=>{if(guard())setSelected(e.target.value)}}>{value.versions.map(v=><option key={v.id} value={v.id}>{v.scope.title} · {label(v.state)} · {time(v.createdAt)}</option>)}</select></label>
 <VersionLoader key={`${version.id}-${version.revision}`} versionId={version.id} roster={value.roster} saved={refresh}/></>}
 </section>
}
function SourceCard({event,source:s,saved}:{event:number;source:Source;saved:()=>void}){
 const [note,setNote]=useState(s.asset.rightsNote),[credit,setCredit]=useState(s.asset.credit),[scope,setScope]=useState(s.scope),[dates,setDates]=useState(s.scope.dates),[error,setError]=useState('');const action=useSubmission()
 const guard=useUnsavedGuard()
 const cleanRights=useDirty(`plan-rights-${s.asset.id}`,{note:s.asset.rightsNote,credit:s.asset.credit},{note,credit})
 const cleanScope=useDirty(`plan-scope-${s.asset.id}`,s.scope,{...scope,dates})
 const scopeChanged=JSON.stringify(s.scope)!==JSON.stringify({...scope,dates})
 const rightsChanged=note!==s.asset.rightsNote||credit!==s.asset.credit
 const save=async(allowed:boolean)=>{if(scopeChanged&&!guard())return;if(!action.begin())return;try{await floorplanApi.permission(event,s,allowed,note,credit);cleanRights();cleanScope();saved()}catch(e){setError(message(e))}finally{action.finish()}}
 const saveScope=async()=>{if(rightsChanged&&!guard())return;if(!action.begin())return;try{await floorplanApi.scope(event,s,{...scope,dates:dates.filter(Boolean)});cleanScope();cleanRights();saved()}catch(e){setError(message(e))}finally{action.finish()}}
 return <details className="panel"><summary>{s.scope.title} · {s.canTransform&&s.asset.rightsState==='APPROVED'?'변환 허용':'사용 근거 확인 필요'}</summary><p><SafeLink url={s.asset.pageUrl}>공식 게시 원문</SafeLink> · <SafeLink url={s.asset.imageUrl}>원본 이미지</SafeLink></p>
 <label className="field"><span>분석·저장·변환 사용 승인 근거</span><textarea disabled={action.pending} className="textarea" value={note} maxLength={2000} onChange={e=>setNote(e.target.value)}/></label><label className="field"><span>공개 출처 표기</span><input disabled={action.pending} className="input" value={credit} maxLength={1000} onChange={e=>setCredit(e.target.value)}/></label>
 <div className="row-actions"><button className="btn primary" disabled={action.pending||!note.trim()||!credit.trim()} onClick={()=>void save(true)}>원본 사용·분석·웹 변환 승인</button><button className="btn danger subtle" disabled={action.pending||!note.trim()||!credit.trim()} onClick={()=>void save(false)}>승인 철회</button></div>
 <div className="form-grid"><label className="field"><span>제목</span><input disabled={action.pending} className="input" value={scope.title} onChange={e=>setScope({...scope,title:e.target.value})}/></label><label className="field"><span>전시관 (명단과 동일한 원문)</span><input disabled={action.pending} className="input" value={scope.hall||''} onChange={e=>setScope({...scope,hall:e.target.value||null})}/></label><label className="field"><span>구역</span><input disabled={action.pending} className="input" value={scope.zone||''} onChange={e=>setScope({...scope,zone:e.target.value||null})}/></label><DateListFields value={dates} change={setDates} disabled={action.pending} label="실제 적용일 (휴무일 제외)"/></div>
 <button className="btn secondary" disabled={action.pending||!s.sourceRevision} onClick={()=>void saveScope()}>원본 범위 수정 · 다음 배치 재분석</button><p>{s.lastError}</p>{error&&<p className="form-alert" role="alert">{error}</p>}</details>
}
function VersionLoader({versionId,roster,saved}:{versionId:string;roster:Roster[];saved:()=>void}){
 const state=useRemote("features/floorplan/FloorplanAdmin:VersionLoader:state", ()=>floorplanApi.version(versionId),[versionId]);
 if(state.loading)return <p>선택한 배치도 버전을 불러옵니다…</p>;
 if(state.error||!state.data)return <p role="alert">버전 조회 실패 <button className="btn secondary" onClick={()=>void state.reload()}>재시도</button></p>;
 return <VersionEditor key={`${state.data.id}-${state.data.revision}`} version={state.data} roster={roster} saved={saved}/>;
}
function VersionEditor({version:v,roster,saved}:{version:PlanVersion;roster:Roster[];saved:()=>void}){
 const [geometry,setGeometry]=useState<Geometry>(v.geometry||{extractorVersion:'manual-v8',complete:false,shapes:[],warnings:[]}),[links,setLinks]=useState<Record<string,ManualLink>>(v.manualLinks),[selected,setSelected]=useState<string|null>(null),[note,setNote]=useState(v.note||''),[partial,setPartial]=useState(false),[error,setError]=useState(''),[dirty,setDirty]=useState(false),[points,setPoints]=useState('');const action=useSubmission()
 const clean=useDirty(`plan-version-${v.id}`,{geometry:v.geometry||{extractorVersion:'manual-v8',complete:false,shapes:[],warnings:[]},links:v.manualLinks,note:v.note||'',pointsDirty:false},{geometry,links,note,pointsDirty:!!selected&&points!==JSON.stringify(geometry.shapes.find(s=>s.id===selected)?.points||[])})
 const shape=geometry.shapes.find(s=>s.id===selected),mapping=v.mapping?.shapes.find(s=>s.shape.id===selected)
 const change=(g:Geometry)=>{setGeometry(g);setDirty(true);if(selected){const active=g.shapes.find(s=>s.id===selected);setPoints(active?JSON.stringify(active.points):'')}}
 const select=(id:string)=>{if(selected&&points!==JSON.stringify(geometry.shapes.find(s=>s.id===selected)?.points||[])&&!window.confirm('좌표 입력이 적용되지 않았어요. 입력을 버리고 다른 영역으로 이동할까요?'))return;setSelected(id);const s=geometry.shapes.find(x=>x.id===id);setPoints(s?JSON.stringify(s.points):'')}
 const save=async()=>{if(selected&&points!==JSON.stringify(geometry.shapes.find(s=>s.id===selected)?.points||[])){setError('고급 좌표 입력을 먼저 적용하거나 원래 값으로 되돌려주세요.');return}if(!action.begin())return;try{await floorplanApi.edit(v,geometry,links,note);clean();saved()}catch(e){setError(message(e))}finally{action.finish()}}
 const publish=async(withdraw=false)=>{if(!window.confirm(withdraw?'이 배치도 공개를 중지할까요?':'현재 원본·좌표·연결을 검토 완료로 공개할까요? 행사 자체의 공개 승인은 별도입니다.'))return;if(!action.begin())return;try{if(withdraw)await floorplanApi.withdraw(v,note);else await floorplanApi.publish(v,partial,note);clean();saved()}catch(e){setError(message(e))}finally{action.finish()}}
 return <section className="panel"><div className="visit-next-task"><strong>{v.scope.title} · {label(v.state)}</strong><p>{!v.imageUrl?'다음 할 일: 원본 사용 승인과 파일 저장 확인':!v.mapping?'다음 할 일: 이미지 분석 결과 기다리기':v.mapping.unresolved?'다음 할 일: 미연결 영역부터 번호·참가자 확인':'다음 할 일: 적용 날짜와 위치를 검토하고 이 버전 공개'}</p></div><details><summary>버전·기술 정보</summary><p>원본 해시 <code>{v.sha256}</code> · {v.image_width}×{v.image_height} · {v.state}</p></details><p>자동 연결 {v.mapping?.matched??0}개 / 미확인 {v.mapping?.unresolved??0}개. 위치·번호·날짜를 원문과 비교하세요.</p>
 {v.mapping&&v.mapping.unresolved>0&&<div className="visit-unresolved"><strong>먼저 확인할 영역</strong>{v.mapping.shapes.filter(m=>m.status!=='MATCHED'&&m.status!=='MANUAL'&&m.status!=='FACILITY').map(m=><button key={m.shape.id} type="button" className="btn secondary" disabled={action.pending} onClick={()=>select(m.shape.id)}>{m.shape.label||'번호 미확인'}</button>)}</div>}
 {!v.imageUrl?<p>사용 승인된 원본 파일을 아직 저장하지 못했습니다. 다음 배치와 허용 호스트 설정을 확인하세요.</p>:<PlanCanvas width={v.image_width} height={v.image_height} imageUrl={v.imageUrl} shapes={geometry.shapes} selected={selected} onSelect={select} editable={!action.pending} onChange={s=>change({...geometry,shapes:s})}/>}
 <label className="field"><span>편집할 지도 요소</span><select disabled={action.pending} className="select" value={selected||''} onChange={e=>select(e.target.value)}><option value="">선택</option>{geometry.shapes.map(s=><option key={s.id} value={s.id}>{s.label||'표기 미확인'} · {elementKinds[s.kind||'BOOTH']} · {s.id.slice(0,12)}</option>)}</select></label>
 {shape&&<div className="floorplan-editor"><label className="field"><span>원문 표기</span><input disabled={action.pending} className="input" value={shape.label||''} onChange={e=>change({...geometry,shapes:geometry.shapes.map(s=>s.id===shape.id?{...s,label:e.target.value,recognition:'READABLE'}:s)})}/></label>
 <label className="field"><span>지도 요소 종류</span><select disabled={action.pending} className="select" value={shape.kind||'BOOTH'} onChange={e=>{const kind=e.target.value as MapElementKind,next={...links};if(kind!=='BOOTH')delete next[shape.id];setLinks(next);change({...geometry,shapes:geometry.shapes.map(s=>s.id===shape.id?{...s,kind}:s)})}}>{Object.entries(elementKinds).map(([kind,name])=><option key={kind} value={kind}>{name}</option>)}</select></label>
 <label><input disabled={action.pending} type="checkbox" checked={shape.boundaryConfirmed} onChange={e=>change({...geometry,shapes:geometry.shapes.map(s=>s.id===shape.id?{...s,boundaryConfirmed:e.target.checked}:s)})}/> 영역 경계 확인</label>
 <p>{mapping?.issues.join(' · ')}</p><p>{(shape.kind||'BOOTH')==='BOOTH'?'날짜·전시관이 다른 동명 부스는 연결하지 마세요.':'시설은 참가자와 연결하지 않습니다.'} 모서리를 끌어서 영역을 수정할 수 있습니다.</p>
 {(shape.kind||'BOOTH')==='BOOTH'&&<><label className="field"><span>참가 부스 직접 연결</span><select disabled={action.pending} className="select" value={links[shape.id]?.participantId||''} onChange={e=>{const next={...links};if(!e.target.value)delete next[shape.id];else next[shape.id]={participantId:Number(e.target.value),dates:v.scope.dates,reason:note||'관리자가 원본 위치 확인'};setLinks(next);setDirty(true)}}><option value="">자동 매핑 사용</option>{roster.map(p=><option key={p.id} value={p.id}>{p.name} · {p.locations.map(l=>`${l.code} ${l.hall||''} ${l.dates.join('/')}`).join(', ')}</option>)}</select></label>
 {links[shape.id]&&<DateListFields label="직접 연결 적용 날짜" disabled={action.pending} value={links[shape.id].dates} change={dates=>{setLinks({...links,[shape.id]:{...links[shape.id],dates}});setDirty(true)}}/>}</>}
 <details><summary>고급: 키보드로 꼭짓점 좌표 수정</summary><textarea disabled={action.pending} className="textarea mono" value={points} onChange={e=>setPoints(e.target.value)}/><button className="btn secondary" onClick={()=>{try{const ps=JSON.parse(points);if(!safePoints(ps))throw Error('3~16개의 꼭짓점과 0~1 범위 좌표가 필요합니다.');change({...geometry,shapes:geometry.shapes.map(s=>s.id===shape.id?{...s,points:ps}:s)})}catch(e){setError(message(e))}}}>좌표 적용</button></details>
 <button className="btn danger subtle" onClick={()=>{const next={...links};delete next[shape.id];setLinks(next);change({...geometry,shapes:geometry.shapes.filter(s=>s.id!==shape.id)});setSelected(null)}}>잘못 추출된 영역 제거</button></div>}
 <p>{geometry.warnings.join(' · ')}</p><label><input disabled={action.pending} type="checkbox" checked={geometry.complete} onChange={e=>change({...geometry,complete:e.target.checked})}/> 전체 부스·시설 영역 확인 완료</label><label className="field"><span>검토 메모 (필수)</span><textarea disabled={action.pending} className="textarea" value={note} maxLength={2000} onChange={e=>{setNote(e.target.value);setDirty(true)}}/></label>
 <label><input disabled={action.pending} type="checkbox" checked={partial} onChange={e=>setPartial(e.target.checked)}/> 일부 미연결·부분 추출임을 확인했고 그 상태로 공개</label>{error&&<p role="alert" className="form-alert">{error}</p>}
 <div className="row-actions"><button className="btn secondary" disabled={action.pending||!dirty||!note.trim()||!v.imageUrl} onClick={()=>void save()}>수정 저장·재매핑</button><button className="btn primary" disabled={action.pending||dirty||!v.mapping||!note.trim()||!v.imageUrl} onClick={()=>void publish()}>이 버전 검토 완료·공개</button><button className="btn danger subtle" disabled={action.pending||!note.trim()} onClick={()=>void publish(true)}>공개 중지</button></div>{dirty&&<p>수정 저장 후 다시 확인하고 공개하세요. 저장되지 않은 편집은 공개하지 않습니다.</p>}</section>
}
