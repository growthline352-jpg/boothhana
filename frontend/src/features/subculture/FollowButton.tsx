import { useState } from 'react'
import { useAuth } from '../../app/useAuth'
import { useInterests } from './InterestProvider'
import { interestKey,type Interest } from './api'
export function FollowButton({entry}:{entry:Interest}){
 const auth=useAuth(),interests=useInterests(),[error,setError]=useState(''),[undo,setUndo]=useState<Interest|null>(null)
 const saved=interests.settings?.entries.find(row=>interestKey(row)===interestKey(entry))
 async function toggle(restore=false){const state=interests.settings;if(!state)return;setError('');try{await interests.save(restore?[...state.entries,undo!]:saved?state.entries.filter(e=>e.id!==saved.id):[...state.entries,entry],state.revision);setUndo(restore?null:saved??null)}catch(e){setError(e instanceof Error?e.message:'저장하지 못했어요.')}}
 const label=(entry.label||'이 대상')+' 관심 '+(saved?'해제':'등록')
 return <span className="sc-live-follow">{auth.status==='anonymous'?<a className="sc-live-heart" href={auth.loginUrl} aria-label={label+' · 로그인 필요'} title="로그인하고 관심 등록">♡</a>:<button className="sc-live-heart" aria-pressed={!!saved} aria-label={label} title={label} disabled={interests.loading||interests.busy||!!interests.error} onClick={()=>void toggle()}>{saved?'♥':'♡'}</button>}{undo&&<span role="status">해제했어요 <button onClick={()=>void toggle(true)} disabled={interests.busy}>실행 취소</button></span>}{error&&<span role="alert">{error} <button onClick={()=>void interests.reload()}>다시 불러오기</button></span>}</span>
}
