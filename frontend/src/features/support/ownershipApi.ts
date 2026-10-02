import { api, publicRead } from '../../api/client'
import type { Occurrence } from '../collection/api'
import type { ProductRow } from '../catalog/api'
export interface VerifiedInfo {directParticipantIds?:number[];organizers:{id:number;name:string;officialUrl:string;verifiedAt:string}[];exhibitors:{id:number;name:string;participantId:number}[];series:{id:number;name:string;edition:string}[]}
export interface SeriesLink {revision:number;seriesId?:number|null;edition:string;evidenceUrl?:string}
export interface SeriesInput extends SeriesLink {name?:string;officialUrl?:string;note:string}
export interface OwnerValue {revision:number;data:Record<string,unknown>}
export interface OwnerProducts {directRegistration?:boolean;revision:number;items:ProductRow[]}
export interface OwnerProductInput {revision:number;name:string;summary:string;amount:string;currency:string;saleState:string;note:string}
const admin='/api/admin/ownership',mine='/api/me/ownership'
export const ownershipApi={
 info:(event:number)=>publicRead<VerifiedInfo>(`/api/public/ownership/events/${event}`),
 history:(event:number,page=0)=>publicRead<{items:{id:number;name:string;edition:string;occurrences:Occurrence[]}[];total:number}>(`/api/public/ownership/events/${event}/history?page=${page}`),
 events:()=>api<{eventId:number;name:string;state:string;organizerName:string;claimId:string}[]>(`${mine}/events`,{cache:'no-store'}),
 organizers:()=>api<{id:number;name:string;officialUrl:string}[]>(`${admin}/organizers`,{cache:'no-store'}),
 series:()=>api<{id:number;name:string;officialUrl:string}[]>(`${admin}/series`,{cache:'no-store'}),
 seriesLink:(event:number)=>api<SeriesLink>(`${admin}/events/${event}/series`,{cache:'no-store'}),
 saveSeries:(event:number,body:SeriesInput)=>api<SeriesLink>(`${admin}/events/${event}/series`,{method:'PUT',body:JSON.stringify(body)}),
 candidates:(event:number,q:string)=>api<{id:number;name:string;startsOn:string;venueName:string;seriesId:number|null}[]>(`${admin}/events/${event}/candidates?q=${encodeURIComponent(q)}`,{cache:'no-store'}),
 revoke:(event:number,user:number,revision:number,reason:string)=>api<void>(`${admin}/events/${event}/managers/${user}/revoke`,{method:'POST',body:JSON.stringify({revision,reason})}),
 editable:(event:number,type:string,participant:number)=>api<OwnerValue>(`${mine}/events/${event}/edit?${new URLSearchParams({type,participant:String(participant)})}`,{cache:'no-store'}),
 edit:(event:number,type:string,participant:number,revision:number,fields:Record<string,unknown>,note:string)=>api<OwnerValue>(`${mine}/events/${event}/edit?${new URLSearchParams({type,participant:String(participant)})}`,{method:'PATCH',body:JSON.stringify({revision,fields,note})}),
 products:(event:number,participant:number)=>api<OwnerProducts>(`${mine}/events/${event}/booths/${participant}/products`,{cache:'no-store'}),
 editProduct:(event:number,participant:number,product:number,input:OwnerProductInput)=>api<OwnerProducts>(`${mine}/events/${event}/booths/${participant}/products/${product}`,{method:'PATCH',body:JSON.stringify(input)}),
}
