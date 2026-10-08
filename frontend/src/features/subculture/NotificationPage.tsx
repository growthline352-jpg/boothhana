import { useState } from 'react'
import { Link,useSearchParams } from 'react-router'
import { api } from '../../api/client'
import { useAuth } from '../../app/useAuth'
import { useRemote } from '../../app/useRemote'
import { ErrorState,LoadingState } from '../../components/ui/States'
import { currentPush,disablePush,enablePush,pushSupported } from './push'
import './subculture.css'
type Inbox={items:{id:string;title:string;href:string;createdAt:string;readAt:string|null}[];hasMore:boolean;unread:number}
type Config={enabled:boolean;publicKey:string;endpoints:string[]}

export function NotificationPage(){
 const auth=useAuth()
 if(auth.loading)return <LoadingState/>
 if(auth.status==='error')return <ErrorState error={new Error('계정을 확인하지 못했어요.')} retry={()=>void auth.refresh()}/>
 if(auth.status==='anonymous')return <section className="content-wrap section-pad sc-live"><h1>관심 소식</h1><p>로그인하면 관심 캐릭터·작가의 새 소식을 모아볼 수 있어요.</p><a className="btn primary" href={auth.loginUrl}>로그인</a></section>
 return <InboxPage key={auth.user?.id+':'+auth.generation}/>
}
function InboxPage(){
 const auth=useAuth(),[params,setParams]=useSearchParams(),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const page=Math.max(0,Math.min(1000,Math.trunc(Number(params.get('page'))||0)))
 const inbox=useRemote(()=>api<Inbox>('/api/me/subculture/notifications?page='+page,{cache:'no-store'}),[page])
 const push=useRemote(async()=>{const config=await api<Config>('/api/me/subculture/push',{cache:'no-store'});const subscription=await currentPush();return {...config,active:!!subscription&&config.endpoints.includes(subscription.endpoint)}},[])
 async function togglePush(){if(!push.data)return;setBusy(true);setError('');const identity=auth.getSnapshot();try{if(push.data.active)await disablePush();else await enablePush(push.data.publicKey,()=>auth.getSnapshot()===identity);await push.reload()}catch(e){setError(e instanceof Error?e.message:'설정하지 못했어요.')}finally{setBusy(false)}}
 async function readAll(){setBusy(true);setError('');try{await api('/api/me/subculture/notifications/read-all',{method:'POST'});await inbox.reload()}catch(e){setError(e instanceof Error?e.message:'읽음 처리하지 못했어요.')}finally{setBusy(false)}}
 function read(id:string){void api('/api/me/subculture/notifications/'+id+'/read',{method:'POST'}).catch(()=>{/* Navigation remains available; inbox keeps the item unread on failure. */})}
 return <section className="content-wrap section-pad sc-live sc-live-settings"><Link to="/account">← 마이페이지</Link><h1>관심 소식</h1><p>관심 캐릭터·작가에 새로 연결된 행사와 상품을 알려드려요.</p>
  <section className="sc-live-push" aria-label="기기 알림 설정"><div><h2>이 기기에서 알림 받기</h2><p>사이트 밖에서도 새 소식이 왔다는 알림을 받아요. 관심 이름은 잠금 화면에 표시하지 않아요.</p></div>{push.loading?<span>설정 확인 중…</span>:push.error?<ErrorState error={push.error} retry={()=>void push.reload()}/>:!pushSupported()?<p>지원하는 브라우저에서 설정할 수 있어요. 아이폰·아이패드는 홈 화면에 추가한 웹 앱에서 확인해 주세요.</p>:push.data?.active||push.data?.enabled?<button className="btn secondary" disabled={busy} aria-pressed={push.data.active} onClick={()=>void togglePush()}>{push.data.active?'이 기기 알림 끄기':'알림 켜기'}</button>:<p>웹 푸시 준비 중이에요. 사이트 알림함은 계속 사용할 수 있어요.</p>}</section>
  {error&&<p role="alert">{error}</p>}
  {inbox.loading?<LoadingState/>:inbox.error?<ErrorState error={inbox.error} retry={()=>void inbox.reload()}/>:<><div className="sc-live-section-title"><h2>안 읽은 소식 {inbox.data?.unread||0}</h2><button className="btn secondary" disabled={busy||!inbox.data?.unread} onClick={()=>void readAll()}>모두 읽음</button></div>
  <ul className="sc-live-notifications">{inbox.data?.items.map(item=><li key={item.id} data-unread={!item.readAt}><Link to={item.href} onClick={()=>read(item.id)}>{!item.readAt&&<span className="sc-live-unread">새 소식</span>}<strong>{item.title}</strong><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('ko-KR')}</time><span>자세히 보기 →</span></Link></li>)}</ul>
  {!inbox.data?.items.length&&<div className="sc-live-empty"><p>아직 새 소식이 없어요. 이미 수집된 기록은 새 알림으로 보내지 않아요.</p><Link to="/subculture">현재 공개된 행사·상품 보기 →</Link></div>}
  <nav className="sc-live-pagination" aria-label="알림 페이지"><button disabled={!page} onClick={()=>setParams({page:String(page-1)})}>이전</button><span>{page+1}페이지</span><button disabled={!inbox.data?.hasMore} onClick={()=>setParams({page:String(page+1)})}>다음</button></nav></>}
 </section>
}
