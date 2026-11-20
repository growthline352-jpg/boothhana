import { api } from '../../api/client'

// Separate scope leaves the existing offline-library worker intact.
const scope='/account/notifications/'
export const pushSupported=()=>typeof window!=='undefined'&&window.isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window
export async function currentPush(){
 if(!pushSupported())return null
 const registration=await navigator.serviceWorker.getRegistration(scope)
 return registration?.scope===new URL(scope,location.origin).href?await registration.pushManager.getSubscription():null
}
export async function disablePush(){
 const subscription=await currentPush()
 if(!subscription)return
 try{await api('/api/me/subculture/push',{method:'DELETE',body:JSON.stringify({endpoint:subscription.endpoint})})}
 finally{await subscription.unsubscribe()}
}
export async function enablePush(publicKey:string,stillCurrent:()=>boolean){
 if(!pushSupported())throw new Error('이 브라우저에서는 웹 푸시를 지원하지 않아요.')
 // Called from the explicit button click; never ask on page load.
 if(await Notification.requestPermission()!=='granted')throw new Error('알림 권한을 허용하지 않았어요. 브라우저 설정에서 변경할 수 있어요.')
 if(!stillCurrent())throw new Error('계정이 변경됐어요. 현재 계정에서 다시 설정해 주세요.')
 const registration=await navigator.serviceWorker.register('/push-sw.js',{scope})
 if(!registration.active)await new Promise<void>((resolve,reject)=>{
  const worker=registration.installing||registration.waiting
  if(!worker){reject(new Error('알림을 준비하지 못했어요.'));return}
  const timer=setTimeout(()=>{worker.removeEventListener('statechange',changed);reject(new Error('알림 준비가 지연되고 있어요. 다시 시도해 주세요.'))},15000)
  function changed(){if(worker?.state==='activated'){clearTimeout(timer);worker.removeEventListener('statechange',changed);resolve()}else if(worker?.state==='redundant'){clearTimeout(timer);worker.removeEventListener('statechange',changed);reject(new Error('알림 준비에 실패했어요.'))}}
  worker.addEventListener('statechange',changed);changed()
 })
 const bytes=Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))
 let subscription=await registration.pushManager.getSubscription()
 if(subscription){const key=subscription.options.applicationServerKey;if(!key||Array.from(new Uint8Array(key)).join()!==Array.from(bytes).join()){await subscription.unsubscribe();subscription=null}}
 subscription=subscription||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes})
 if(!stillCurrent()){await subscription.unsubscribe();throw new Error('계정이 변경됐어요. 다시 설정해 주세요.')}
 const data=subscription.toJSON()
 try{await api('/api/me/subculture/push',{method:'POST',body:JSON.stringify({endpoint:data.endpoint,...data.keys})})}
 catch(error){await subscription.unsubscribe();throw error}
 return subscription
}
