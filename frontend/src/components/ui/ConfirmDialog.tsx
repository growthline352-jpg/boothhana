import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { openCatalogDialog } from '../../features/catalog/dialogLifecycle'
import './confirmDialog.css'

export function ConfirmDialog({title,description,confirmLabel,busy=false,error='',confirm,cancel}:{
 title:string;description:string;confirmLabel:string;busy?:boolean;error?:string;confirm:()=>void;cancel:()=>void
}) {
 const ref=useRef<HTMLDialogElement>(null),cancelRef=useRef<HTMLButtonElement>(null),id=useId()
 useEffect(()=>{
  if(!ref.current)return
  const trigger=document.activeElement instanceof HTMLElement?document.activeElement:null
  return openCatalogDialog(ref.current,cancelRef.current,trigger)
 },[])
 return createPortal(<dialog ref={ref} className="confirm-dialog" aria-labelledby={id} aria-describedby={id+'-description'} aria-busy={busy} onCancel={event=>{event.preventDefault();event.stopPropagation();if(!busy)cancel()}}>
  <h2 id={id}>{title}</h2><p id={id+'-description'}>{description}</p>
  {error&&<p role="alert">{error}</p>}
  <div className="row-actions"><button ref={cancelRef} type="button" className="btn secondary" disabled={busy} onClick={cancel}>취소</button><button type="button" className="btn primary" disabled={busy} onClick={confirm}>{busy?'처리 중…':confirmLabel}</button></div>
 </dialog>,document.body)
}
