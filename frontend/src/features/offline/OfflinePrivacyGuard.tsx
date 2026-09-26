import { useContext,useEffect } from 'react'
import { AuthContext } from '../../app/auth-context'
import type { AuthSnapshot } from '../../app/AuthSession'
import { loadOfflineModule } from './offlineModule'
export function offlineOwner(snapshot:Pick<AuthSnapshot,'status'|'user'>|undefined):string|null {
 if(snapshot?.status==='authenticated'&&snapshot.user)return `member:${snapshot.user.id}`
 return snapshot?.status==='anonymous'?'guest':null
}
export function OfflinePrivacyGuard(){
 const auth=useContext(AuthContext)
 useEffect(()=>{
  let active=true
  if(!offlineOwner(auth?.getSnapshot()))return
  void loadOfflineModule().then(module=>{
   const owner=offlineOwner(auth?.getSnapshot())
   if(active&&owner)return module.syncOwner(owner,()=>active&&offlineOwner(auth?.getSnapshot())===owner)
  }).catch(()=>{/* Storage blocked must not break authentication. Explicit download surfaces the error. */})
  return()=>{active=false}
 },[auth?.status,auth?.user?.id,auth?.getSnapshot])
 return null
}
