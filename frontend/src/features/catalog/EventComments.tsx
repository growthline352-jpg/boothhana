import { useRef, useState, type FormEvent } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../app/useAuth'
import { useRemote } from '../../app/useRemote'
import { ErrorState, LoadingState } from '../../components/ui/States'
import './event-comments.css'

type Comment = { id:string; eventId?:number; authorId:number; authorName:string; body:string; createdAt:string }
type Result = { items:Comment[]; total:number }
export function EventComments({eventId,draft,onDraftChange}:{eventId:number;draft?:string;onDraftChange?:(body:string)=>void}) {
 const {user,loading,loginUrl}=useAuth(),[page,setPage]=useState(0),[localBody,setLocalBody]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const body=draft??localBody,setBody=onDraftChange??setLocalBody
 const request=useRef<{id:string;body:string}|null>(null),guard=useRef(false)
 const list=useRemote("features/catalog/EventComments:EventComments:list", ()=>api<Result>(`/api/public/catalog/events/${eventId}/comments?page=${page}`),[eventId,page])
 async function send(e:FormEvent){
  e.preventDefault();if(guard.current)return;guard.current=true;setBusy(true);setError('')
  if(!request.current||request.current.body!==body)request.current={id:crypto.randomUUID(),body}
  try{await api(`/api/me/catalog/events/${eventId}/comments`,{method:'POST',body:JSON.stringify({requestId:request.current.id,body})});request.current=null;setBody('');if(page===0)await list.reload();else setPage(0)}
  catch(e){setError(e instanceof Error?e.message:'댓글을 등록하지 못했어요. 같은 내용으로 다시 시도할 수 있어요.')}
  finally{guard.current=false;setBusy(false)}
 }
 async function remove(comment:Comment){
  if(guard.current||!window.confirm('이 댓글을 삭제할까요?'))return;guard.current=true;setBusy(true);setError('')
  try{await api(`/api/me/catalog/events/${comment.eventId??eventId}/comments/${comment.id}`,{method:'DELETE'});if(page>0&&list.data?.items.length===1)setPage(page-1);else await list.reload()}
  catch(e){setError(e instanceof Error?e.message:'삭제하지 못했어요.')}
  finally{guard.current=false;setBusy(false)}
 }
 return <section id="event-comments" className="panel event-comments" aria-labelledby="event-comments-title">
  <h2 id="event-comments-title">행사 후기·댓글 {list.data&&<small>{list.data.total}</small>}</h2>
  <p>방문 후기와 궁금한 점을 나눠주세요. 댓글은 공개되며 개인정보는 적지 마세요.</p>
  {loading?<LoadingState/>:user?<form onSubmit={e=>void send(e)}><label className="field"><span>댓글 작성</span><textarea className="textarea" required maxLength={2000} rows={3} value={body} disabled={busy} onChange={e=>setBody(e.target.value)} placeholder="행사에 대해 이야기해 주세요."/></label><div className="row-actions"><small>{body.length}/2,000</small><button className="btn primary" disabled={busy||!body.trim()}>{busy?'처리 중…':'댓글 등록'}</button></div></form>:<a className="btn secondary" href={loginUrl}>로그인하고 댓글 쓰기</a>}
  {error&&<p role="alert" className="form-alert">{error}</p>}
  {list.loading?<LoadingState/>:list.error?<ErrorState error={list.error} retry={()=>void list.reload()}/>:list.data?.items.length?<ul>{list.data.items.map(c=><li key={c.id}><div className="event-comment-meta"><strong>{c.authorName}</strong><time dateTime={c.createdAt}>{new Date(c.createdAt).toLocaleString('ko-KR')}</time>{(user?.id===c.authorId||user?.permissions.includes('ADMIN'))&&<button type="button" disabled={busy} onClick={()=>void remove(c)}>삭제</button>}</div><p className="event-comment-body">{c.body}</p></li>)}</ul>:<p>아직 댓글이 없어요. 첫 이야기를 남겨주세요.</p>}
  <div className="row-actions"><button className="btn secondary" disabled={busy||page===0} onClick={()=>setPage(p=>p-1)}>이전</button><span>{page+1}페이지</span><button className="btn secondary" disabled={busy||!list.data||(page+1)*20>=list.data.total} onClick={()=>setPage(p=>p+1)}>다음</button></div>
 </section>
}
