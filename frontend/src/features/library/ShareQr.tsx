import { useEffect,useRef,useState } from 'react'
import QRCode from 'qrcode'
import { openCatalogDialog } from '../catalog/dialogLifecycle'
import { ShareButton } from '../visit/ShareButton'
import { memoryHref } from './memory'
import type { MemoryTarget } from './types'

/** Public entity link only. Scanning does not save, mark a visit or reveal a private note. */
export function ShareQr({target,day='',hall='',title}:{target:MemoryTarget;day?:string;hall?:string;title:string}) {
 const [open,setOpen]=useState(false),[src,setSrc]=useState(''),[error,setError]=useState('')
 const trigger=useRef<HTMLButtonElement>(null)
 const url=new URL(memoryHref(target,day,hall),window.location.origin).href
 useEffect(()=>{let active=true;setSrc('');setError('');if(open)QRCode.toDataURL(url,{width:384,margin:3,errorCorrectionLevel:'M'}).then(value=>{if(active)setSrc(value)}).catch(()=>{if(active)setError('QR을 만들지 못했어요. 아래 주소를 공유해 주세요.')});return()=>{active=false}},[url,open])
 return <><button className="btn secondary" type="button" ref={trigger} onClick={()=>setOpen(true)}>공유·QR</button>{open&&<QrDialog title={title} url={url} src={src} error={error} trigger={trigger.current} close={()=>setOpen(false)}/>}</>
}
function QrDialog({title,url,src,error,trigger,close}:{title:string;url:string;src:string;error:string;trigger:HTMLElement|null;close:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null)
 useEffect(()=>ref.current?openCatalogDialog(ref.current,heading.current,trigger):undefined,[trigger])
 return <dialog className="memory-qr-dialog" ref={ref} aria-labelledby="memory-qr-heading" onCancel={e=>{e.preventDefault();close()}}><header><h2 id="memory-qr-heading" tabIndex={-1} ref={heading}>공개 안내 공유</h2><button className="btn secondary" onClick={close}>닫기</button></header><p>{title}</p>{src?<img width="260" height="260" src={src} alt={`${title} 공개 페이지 QR 코드`}/>:<p role="status">{error||'QR을 만들고 있어요.'}</p>}<p className="item-meta">개인 메모·보관함은 공유되지 않아요. 스캔 후 저장 여부를 직접 선택합니다.</p><input className="input" readOnly value={url} aria-label="공개 공유 주소" onFocus={e=>e.currentTarget.select()}/><div className="row-actions"><ShareButton title={title} url={url}/>{src&&<a className="btn primary" href={src} download="boothhana-public-qr.png">QR 이미지 저장</a>}</div></dialog>
}
