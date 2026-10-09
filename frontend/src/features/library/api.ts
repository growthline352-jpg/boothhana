import { api, type ApiRequestInit } from '../../api/client'
import type { MemoryEntry,MemoryIndex,MemoryPage,MemoryTarget,ResolvedMemory,SaveInput } from './types'
function request<T>(path:string,init?:ApiRequestInit){return api<T>(path,{...init,signal:AbortSignal.timeout(20_000),cache:'no-store'})}
const base='/api/me/library'
export const libraryApi={
 index:()=>request<MemoryIndex[]>(`${base}/index`),
 list:(query:URLSearchParams)=>request<MemoryPage>(`${base}/items?${query}`),
 save:(item:SaveInput)=>request<{created:boolean;item:MemoryEntry}>(`${base}/items`,{method:'PUT',body:JSON.stringify(item)}),
 detail:(id:string)=>request<MemoryEntry>(`${base}/items/${encodeURIComponent(id)}`),
 edit:(id:string,input:{revision:number;note:string;day:string;hall:string})=>request<MemoryEntry>(`${base}/items/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(input)}),
 remove:(id:string,revision:number)=>request<void>(`${base}/items/${encodeURIComponent(id)}?revision=${revision}`,{method:'DELETE'}),
 visit:(id:string,day:string,visited:boolean)=>request<MemoryEntry>(`${base}/items/${encodeURIComponent(id)}/visit`,{method:'PUT',body:JSON.stringify({day,visited})}),
 resolve:(targets:MemoryTarget[],fresh=false)=>request<ResolvedMemory[]>('/api/public/library/resolve',{method:'POST',body:JSON.stringify({targets}),readOnly:true,fresh}),
 importOne:(item:SaveInput,note:string,expectedUserId:number)=>request<{result:'IMPORTED'|'ALREADY_SAVED'|'NOTE_CONFLICT'|'CONTEXT_CONFLICT';item:MemoryEntry}>(`${base}/import`,{method:'POST',body:JSON.stringify({item,note,expectedUserId})}),
 activity:(id:string,action:'OPEN'|'OUTBOUND')=>request<void>(`${base}/items/${encodeURIComponent(id)}/activity`,{method:'POST',body:JSON.stringify({action}),readOnly:true,reuse:false}),
}
