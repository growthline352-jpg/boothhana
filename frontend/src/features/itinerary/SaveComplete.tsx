import type {Ref} from 'react'
import {DiscoveryIcon} from '../discovery/DiscoveryIcon'
import {planIssues,type Plan} from './model'

export function SaveComplete({account=false,plan,areaName,headingRef,open,share,list}:{
 account?:boolean;plan:Plan;areaName:string;headingRef:Ref<HTMLHeadingElement>;
 open:()=>void;share:()=>void;list:()=>void;
}){
 const day=new Date(`${plan.day}T12:00:00+09:00`).toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long',timeZone:'Asia/Seoul'})
 const issues=planIssues(plan)
 return <div className="it-complete">
  <header className="it-complete-heading">
   <span className="it-complete-check"><DiscoveryIcon name="check" size={30}/></span>
   <h1 ref={headingRef} tabIndex={-1}>일정을 저장했어요</h1>
   <p>내 일정에서 다시 열고 수정할 수 있어요.</p>
  </header>
  <article className="it-complete-card" aria-label="저장한 일정 요약">
   <span className="it-badge">{plan.purpose==='EVENT'?'행사 참여':'데이트'}</span>
   <h2>{plan.title}</h2>
   <p className="it-complete-day"><DiscoveryIcon name="calendar" size={17}/><time dateTime={plan.day}>{day}</time></p>
   <dl className="it-complete-facts">
    <div><dt>지역</dt><dd>{areaName}</dd></div>
    <div><dt>시간</dt><dd>{plan.start}–{plan.end}</dd></div>
    <div><dt>방문 장소</dt><dd>{plan.stops.length}곳</dd></div>
   </dl>
   <ol className="it-complete-route" aria-label="방문 순서">{plan.stops.slice(0,3).map((stop,i)=><li key={stop.id}><span>{i+1}</span><strong>{stop.name}</strong><time>{stop.start}</time></li>)}</ol>
   {plan.stops.length>3&&<p className="it-complete-more">외 {plan.stops.length-3}곳 · 전체 코스는 일정에서 확인하세요.</p>}
   {issues.length>0&&<p className="it-complete-warning"><DiscoveryIcon name="info" size={17}/>저장했지만 시간 확인이 필요해요. 일정에서 확인해 주세요.</p>}
  </article>
  <div className="it-complete-actions">
   <button className="btn primary" onClick={open}>일정 보기·수정 <DiscoveryIcon name="arrow" size={17}/></button>
   <button className="btn secondary" onClick={share}>일정 공유</button>
  </div>
  <p className="it-complete-storage">{account?'내 계정에 저장했어요. 다른 기기에서도 로그인하면 볼 수 있어요.':'이 브라우저에 저장했어요. 로그인하면 계정에 가져올 수 있어요.'}</p>
  <button className="it-complete-list" onClick={list}>내 일정 목록으로 <DiscoveryIcon name="arrow" size={15}/></button>
 </div>
}
