import type { Location } from '../catalog/api'
import { labels } from '../catalog/Shared'
import { dateEvidenceLabels, withDateEvidence } from './locationEditing'

export function LocationFields({value,change,disabled=false}:{value:Location[];change:(rows:Location[])=>void;disabled?:boolean}) {
  const update=(index:number,patch:Partial<Location>)=>change(value.map((row,i)=>i===index?{...row,...patch}:row))
  return <fieldset disabled={disabled} className="visit-form-fields"><legend>행사별 부스 위치·참가일</legend>
    <p>행사 기간과 부스의 실제 참가일은 다를 수 있습니다. 확인 근거를 선택하고, 출처 주소와 확인일은 아래 검토 메모에 남겨 주세요.</p>
    {value.map((row,i)=><fieldset key={i} className="visit-form-fields"><legend>위치 {i+1}</legend><div className="form-grid">
      <label className="field"><span>부스번호 확인 상태</span><select className="select" value={row.status} onChange={e=>update(i,{status:e.target.value,code:e.target.value==='ASSIGNED'?(row.code||''):null})}>{['ASSIGNED','UNASSIGNED','UNKNOWN','NOT_APPLICABLE'].map(s=><option key={s} value={s}>{labels[s]}</option>)}</select></label>
      <label className="field"><span>부스번호</span><input className="input" value={row.code||''} disabled={row.status!=='ASSIGNED'} onChange={e=>update(i,{code:e.target.value})}/></label>
      <label className="field"><span>전시관·홀</span><input className="input" value={row.hall||''} onChange={e=>update(i,{hall:e.target.value||null})}/></label>
      <label className="field"><span>참가일 확인 근거</span><select className="select" value={row.dateEvidence||''} onChange={e=>change(value.map((v,n)=>n===i?withDateEvidence(v,e.target.value as Location['dateEvidence']):v))}>
        {!row.dateEvidence&&<option value="">기존 자료 · 확인 근거 별도 기록 없음</option>}{Object.entries(dateEvidenceLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select></label>
      <label className="field"><span>참가 시작일</span><input className="input" type="date" value={row.startDate||''} disabled={['UNKNOWN','EVENT_PERIOD'].includes(row.dateEvidence||'')} onChange={e=>update(i,{startDate:e.target.value||null,endDate:row.endDate||e.target.value||null})}/></label>
      <label className="field"><span>참가 종료일</span><input className="input" type="date" min={row.startDate||undefined} value={row.endDate||''} disabled={['UNKNOWN','EVENT_PERIOD'].includes(row.dateEvidence||'')} onChange={e=>update(i,{endDate:e.target.value||null})}/></label>
    </div><button className="btn secondary" type="button" onClick={()=>change(value.filter((_,n)=>n!==i))}>위치 제거</button></fieldset>)}
    <button className="btn secondary" type="button" onClick={()=>change([...value,{code:null,status:'UNKNOWN',hall:null,zone:null,startDate:null,endDate:null,floorPlanUrl:null,dateEvidence:'UNKNOWN'}])}>위치 추가</button>
  </fieldset>
}
