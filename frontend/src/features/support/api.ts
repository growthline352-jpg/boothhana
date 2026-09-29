import { api, API_BASE_URL } from '../../api/client'
export type TicketKind = 'REPORT' | 'INQUIRY' | 'CLAIM'
export interface Target { namespace:'CATALOG'|'PLATFORM';type:'EVENT'|'PARTICIPANT'|'PRODUCT'|'ASSET'|'FLOORPLAN'|'BOOTH'|'RESERVATION';eventId:number;id:number|null;planId?:string|null;areaId?:string|null;day?:string|null;hall?:string|null }
export interface Resolved { target:Target;label:string;route:string;snapshot:Record<string,unknown>;fingerprint:string;visible:boolean }
export interface TicketSummary { id:string;number:string;kind:TicketKind;category:string;title:string;status:string;resolution:string|null;revision:number;createdAt:string;updatedAt:string }
export interface Ticket extends TicketSummary {
 target:Target|null;receivedSnapshot:Record<string,unknown>;receivedFingerprint:string|null;clientContext:Record<string,string>;
 messages:{id:string;author:string;internal:boolean;body:string;evidence:string[];createdAt:string;messageKind?:'DIALOGUE'|'SYSTEM'}[];
 attachments:{id:string;contentType:string;size:number;createdAt:string}[];
 actions?:{actorId:number|null;action:string;details:unknown;createdAt:string}[];
 currentTarget?:Resolved;contentComparisonAvailable?:boolean;requesterId?:number|null;assignedTo?:number|null;exhibitorId?:number|null;eventRevision?:number;eventReviewState?:string;
 management?:{state:string;revision:number}|null;verifiedManagers?:{id:number;name:string}[];
}
export interface TicketInput { requestId:string;kind:TicketKind;category:string;title:string;body:string;evidence:string[];target:Target|null;context:Record<string,string>;exhibitorId:number|null }
export interface ReplyInput {requestId:string;revision:number;body:string;evidence:string[];internal:boolean}
export interface ActionInput {revision:number;action:string;note:string;duplicateOf?:string|null;expectedFingerprint?:string|null}
export interface Page<T>{items:T[];page:number;size:number;total:number}
export interface Options{guestEnabled:boolean;guestExpiryDays:number;guestAttachments:boolean;attachmentsEnabled:boolean;maxAttachmentBytes:number;maxAttachments:number}
export interface GuestAccess{ticketId:string;accessKey:string}
export interface Manager{exhibitorId:number;name:string;state:string;permission:string;revision:number;claimId:string;participants:{id:number;eventId:number;name:string;route:string}[]}
const prefix=(admin=false)=>admin?'/api/admin/support':'/api/me/support'
const post=<T>(url:string,body:unknown)=>api<T>(url,{method:'POST',body:JSON.stringify(body),cache:'no-store'})
export const supportApi={
 options:()=>api<Options>('/api/public/support/options',{cache:'no-store'}),
 target:(t:Target)=>post<Resolved>('/api/public/support/target',t),
 claimables:(t:Target)=>api<{id:number;name:string;profileUrl:string|null}[]>(`/api/public/support/claimables?eventId=${t.eventId}&participantId=${t.id}`,{cache:'no-store'}),
 list:(kind:TicketKind,page=0,status='',admin=false,category='')=>api<Page<TicketSummary>>(`${prefix(admin)}/tickets?${new URLSearchParams({kind,page:String(page),status,category})}`,{cache:'no-store'}),
 receipt:(id:string)=>api<{found:boolean;id?:string}>(`${prefix()}/requests/${encodeURIComponent(id)}`,{cache:'no-store'}),
 create:(body:TicketInput)=>post<Ticket>('/api/me/support/tickets',body),
 detail:(id:string,admin=false)=>api<Ticket>(`${prefix(admin)}/tickets/${encodeURIComponent(id)}`,{cache:'no-store'}),
 reply:(id:string,body:ReplyInput,admin=false)=>post<Ticket>(`${prefix(admin)}/tickets/${id}/messages`,body),
 action:(id:string,body:ActionInput)=>post<Ticket>(`${prefix(true)}/tickets/${id}/actions`,body),
 hide:(id:string,body:ActionInput)=>post<Ticket>(`${prefix(true)}/tickets/${id}/hide`,body),
 publishReviewed:(id:string,body:{revision:number;expectedFingerprint:string;eventRevision:number;targetRevision:number;overrides:Record<string,unknown>;note:string;reply:string})=>post<Ticket>(`${prefix(true)}/tickets/${id}/publish-reviewed`,body),
 decideClaim:(id:string,body:{revision:number;decision:string;note:string;reply:string})=>post<Ticket>(`${prefix(true)}/tickets/${id}/claim-decision`,body),
 revoke:(exhibitor:number,user:number,revision:number,reason:string)=>post<void>(`${prefix(true)}/managers/${exhibitor}/${user}/revoke`,{revision,reason}),
 managed:()=>api<Manager[]>(`${prefix()}/managed-exhibitors`,{cache:'no-store'}),
 guestCreate:(ticket:TicketInput,accessKey:string,website='')=>post<Ticket>('/api/public/support/guest/tickets',{ticket,accessKey,website}),
 guestRead:(access:GuestAccess)=>post<Ticket>('/api/public/support/guest/read',access),
 guestReply:(access:GuestAccess,message:ReplyInput)=>post<Ticket>('/api/public/support/guest/messages',{access,message}),
 upload:async(id:string,uploadId:string,file:File)=>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<1||file.size>5*1024*1024)throw new Error('JPG·PNG·WebP, 5MiB 이하 이미지만 첨부할 수 있어요.')
  const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer()),sha256=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('')
  return api<{id:string;state:string}>(`${prefix()}/tickets/${id}/attachments/${uploadId}?${new URLSearchParams({sha256,size:String(file.size)})}`,{method:'POST',headers:{'Content-Type':file.type},body:file,cache:'no-store'})
 },
 download:async(ticketId:string,id:string,admin=false)=>{
  const response=await fetch(`${API_BASE_URL}${prefix(admin)}/tickets/${ticketId}/attachments/${id}`,{credentials:'include',cache:'no-store',redirect:'error'})
  if(!response.ok)throw new Error('첨부를 다운로드하지 못했어요. 로그인과 접근 권한을 확인해 주세요.')
  const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a')
  a.href=url;a.download=`support-${id}.${blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':'jpg'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
 },
}
