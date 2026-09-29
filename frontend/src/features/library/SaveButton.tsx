import { useRef,useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../app/useAuth'
import { useLibrary } from './LibraryProvider'
import { targetKey } from './memory'
import type { MemoryTarget } from './types'

export function SaveButton({target,day='',hall='',compact=false}:{target:MemoryTarget;day?:string;hall?:string;compact?:boolean}) {
 const auth=useAuth(),library=useLibrary(),guard=useRef(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const saved=library?.index.find(x=>targetKey(x.target)===targetKey(target))
 const toggle=async()=>{if(!library||guard.current)return;if(saved&&!window.confirm('이 항목을 보관함에서 삭제할까요? 이 항목의 메모도 삭제됩니다.'))return
  const owner=library.owner;guard.current=true;setBusy(true);setMessage('')
  try{if(saved)await library.remove(saved);else await library.save({target,day,hall});setMessage(saved?'저장을 해제했어요.':owner==='guest'?'이 기기에 90일간 임시 저장했어요. 로그인 후 보관함에서 가져올 수 있어요.':'계정 보관함에 저장했어요.')}
  catch(e){setMessage(e instanceof Error?e.message:'저장하지 못했어요. 다시 확인해 주세요.')}
  finally{guard.current=false;setBusy(false)}
 }
 return <span className={`memory-save-control${compact?' is-small':''}`}><button type="button" className={`btn ${saved?'memory-is-saved':'secondary'} memory-save-button`} aria-pressed={!!saved} aria-label={saved?'보관함에서 저장 해제':'내 보관함에 저장'} disabled={!library||library.loading||library.owner==='error'||busy} onClick={()=>void toggle()}>
   <svg width="17" height="19" viewBox="0 0 18 20" aria-hidden="true"><path d="M4 2h10v16l-5-3-5 3Z" fill={saved?'currentColor':'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg></button>
   {library?.owner==='error'&&<button type="button" className="btn secondary" onClick={()=>void auth.refresh()}>계정 다시 확인</button>}
   {saved&&!compact&&<Link className="memory-record-link" to={`/library?item=${encodeURIComponent(saved.id)}`}>메모·방문 기록</Link>}
   {message&&<span className="memory-feedback" role="status">{message}</span>}
 </span>
}
