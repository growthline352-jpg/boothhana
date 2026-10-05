import {DiscoveryIcon} from '../discovery/DiscoveryIcon'
import {publicLink} from '../visit/visit'
import {kindNames,minuteTime,timeMinutes,type PlanStop} from './model'
import {useEffect,useRef,useState,type ReactNode} from 'react'
import {openCatalogDialog} from '../catalog/dialogLifecycle'

interface Props {
 stop:PlanStop;index:number;count:number;selected:boolean;expanded:boolean;day:string;issues:string[];
 select:()=>void;toggle:()=>void;change:(value:Partial<PlanStop>)=>void;replace:()=>void;
 move:(offset:number)=>void;remove:()=>void;locate:()=>void;
 main?:boolean;mobileClose?:()=>void;
}
export function ItineraryStop({stop:s,index,count,selected,expanded,day,issues,select,toggle,change,replace,move,remove,locate,main=false,mobileClose}:Props){
 const editorId=`stop-editor-${s.id}`
 const durations=[...new Set([15,30,45,60,90,120,180,240,300,360,480,s.duration])].sort((a,b)=>a-b)
 return <article id={`stop-${s.id}`} className={`it-stop${selected?' selected':''}${issues.length?' has-conflict':''}`}>
  <div className="it-stop-rail"><span>{index+1}</span>{index<count-1&&<i/>}</div>
  <div className="it-stop-body">
   <button className="it-stop-select" onClick={select} aria-pressed={selected} aria-label={`${index+1}. ${s.name} 지도에서 선택`}>
    <div className="it-stop-time">{s.start}<span>{minuteTime(timeMinutes(s.start)+s.duration)}</span></div>
    <div className="it-stop-copy">
     <div className="it-stop-tags"><span>{kindNames[s.kind]}</span>{s.locked&&<span className="fixed">시작 시간 고정</span>}</div>
     <h3>{s.name}</h3><p>{s.address||s.venueName||'주소 확인 필요'}</p>
     {s.note&&<p className="it-stop-note-preview">{s.note}</p>}
     {!s.point&&<span className="it-location-pending">지도 위치 확인 필요</span>}
    </div>
    {s.image&&<img className="it-stop-thumb" src={s.image} alt=""/>}
   </button>
   {issues.length>0&&<div className="it-stop-issues" role="status">{issues.map(issue=><p key={issue}><DiscoveryIcon name="info" size={15}/>{issue.slice(issue.lastIndexOf(': ')+2)}</p>)}</div>}
   <div className="it-stop-actions">
    <button className={expanded?'active':''} onClick={toggle} aria-expanded={expanded} aria-controls={editorId} aria-label={`${s.name} ${expanded?'수정 닫기':'수정'}`}>{expanded?'수정 닫기':'수정'}</button>
    <span className="it-stop-move"><button disabled={index===0} aria-label={`${s.name} 위로 이동`} onClick={()=>move(-1)}>↑</button><button disabled={index===count-1} aria-label={`${s.name} 아래로 이동`} onClick={()=>move(1)}>↓</button></span>
    {!s.point&&<button onClick={locate}>위치 확인</button>}
   </div>
   {expanded&&<StopEditor id={editorId} close={mobileClose||toggle}>
    <div className="it-edit-heading"><strong>{s.name}</strong><button onClick={mobileClose} aria-label={`${s.name} 수정 완료`}>완료</button></div>
    {s.locked&&<div className="it-lock-note"><span>시작 시간을 고정했어요. 머무를 시간은 바꿀 수 있어요.</span><button onClick={()=>change({locked:false})}>시간 고정 해제</button></div>}
    <div className="it-time-edit">
     <label>방문 시작<input className="input" type="time" value={s.start} disabled={s.locked} onInput={e=>change({start:e.currentTarget.value})}/></label>
     <label>머무를 시간<select className="select" value={s.duration} onChange={e=>change({duration:Number(e.target.value)})}>{durations.map(n=><option key={n} value={n}>{n>=60?`${Math.floor(n/60)}시간${n%60?` ${n%60}분`:''}`:`${n}분`}</option>)}</select></label>
    </div>
    <label className="it-note">메모<textarea className="input" rows={2} maxLength={2000} value={s.note} placeholder="예약 내용, 준비물, 만날 장소" onChange={e=>change({note:e.target.value})}/></label>
    <div className="it-stop-tools">
     {!s.locked&&<button aria-pressed={false} onClick={()=>change({locked:true})}>시작 시간 고정</button>}
     <button onClick={replace}>{main?'중심 행사 바꾸기':'장소 바꾸기'}</button>
     <button className="it-remove" disabled={s.locked} onClick={remove}>일정에서 빼기</button>
    </div>
    {s.url&&(s.url.startsWith('/discover/')||publicLink(s.url))&&<a className="it-detail-link" href={s.url} target="_blank" rel="noopener noreferrer">{s.kind==='EVENT'?'행사 상세·예약 안내':'장소 정보'} ↗</a>}
    {s.kind!=='EVENT'&&<p className="it-check-note">영업시간·예약 조건은 방문 전에 확인해 주세요.</p>}
    {s.occurrences?.some(o=>o.startDate<=day&&o.endDate>=day&&!o.startTime)&&<p className="it-check-note">운영 시간이 미확인인 행사예요. 공식 안내를 확인해 주세요.</p>}
   </StopEditor>}
  </div>
 </article>
}
function StopEditor({id,children,close}:{id:string;children:ReactNode;close:()=>void}){
 const [mobile]=useState(()=>window.matchMedia('(max-width:640px)').matches),ref=useRef<HTMLDialogElement>(null)
 useEffect(()=>{if(!mobile||!ref.current)return;return openCatalogDialog(ref.current,ref.current.querySelector<HTMLElement>('.it-edit-heading button'),document.activeElement as HTMLElement)},[mobile])
 return mobile?<dialog id={id} ref={ref} className="it-stop-edit it-mobile-editor" aria-label="방문 장소 수정" onCancel={e=>{e.preventDefault();close()}}>{children}</dialog>:<div id={id} className="it-stop-edit">{children}</div>
}
