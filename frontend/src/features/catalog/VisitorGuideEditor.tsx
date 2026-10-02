import { useState, type ReactNode } from 'react'
import { TextListField } from '../../components/ui/TextListField'
import { catalogApi, type EventDetail, type PublicEvent, type ReviewState } from './api'
import type { VisitorGuide as Guide } from '../collection/api'
import { useSubmission } from '../../app/useSubmission'
import { useDirty } from '../visit/UnsavedChanges'
import { VisitorGuide } from './VisitorGuide'
import { emptyVisitorGuide, visitorGuideError } from './visitorGuideEditing'
import { seoulToday } from '../discovery/browse'

type Row=Record<string,unknown>
type Field={key:string;label:string;type?:'text'|'date'|'time'|'url'|'number'|'textarea'|'list'|'timestamp'|'select';options?:Record<string,string>;max?:number}
const status={UNKNOWN:'미확인',UNPUBLISHED:'아직 발표되지 않음',PUBLISHED:'공개 확인',SOLD_OUT:'매진'}
const coverageKinds={PARTICIPANTS:'참가 부스',SALES:'판매정보',PROGRAMS:'프로그램',TICKETS:'입장권',FAQ:'FAQ'}
const provenance:Field[]=[{key:'sourceUrl',label:'확인 원문 주소',type:'url'},{key:'checkedOn',label:'확인일',type:'date'}]
const note:Field={key:'note',label:'방문자 안내·조건',type:'textarea',max:700}
const groups:{key:keyof Guide;label:string;max:number;fields:Field[];create:()=>Row}[]=[
 {key:'tickets',label:'입장권·예매 일정',max:40,fields:[{key:'name',label:'입장권 이름',max:150},{key:'status',label:'확인 상태',type:'select',options:status},{key:'visitDate',label:'관람일 · 날짜 미정/공통권은 비움',type:'date'},{key:'priceAmount',label:'가격 · 무료는 0, 미확인은 비움',type:'number'},{key:'currency',label:'통화 코드',max:3},{key:'salesStartsAt',label:'예매 시작',type:'timestamp'},{key:'salesEndsAt',label:'예매 종료',type:'timestamp'},{key:'entryTime',label:'입장 시간',type:'time'},{key:'reservationUrl',label:'공식 예매 링크',type:'url'},note,...provenance],create:()=>({id:crypto.randomUUID(),name:'',visitDate:null,priceAmount:null,currency:'KRW',salesStartsAt:null,salesEndsAt:null,entryTime:null,reservationUrl:null,status:'UNKNOWN',note:null,sourceUrl:null,checkedOn:null})},
 {key:'programs',label:'프로그램·시간표',max:100,fields:[{key:'name',label:'프로그램 이름',max:150},{key:'type',label:'프로그램 종류',type:'select',options:{STAGE:'무대',DANCE:'댄스',MEETUP:'교류·모임',WORKSHOP:'체험·워크숍',EXHIBITION:'전시',OTHER:'기타'}},{key:'status',label:'확인 상태',type:'select',options:status},{key:'subjects',label:'관련 작품·주제 · 한 줄에 하나',type:'list'},{key:'day',label:'운영일 · 요일 미확인은 비움',type:'date'},{key:'startTime',label:'시작 시간',type:'time'},{key:'endTime',label:'종료 시간',type:'time'},{key:'venue',label:'운영 장소',max:200},{key:'ticketRequirement',label:'입장 조건',type:'select',options:{UNKNOWN:'미확인',INCLUDED:'행사 입장권에 포함',SEPARATE:'별도 예매 필요'}},{key:'ticketId',label:'연결 입장권',type:'select'},note,...provenance],create:()=>({id:crypto.randomUUID(),name:'',type:'OTHER',subjects:[],day:null,startTime:null,endTime:null,venue:null,ticketRequirement:'UNKNOWN',ticketId:null,status:'UNKNOWN',note:null,sourceUrl:null,checkedOn:null})},
 {key:'faq',label:'회차별 FAQ',max:30,fields:[{key:'question',label:'질문',max:240},{key:'status',label:'답변 확인 상태',type:'select',options:{UNKNOWN:'이번 회차 미확인',CONFIRMED:'이번 회차 확인'}},{key:'answer',label:'확인된 답변 · 미확인이면 비움',type:'textarea',max:1000},...provenance],create:()=>({id:crypto.randomUUID(),question:'',answer:null,status:'UNKNOWN',sourceUrl:null,checkedOn:null})},
 {key:'sales',label:'판매·선입금 공지',max:30,fields:[{key:'title',label:'공지 제목',max:200},{key:'salesMethod',label:'판매 방식',max:300},{key:'salesStartsAt',label:'판매 시작',type:'timestamp'},{key:'salesEndsAt',label:'판매 종료',type:'timestamp'},{key:'pickupDay',label:'현장 수령일',type:'date'},note,...provenance],create:()=>({id:crypto.randomUUID(),title:'',salesMethod:null,salesStartsAt:null,salesEndsAt:null,pickupDay:null,note:null,sourceUrl:'',checkedOn:''})},
 {key:'coverage',label:'정보 수집 상태',max:5,fields:[{key:'kind',label:'정보 종류',type:'select',options:coverageKinds},{key:'status',label:'확인 범위',type:'select',options:{UNKNOWN:'미확인',PUBLISHED:'공개 자료 확인',PARTIAL:'일부 확인',UNPUBLISHED:'미공개 확인',INACCESSIBLE:'접근 제한 확인'}},{...note,max:500},...provenance],create:()=>({kind:'PARTICIPANTS',status:'UNKNOWN',note:null,sourceUrl:null,checkedOn:null})},
]
function TimestampFields({value,change,label}:{value:string;change:(v:string|null)=>void;label:string}) {
  // Dates remain dates. Times are displayed and edited in Korea time, independent of the workstation.
  const date=value.length===10?value:value?new Date(Date.parse(value)+9*3600000).toISOString().slice(0,10):''
  const time=value.length>10?new Date(Date.parse(value)+9*3600000).toISOString().slice(11,16):''
  const update=(d:string,t:string)=>change(d?(t?`${d}T${t}:00+09:00`:d):null)
  return <fieldset className="field"><legend>{label} · 한국시간</legend><input className="input" type="date" aria-label={`${label} 날짜`} value={date} onChange={e=>update(e.target.value,time)}/><input className="input" type="time" aria-label={`${label} 시간 · 미정은 비움`} disabled={!date} value={time} onChange={e=>update(date,e.target.value)}/></fieldset>
}
export function VisitorGuideFields({value,change,disabled=false}:{value:Guide;change:(v:Guide)=>void;disabled?:boolean}) {
  const edit=(group:keyof Guide,index:number,key:string,next:unknown)=>change({...value,[group]:value[group].map((v,i)=>i===index?{...v,[key]:next}:v)})
  const remove=(group:keyof Guide,index:number)=>{
    const next={...value,[group]:value[group].filter((_,i)=>i!==index)}
    if(group==='tickets')next.programs=next.programs.map(p=>p.ticketId===value.tickets[index].id?{...p,ticketId:null}:p)
    change(next)
  }
  return <fieldset disabled={disabled} className="visit-form-fields"><legend>방문 안내</legend><p>확정 정보는 이번 회차의 출처와 확인일을 함께 입력하세요. 모르는 날짜·시간은 비워 두고, 다른 회차의 규칙을 대신 넣지 마세요.</p>
    {groups.map(group=><section key={group.key} className="visit-form-fields"><h3>{group.label} · {value[group.key].length}</h3>{(value[group.key] as unknown as Row[]).map((row,index)=><GuideItem key={String(row.id??index)} initiallyOpen={row.name===''||row.question===''||row.title===''} title={String(row.name||row.question||row.title||coverageKinds[row.kind as keyof typeof coverageKinds]||`${group.label} ${index+1}`)}><div className="form-grid">{group.fields.map(field=>{
      const raw=row[field.key],text=Array.isArray(raw)?raw.join('\n'):String(raw??''),onChange=(v:unknown)=>edit(group.key,index,field.key,v)
      if(field.type==='timestamp')return <TimestampFields key={field.key} label={field.label} value={text} change={onChange}/>
      if(field.type==='list')return <label className="field full" key={field.key}><span>{field.label}</span><TextListField className="textarea" rows={3} maxLength={field.max||2000} value={raw as string[]} change={onChange}/></label>
      const options=field.key==='ticketId'?{'':'연결하지 않음',...Object.fromEntries(value.tickets.map(t=>[t.id,t.name||'이름 미입력']))}:field.options
      return <label className={`field ${['textarea','url'].includes(field.type||'')?'full':''}`} key={field.key}><span>{field.label}</span>{field.type==='select'?<select className="select" value={text} onChange={e=>onChange(e.target.value||null)}>{Object.entries(options||{}).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select>:field.type==='textarea'?<textarea className="textarea" rows={3} maxLength={field.max||2000} value={text} onChange={e=>onChange(e.target.value||null)}/>:<input className="input" type={field.type||'text'} min={field.type==='number'?0:undefined} step={field.type==='number'?'0.01':undefined} maxLength={field.max||2048} value={text} onChange={e=>onChange(e.target.value||(['name','question','title','kind','status'].includes(field.key)?'':null))}/>}</label>
    })}</div><button type="button" className="btn secondary" onClick={()=>remove(group.key,index)}>{group.key==='tickets'?'입장권 제거 · 프로그램 연결도 해제':'항목 제거'}</button></GuideItem>)}<button className="btn secondary" type="button" disabled={disabled||value[group.key].length>=group.max} onClick={()=>change({...value,[group.key]:[...value[group.key],group.create()]})}>{group.label} 추가</button></section>)}
  </fieldset>
}
function GuideItem({initiallyOpen,title,children}:{initiallyOpen:boolean;title:string;children:ReactNode}) {
  const [open,setOpen]=useState(initiallyOpen)
  return <details className="visit-product-editor" open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary>{title}</summary>{children}</details>
}
export function VisitorGuideEditor({detail,saved}:{detail:EventDetail;saved:()=>void}) {
  const [guide,setGuide]=useState<Guide>(detail.event.visitorGuide||emptyVisitorGuide),[note,setNote]=useState(detail.note),[error,setError]=useState(''),[preview,setPreview]=useState(false),[day,setDay]=useState(detail.event.occurrences[0]?.startDate||seoulToday())
  const action=useSubmission(),clean=useDirty(`guide-${detail.id}`,{guide:detail.event.visitorGuide||emptyVisitorGuide,note:detail.note},{guide,note})
  const save=async(reviewState:ReviewState)=>{if(!action.begin())return;setError('');try{
    const validation=visitorGuideError(guide,detail.event.occurrences);if(validation)throw new Error(validation)
    const changed=JSON.stringify(guide)!==JSON.stringify(detail.event.visitorGuide||emptyVisitorGuide)
    await catalogApi.editEvent(detail.id,{revision:detail.revision,reviewState,note,overrides:changed?{visitorGuide:guide}:{}});clean();saved()
  }catch(e){setError(e instanceof Error?e.message:'저장하지 못했습니다.')}finally{action.finish()}}
  const value:PublicEvent={id:detail.id,mode:'INFO_ONLY',event:{...detail.event,visitorGuide:guide},participants:[],assets:[],publishedAt:''}
  return <section className="panel"><VisitorGuideFields value={guide} change={setGuide} disabled={action.pending}/><label className="field"><span>검토 메모 · 비공개</span><textarea className="textarea" value={note} onChange={e=>setNote(e.target.value)} disabled={action.pending}/></label>{error&&<p role="alert" className="form-alert">{error}</p>}<div className="row-actions"><button className="btn secondary" disabled={action.pending} onClick={()=>void save('PENDING')}>검토 대기로 저장</button><button className="btn primary" disabled={action.pending} onClick={()=>void save('REVIEWED')}>검토 완료로 저장</button><button className="btn secondary" onClick={()=>setPreview(!preview)} aria-expanded={preview}>방문 안내 미리보기</button></div><p>저장 후 아래 ‘공개본 갱신’을 누르면 검토된 내용이 사용자에게 반영됩니다.</p>{preview&&<section className="panel"><label className="field"><span>미리볼 방문일</span><input className="input" type="date" value={day} onChange={e=>setDay(e.target.value)}/></label><VisitorGuide value={value} day={day} preview/></section>}</section>
}
