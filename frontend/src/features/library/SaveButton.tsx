import { useEffect,useRef,useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../app/useAuth'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useLibrary } from './LibraryProvider'
import { targetKey } from './memory'
import {libraryBoothsHref} from './purchaseModel'
import type { MemoryIndex,MemoryTarget } from './types'

export function SaveButton({target,day='',hall='',compact=false}:{target:MemoryTarget;day?:string;hall?:string;compact?:boolean}) {
 const auth=useAuth(),library=useLibrary(),guard=useRef(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const [removal,setRemoval]=useState<{row:MemoryIndex;owner:string}|null>(null)
 const saved=library?.index.find(x=>targetKey(x.target)===targetKey(target))
 useEffect(()=>setRemoval(null),[library?.owner,saved?.id,saved?.revision])
 useEffect(()=>setMessage(''),[library?.owner])
 const toggle=async(confirmed=false)=>{if(!library||library.loading||library.owner==='error'||guard.current)return
  if(confirmed&&(!removal||removal.owner!==library.owner||removal.row.id!==saved?.id||removal.row.revision!==saved.revision)){setRemoval(null);setMessage('저장 상태가 바뀌었어요. 다시 확인해 주세요.');return}
  if(saved&&!confirmed){setMessage('');setRemoval({row:saved,owner:library.owner});return}
  const owner=library.owner;guard.current=true;setBusy(true);setMessage('')
  try{if(saved)await library.remove(saved);else await library.save({target,day,hall});setRemoval(null);setMessage(saved?'저장을 해제했어요.':owner==='guest'?'이 기기에 90일간 임시 저장했어요. 로그인 후 보관함에서 가져올 수 있어요.':'계정 보관함에 저장했어요.')}
  catch(e){setMessage(e instanceof Error?e.message:'저장하지 못했어요. 다시 확인해 주세요.')}
  finally{guard.current=false;setBusy(false)}
 }
 return <span className={`memory-save-control${compact?' is-small':''}`}><button type="button" className={`btn ${saved?'memory-is-saved':'secondary'} memory-save-button`} aria-pressed={!!saved} aria-label={saved?'보관함에서 저장 해제':'내 보관함에 저장'} disabled={!library||library.loading||library.owner==='error'||busy} onClick={()=>void toggle()}>
   <svg width="17" height="19" viewBox="0 0 18 20" aria-hidden="true"><path d="M4 2h10v16l-5-3-5 3Z" fill={saved?'currentColor':'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg></button>
   {library?.owner==='error'&&<button type="button" className="btn secondary" onClick={()=>void auth.refresh()}>계정 다시 확인</button>}
   {saved&&(!compact||target.type==='PRODUCT')&&<Link className="memory-record-link" to={target.type!=='EVENT'&&library?.owner.startsWith('member:')?libraryBoothsHref(target.eventId,saved.id):`/library?item=${encodeURIComponent(saved.id)}`}>{target.type!=='EVENT'&&library?.owner.startsWith('member:')?'부스·구매 메모':'메모·방문 기록'}</Link>}
   {message&&<span className="memory-feedback" role="status">{message}</span>}
   {removal&&removal.owner===library?.owner&&<ConfirmDialog title="저장을 해제할까요?" description="이 항목의 메모도 삭제됩니다. 같은 부스의 마지막 저장 항목이면 방문 기록도 삭제됩니다." confirmLabel="저장 해제" busy={busy||library.loading} error={message} confirm={()=>void toggle(true)} cancel={()=>{setRemoval(null);setMessage('')}}/>}
 </span>
}
