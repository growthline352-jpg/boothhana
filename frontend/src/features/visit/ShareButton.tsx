import { useState } from 'react'
export function ShareButton({url,title,label='공유'}:{url:string;title:string;label?:string}) {
  const [message,setMessage]=useState(''),[manual,setManual]=useState(false)
  const share=async()=>{
    setMessage('');setManual(false)
    try {
      if(navigator.share){await navigator.share({title,url});return}
      if(!navigator.clipboard)throw Error('clipboard unavailable')
      await navigator.clipboard.writeText(url);setMessage('링크를 복사했어요.')
    } catch(e) {if(e instanceof DOMException&&e.name==='AbortError')return;setManual(true);setMessage('아래 주소를 선택해 복사해 주세요.')}
  }
  return <div className="visit-share"><button type="button" className="btn secondary" onClick={()=>void share()}>{label}</button>
    <span role="status">{message}</span>{manual&&<input className="input" aria-label="공유 주소" readOnly value={url} onFocus={e=>e.currentTarget.select()}/>}</div>
}
