import {useEffect,useId,useRef,useState} from 'react'
import {openCatalogDialog} from '../catalog/dialogLifecycle'
import {planIssues,type Plan} from './model'
import {createShareInput,readManagedShares,shareApi,shareLink,shareSignature,shareStorageKey,writeManagedShares,type ManagedShare} from './sharing'

export function ShareDialog({plan,owner,close}:{plan:Plan;owner:string;close:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),title=useRef<HTMLHeadingElement>(null),id=useId(),alive=useRef(true)
 const key=shareStorageKey(owner),[rows,setRows]=useState(()=>readManagedShares(localStorage,key)),[includeNotes,setIncludeNotes]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const own=rows.filter(s=>s.input.plan.id===plan.id&&(!s.result||Date.parse(s.result.expiresAt)>Date.now()))
 useEffect(()=>{alive.current=true;const release=openCatalogDialog(ref.current!,title.current,document.activeElement as HTMLElement);return()=>{alive.current=false;release()}},[])
 const persist=(next:ManagedShare[])=>{writeManagedShares(localStorage,key,next);if(alive.current)setRows(next)}
 const create=async(retry?:ManagedShare)=>{
  if(busy)return;setBusy(true);setMessage('')
  const entry=retry||{input:createShareInput(plan,includeNotes)}
  try{
   // Persist the management key before uploading: ambiguous network results remain recoverable.
   let current=readManagedShares(localStorage,key)
   if(!retry){if(own.length>=5||current.length>=100)throw new Error('기존 링크를 종료한 뒤 새 링크를 만들어 주세요.');current=[entry,...current];persist(current)}
   const result=await shareApi.create(entry.input)
   current=readManagedShares(localStorage,key).map(s=>s.input.requestId===entry.input.requestId?{...entry,result}:s)
   persist(current);if(alive.current)setMessage('공유 링크를 만들었어요.')
  }catch(e){if(alive.current)setMessage(e instanceof Error?e.message:'공유 링크를 만들지 못했어요. 다시 시도해 주세요.')}
  finally{if(alive.current)setBusy(false)}
 }
 const revoke=async(entry:ManagedShare)=>{
  if(busy)return;setBusy(true);setMessage('')
  try{await shareApi.revoke(entry);persist(readManagedShares(localStorage,key).filter(s=>s.input.requestId!==entry.input.requestId));if(alive.current)setMessage('공유 링크를 종료했어요.')}
  catch(e){if(alive.current)setMessage(e instanceof Error?e.message:'종료하지 못했어요. 다시 시도해 주세요.')}
  finally{if(alive.current)setBusy(false)}
 }
 const copy=async(entry:ManagedShare)=>{try{await navigator.clipboard.writeText(shareLink(entry.result!.token));if(alive.current)setMessage('링크를 복사했어요.')}catch{setMessage('복사할 링크를 선택해 직접 복사해 주세요.')}}
 const send=async(entry:ManagedShare)=>{try{await navigator.share({title:entry.input.plan.title,url:shareLink(entry.result!.token)})}catch(e){if(!(e instanceof DOMException&&e.name==='AbortError'))void copy(entry)}}
 return <dialog className="it-dialog it-share-dialog" ref={ref} aria-labelledby={id} onCancel={e=>{e.preventDefault();if(!busy)close()}}>
  <header><h2 ref={title} id={id} tabIndex={-1}>일정 공유</h2><button type="button" disabled={busy} onClick={close} aria-label="공유 창 닫기">×</button></header>
  <div className="it-dialog-body"><div className="it-share-preview"><strong>{plan.title.trim()||'나의 하루 일정'}</strong><span>{plan.day} · {plan.stops.length}곳 · {plan.start}–{plan.end}</span></div>
   <p>링크를 받은 사람은 일정과 지도를 볼 수 있고, 자기 일정으로 복사해 수정할 수 있어요.</p>
   <label className="it-share-notes"><input type="checkbox" disabled={busy} checked={includeNotes} onChange={e=>setIncludeNotes(e.target.checked)}/>장소별 메모도 공유</label>
   <small>장소와 주소, 방문 시간이 공유됩니다. 메모는 선택한 경우에만 포함해요. 링크 종료는 작성한 브라우저에서 할 수 있어요.</small>
   {!!planIssues(plan).length&&<p className="it-share-warning">시간 확인 항목이 {planIssues(plan).length}건 있어요. 받는 사람에게도 표시됩니다.</p>}
   <div className="it-dialog-actions"><button className="btn primary" disabled={busy||!plan.stops.length||own.length>=5||own.some(s=>!s.result)} onClick={()=>void create()}>{busy?'처리 중…':own.length?'현재 일정으로 새 링크 만들기':'공유 링크 만들기'}</button></div>
   {message&&<p role="status">{message}</p>}
   {own.length>0&&<div className="it-share-links"><h3>이 일정의 공유 링크</h3><p>공유 후 수정한 내용은 새 링크를 만들면 반영돼요. 링크는 90일 동안 열 수 있어요.</p>{own.map(entry=>{
    const changed=shareSignature(plan,entry.input.includeNotes)!==shareSignature(entry.input.plan,entry.input.includeNotes)
    return <article key={entry.input.requestId}>{entry.result?<><div><strong>{changed?'이전 내용을 공유한 링크':'현재 내용의 링크'}</strong><small>{new Date(entry.result.expiresAt).toLocaleDateString('ko-KR')}까지 · {entry.input.includeNotes?'메모 포함':'메모 제외'}</small></div><input className="input" readOnly aria-label="공유 링크" value={shareLink(entry.result.token)} onFocus={e=>e.target.select()}/><div className="it-share-actions"><button className="btn secondary" onClick={()=>void copy(entry)}>링크 복사</button>{typeof navigator.share==='function'&&<button className="btn secondary" onClick={()=>void send(entry)}>공유하기</button>}<a href={shareLink(entry.result.token)} target="_blank" rel="noopener noreferrer">미리보기 ↗</a><button disabled={busy} onClick={()=>void revoke(entry)}>링크 종료</button></div></>:<><p>{busy?'공유 요청을 확인하고 있어요…':'이전 요청의 완료 여부를 확인하지 못했어요. 같은 내용으로 다시 확인할 수 있어요.'}</p><div className="it-share-actions"><button className="btn secondary" disabled={busy} onClick={()=>void create(entry)}>링크 다시 확인</button><button disabled={busy} onClick={()=>void revoke(entry)}>공유 취소</button></div></>}</article>
   })}</div>}
  </div>
 </dialog>
}
