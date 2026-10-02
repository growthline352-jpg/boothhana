import { useState } from 'react'
import { Link } from 'react-router'
import { useRemote } from '../../app/useRemote'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { useDirty } from '../visit/UnsavedChanges'
import { categoryForType } from '../discovery/categories'
import { seoulToday } from '../discovery/browse'
import { catalogApi, publicCatalogApi, type EventDetail, type OperatingGroupSettings } from './api'

export function OperatingGroupEditor({detail}:{detail:EventDetail}) {
  const state=useRemote(()=>catalogApi.operatingGroup(detail.id),[detail.id])
  if(!detail.publication.length)return <section className="panel"><h3>같은 회차의 운영일·전시장 묶음</h3><p>행사를 먼저 검토하고 공개한 뒤, 같은 회차의 공개 행사들을 연결해 주세요.</p></section>
  if(state.loading)return <LoadingState/>
  if(state.error||!state.data)return <ErrorState error={state.error||new Error('묶음 정보를 확인하지 못했습니다.')} retry={()=>void state.reload()}/>
  if(state.data.rootEventId!==detail.id)return <div className="panel"><h3>같은 회차의 운영일 묶음</h3><p>{state.data.name}</p><Link to={`/admin/subculture?event=${state.data.rootEventId}`}>대표 행사에서 묶음 관리 →</Link></div>
  return <GroupForm key={state.data.revision} detail={detail} value={state.data} saved={state.setData}/>
}
function GroupForm({detail,value,saved}:{detail:EventDetail;value:OperatingGroupSettings;saved:(v:OperatingGroupSettings)=>void}) {
  const [name,setName]=useState(value.name||detail.event.name),[source,setSource]=useState(value.sourceUrl),[checked,setChecked]=useState(value.checkedOn||seoulToday()),[ids,setIds]=useState(value.eventIds),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const results=useRemote(()=>search?catalogApi.events(0,{q:search,category:categoryForType(detail.event.subcategory).code,publication:'PUBLISHED'}):Promise.resolve(null),[search,detail.event.subcategory])
  const members=useRemote(()=>Promise.all(ids.map(id=>publicCatalogApi.event(String(id)).then(row=>({id,name:row.event.name,dates:row.event.occurrences})))),[ids.join(',')])
  const clean=useDirty(`group-${detail.id}`,{name:value.name||detail.event.name,source:value.sourceUrl,checked:value.checkedOn||seoulToday(),ids:value.eventIds},{name,source,checked,ids})
  const save=async()=>{if(busy)return;setError('');setNotice('');if(ids.length<2||!name.trim()||!source.trim()||!checked){setError('묶을 행사 2개 이상과 이름·공식 출처·확인일을 입력해 주세요.');return}if(!window.confirm('선택한 행사들을 같은 회차의 운영일로 묶어 공개할까요? 기존 부스·보관함·댓글·관리권은 각 원본에 유지됩니다.'))return;setBusy(true);try{const next=await catalogApi.saveOperatingGroup(detail.id,{revision:value.revision,name:name.trim(),sourceUrl:source.trim(),checkedOn:checked,eventIds:ids});clean();saved(next);setNotice('묶음 공개 설정을 저장했습니다.')}catch(e){setError(e instanceof Error?e.message:'저장 실패')}finally{setBusy(false)}}
  const remove=async()=>{if(busy||!window.confirm('묶음 표시를 해제할까요? 각 행사와 부스·보관함·댓글은 그대로 유지됩니다.'))return;setBusy(true);setError('');try{await catalogApi.removeOperatingGroup(detail.id,value.revision);const next=await catalogApi.operatingGroup(detail.id);clean();saved(next)}catch(e){setError(e instanceof Error?e.message:'해제 실패')}finally{setBusy(false)}}
  return <section className="panel"><h3>같은 회차의 운영일·전시장 묶음</h3><p>날짜나 전시장별로 따로 수집된 <strong>같은 회차</strong>의 행사만 연결합니다. 과거·다음 회차는 ‘행사 회차 연결’에서 관리하세요. 이 설정을 저장하면 공개 목록·달력·날짜별 부스 선택에 반영됩니다.</p>
    <fieldset disabled={busy}><label className="field"><span>공개 묶음 이름</span><input className="input" maxLength={255} value={name} onChange={e=>setName(e.target.value)}/></label><label className="field"><span>같은 회차임을 확인한 공식 출처</span><input className="input" type="url" value={source} onChange={e=>setSource(e.target.value)}/></label><label className="field"><span>확인일</span><input className="input" type="date" value={checked} onChange={e=>setChecked(e.target.value)}/></label>
      <h4>연결할 행사</h4>{members.loading?<LoadingState/>:members.error?<ErrorState error={members.error} retry={()=>void members.reload()}/>:members.data?.map((m,i)=><div className="support-ticket-row" key={m.id}><div><strong>{i===0?'대표 · ':''}{m.name}</strong><p>{m.dates.map(d=>d.startDate===d.endDate?d.startDate:`${d.startDate} ~ ${d.endDate}`).join(' / ')}</p></div>{i>0&&!value.fixedMembers&&<button className="btn secondary" onClick={()=>setIds(ids.filter(id=>id!==m.id))}>연결 제외</button>}</div>)}
      {value.fixedMembers?<p>기존 공유 주소와 연결된 운영일입니다. 구성은 유지하고 이름·출처를 수정할 수 있습니다.</p>:<><div className="row-actions"><input className="input" aria-label="묶을 공개 행사 검색" value={query} maxLength={100} onChange={e=>setQuery(e.target.value)}/><button className="btn secondary" onClick={()=>setSearch(query.trim())}>행사 찾기</button></div>{results.loading?<LoadingState/>:results.error?<ErrorState error={results.error} retry={()=>void results.reload()}/>:results.data?.items.filter(e=>!ids.includes(e.id)).map(e=><div className="support-ticket-row" key={e.id}><span>{e.name} · {e.startDate}</span><button className="btn secondary" disabled={ids.length>=14} onClick={()=>setIds([...ids,e.id])}>운영일로 추가</button></div>)}{results.data&&!results.data.items.length&&<p>공개된 행사 중 검색 결과가 없습니다.</p>}</>}
      {error&&<p className="form-alert" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}<div className="row-actions"><button className="btn primary" onClick={()=>void save()} disabled={!!members.error||members.loading}>묶음 공개 설정 저장</button>{value.revision>=0&&!value.fixedMembers&&<button className="btn secondary" onClick={()=>void remove()}>묶음 표시 해제</button>}</div>
    </fieldset>
  </section>
}
