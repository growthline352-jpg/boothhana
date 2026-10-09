import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../api/client'
import { useRemote } from '../../app/useRemote'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { Pager } from './Shared'
type Row={id:string;eventId:number;eventName:string;authorName:string;body:string;createdAt:string}
export function AdminEventComments(){
 const [page,setPage]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const state=useRemote("features/catalog/AdminEventComments:AdminEventComments:state", ()=>api<{items:Row[];total:number}>(`/api/admin/event-comments?page=${page}`,{cache:'no-store'}),[page])
 async function remove(row:Row){if(busy||!window.confirm('댓글을 삭제할까요?'))return;setBusy(true);setError('');try{await api(`/api/me/catalog/events/${row.eventId}/comments/${row.id}`,{method:'DELETE'});if(page>0&&state.data?.items.length===1)setPage(p=>p-1);else await state.reload()}catch(e){setError(e instanceof Error?e.message:'삭제 실패')}finally{setBusy(false)}}
 return <section><h1>행사 댓글 관리</h1><p>모든 행사 댓글을 최신순으로 조회하고 삭제합니다.</p>{error&&<p role="alert">{error}</p>}{state.loading?<LoadingState/>:state.error?<ErrorState error={state.error} retry={()=>void state.reload()}/>:<>{state.data?.items.map(row=><article className="panel" key={row.id}><Link to={`/discover/${row.eventId}?section=reviews#event-comments`}>{row.eventName}</Link><p>{row.authorName} · {new Date(row.createdAt).toLocaleString('ko-KR')}</p><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{row.body}</p><button className="btn secondary" disabled={busy} onClick={()=>void remove(row)}>댓글 삭제</button></article>)}{!state.data?.items.length&&<p>등록된 댓글이 없습니다.</p>}<Pager page={page} total={state.data?.total??0} change={setPage}/></>}</section>
}
