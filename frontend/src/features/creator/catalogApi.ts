import { api } from '../../api/client'
import type { Participant } from '../catalog/api'
import type { OwnerProductInput, OwnerProducts } from '../support/ownershipApi'
export interface CatalogBoothInput {boothId:number;name:string;description:string;subjects:string[];boothNumber:string;startDate:string;endDate:string}
export interface CatalogBoothValue {eventId:number;participantId:number;boothId:number;revision:number;data:Participant}
export interface MyCatalogBooth {eventId:number;participantId:number;boothId:number;revision:number;name:string;eventName:string;reviewState:string}
export interface RegistrationAvailability {canRegister:boolean;eventOpen:boolean;existingParticipantIds:number[]}
const base='/api/creator/catalog'
const path=(event:number)=>`${base}/events/${event}/booths`
export const creatorCatalogApi={
 mine:()=>api<MyCatalogBooth[]>(`${base}/booths`,{cache:'no-store'}),
 availability:(event:number)=>api<RegistrationAvailability>(`${base}/events/${event}/availability`,{cache:'no-store'}),
 detail:(event:number,participant:number)=>api<CatalogBoothValue>(`${path(event)}/${participant}`,{cache:'no-store'}),
 create:(event:number,body:CatalogBoothInput)=>api<CatalogBoothValue>(path(event),{method:'POST',body:JSON.stringify(body)}),
 update:(event:number,participant:number,revision:number,booth:CatalogBoothInput)=>api<CatalogBoothValue>(`${path(event)}/${participant}`,{method:'PATCH',body:JSON.stringify({revision,booth})}),
 addProduct:(event:number,participant:number,body:OwnerProductInput)=>api<OwnerProducts>(`${path(event)}/${participant}/products`,{method:'POST',body:JSON.stringify({revision:body.revision,name:body.name,summary:body.summary,amount:body.amount,currency:body.currency,saleState:body.saleState})}),
}
