import { api, publicRead } from '../../api/client'
import type { EventData, Product, ProductCheck, PublicAsset } from '../catalog/api'
export type EntityImage={imageUrl?:string|null;imageSourceUrl?:string|null;imageCredit?:string|null}
export type Subject=EntityImage&{id:string;kind:'WORK'|'CHARACTER';name:string;workId:string|null;workName:string|null;medium:string;sourceUrl:string;revision:number}
export type Creator=EntityImage&{id:number;name:string;kind:string;profileUrl:string|null}
export type CreatorProduct=EntityImage&{id:string;creatorId:number;creator:Creator;data:Product;subjects:{id:string;name:string;workName:string}[];status:string}
export type Interest=EntityImage&{id:string;subjectId:string|null;exhibitorId:number|null;customName:string;customWork:string;medium:string;customWorkId:string|null;label?:string;workName?:string;available?:boolean;kind?:string}
export type Settings={revision:number;entries:Interest[]}
export type Feed={personalized:boolean;unlinked:boolean;events:{id:number;event:EventData;banner:PublicAsset|null;reasons:string[]}[];goods:(EntityImage&{id:number;eventId:number;eventName:string;participantId:number;participantName:string;data:Product;verification:ProductCheck|null;status:string;images:PublicAsset[]})[];creators:Creator[];page:number;hasMore:boolean}
const base='/api/public/subculture'
export const subcultureApi={
 products:(params:URLSearchParams)=>publicRead<{items:CreatorProduct[];hasMore:boolean;page:number}>(`${base}/products?${params}`),
 myProducts:(params:URLSearchParams)=>api<{items:CreatorProduct[];hasMore:boolean;page:number}>(`/api/me/subculture/products?${params}`,{cache:'no-store'}),
 product:(id:string)=>publicRead<CreatorProduct>(`${base}/products/${encodeURIComponent(id)}`),
 subjects:(q='',kind='',page=0)=>publicRead<Subject[]>(`${base}/subjects?${new URLSearchParams({q,kind,page:String(page)})}`),
 subject:(id:string)=>publicRead<Subject>(`${base}/subjects/${encodeURIComponent(id)}`),
 creators:(q='',page=0)=>publicRead<Creator[]>(`${base}/creators?${new URLSearchParams({q,page:String(page)})}`),
 creator:(id:string)=>publicRead<Creator>(`${base}/creators/${encodeURIComponent(id)}`),
 settings:()=>api<Settings>('/api/me/subculture/interests',{cache:'no-store'}),
 save:(settings:Settings)=>api<Settings>('/api/me/subculture/interests',{method:'PUT',body:JSON.stringify({revision:settings.revision,entries:settings.entries.map(({id,subjectId,exhibitorId,customName,customWork,medium,customWorkId})=>({id,subjectId,exhibitorId,customName,customWork,medium,customWorkId}))})}),
 feed:(member:boolean,params:URLSearchParams)=>api<Feed>(`${member?'/api/me/subculture':base}/home?${params}`,{cache:'no-store'}),
}
export const interestKey=(entry:Pick<Interest,'subjectId'|'exhibitorId'|'customName'|'customWork'|'medium'|'customWorkId'>)=>entry.subjectId?'subject:'+entry.subjectId:entry.exhibitorId?'creator:'+entry.exhibitorId:'custom:'+JSON.stringify([entry.customName.normalize('NFKC').replace(/\s/g,'').toLowerCase(),(entry.customWorkId||entry.customWork).normalize('NFKC').replace(/\s/g,'').toLowerCase(),entry.medium])
export const newInterest=(subject?:Subject,creator?:Creator):Interest=>({id:crypto.randomUUID(),subjectId:subject?.id??null,exhibitorId:creator?.id??null,customName:'',customWork:'',medium:'',customWorkId:null,label:subject?.name??creator?.name,workName:subject?.workName??'',kind:subject?.kind??'CREATOR',imageUrl:(subject??creator)?.imageUrl??null,imageSourceUrl:(subject??creator)?.imageSourceUrl??null,imageCredit:(subject??creator)?.imageCredit??null})
