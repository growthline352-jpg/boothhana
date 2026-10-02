import { api, publicRead } from '../../api/client'
import type { EventData, EventSource, Page, ReviewState } from '../collection/api'
import { combineDfestaSummaries } from './eventGroup'
import { loadAllEvents } from './allEvents'
export type { EventData, Page, ReviewState }
export type EvidenceScope = 'EVENT_LISTED' | 'EVENT_SALE_CONFIRMED' | 'PROFILE' | 'GENERAL_CATALOG' | 'PAST_REFERENCE' | 'UNKNOWN'
export interface Location {code: string | null; status: string; hall: string | null; zone: string | null; startDate: string | null; endDate: string | null; floorPlanUrl: string | null; dateEvidence?:'DECLARED'|'ROSTER'|'EVENT_PERIOD'|'UNKNOWN'|null}
export interface Member {name: string; kind: string; aliases: string[]; profileUrl: string | null}
export interface ImageCandidate {type: string; imageUrl: string; pageUrl: string; caption: string | null; rightsEvidence: string | null}
export interface Identity {sourceSystem: string; entryId: string | null; detailUrl: string | null}
export interface ProductCheck {state: string; lastSeenAt: string | null}
export interface ProductRow {id: number | null; data: Product; verification?: ProductCheck}
export interface Participant {identity?: Identity | null; sourceEntryId: string | null; registrationName: string; kind: string; members: Member[]; locations: Location[]; subjects: string[]; description?: string | null; officialLinks: string[]; sources: EventSource[]; images: ImageCandidate[]; warnings: string[]}
export interface Product {identity?: Identity | null; sourceEntryId: string | null; name: string; summary: string; memberName: string | null; categories: string[]; subjects: string[]; evidenceScope: EvidenceScope; price: {amount: string; currency: string; checkedOn: string; note: string | null} | null; saleState: string; productUrl: string | null; sources: EventSource[]; images: ImageCandidate[]; warnings: string[]}
export interface Sales {summary: string; evidenceScope: EvidenceScope; categories: string[]; subjects: string[]; salesMethod: string | null; sources: EventSource[]; images: ImageCandidate[]; products: Product[]; warnings: string[]}
export interface Asset {offlineAllowed?: boolean; id: number; eventId: number; participantId: number | null; productId: number | null; revision: number; type: string; imageUrl: string; pageUrl: string; caption: string | null; rightsEvidence: string | null; rightsState: string; rightsNote: string; storageState: string; storedUrl: string | null; error: string; credit: string}
export interface ParticipantRow {id: number; eventId: number; revision: number; reviewState: ReviewState; data: Participant; collectedData: Participant; reviewNote: string; lastSeenAt: string; overrides: Record<string,unknown>; sales: {revision: number; reviewState: ReviewState; data: Sales; collectedData: Sales | null; reviewNote: string; collectedAt: string; overrides: Record<string,unknown>; productRows: ProductRow[]} | null; assets: Asset[]}
export interface EventRow {id: number; name: string; subcategory: string; reviewState: ReviewState; participantCount: number; salesCount: number; storedImageCount: number; published: boolean; startDate: string}
export interface Coverage {completeness: string; reportedTotal: number | null; totalUnit: string; visitedPages: string[]; nextPageUrl: string | null; warnings: string[]}
export interface BannerSelection {assetId: number | null; revision: number}
export interface EventDetail {bannerSelection: BannerSelection; id: number; revision: number; event: EventData; collectedEvent: EventData; overrides: Record<string, unknown>; reviewState: ReviewState; note: string; possibleDuplicateOf: number | null; assets: Asset[]; recentStages: {stage: string; status: string; coverage: Coverage; receivedAt: string}[]; participantProgress?: {root_url: string | null; next_page_url: string | null; pass_no: number; page_index: number; state: string; updated_at: string}[]; publication: {event_revision: number; published_at: string}[]}
export interface PipelineRun {runId: string; state: string; scope: {startDate: string; endDate: string}; startedAt: string; heartbeatAt: string; summary: {counts?: Record<string,number>; issues?: string[]; schedule?: string; receipts?: Record<string,{status:string;inserted:number;changed:number;unchanged:number;rejected:number}>}}
export interface Edit {revision: number; reviewState: ReviewState; note: string; overrides: Record<string,unknown>; clearOverrides?: string[]}
const base='/api/admin/subculture/v4'
export const catalogApi={
 events:(page=0)=>api<Page<EventRow>>(`${base}/events?page=${page}&size=20`),
 event:(id:number)=>api<EventDetail>(`${base}/events/${id}`),
 editEvent:(id:number,input:Edit)=>api<EventDetail>(`${base}/events/${id}`,{method:'PATCH',body:JSON.stringify(input)}),
 participants:(id:number,page=0,q='')=>api<Page<ParticipantRow>>(`${base}/events/${id}/participants?page=${page}&size=20&q=${encodeURIComponent(q)}`),
 participant:(id:number)=>api<ParticipantRow>(`${base}/participants/${id}`),
 editParticipant:(id:number,input:Edit)=>api<ParticipantRow>(`${base}/participants/${id}`,{method:'PATCH',body:JSON.stringify(input)}),
 editSales:(id:number,input:Edit)=>api<ParticipantRow>(`${base}/participants/${id}/sales`,{method:'PATCH',body:JSON.stringify(input)}),
 rights:(asset:Asset,rightsState:string,note:string,credit:string,offlineAllowed=false)=>api<Asset>(`${base}/assets/${asset.id}/rights`,{method:'PATCH',body:JSON.stringify({revision:asset.revision,rightsState,note,credit,offlineAllowed})}),
 selectBanner:(eventId:number,selection:BannerSelection,asset:Asset|null)=>api<BannerSelection>(`${base}/events/${eventId}/banner`,{method:'PUT',body:JSON.stringify({revision:selection.revision,assetId:asset?.id??null,assetRevision:asset?.revision??null})}),
 publish:(id:number,eventRevision:number)=>api<{published:boolean;participantCount:number}>(`${base}/events/${id}/publish`,{method:'POST',body:JSON.stringify({eventRevision})}),
 unpublish:(id:number)=>api<void>(`${base}/events/${id}/publish`,{method:'DELETE'}),
 runs:(page=0)=>api<Page<PipelineRun>>(`${base}/runs?page=${page}&size=20`),
}
export interface PublicAsset {offlineAllowed?: boolean; id: number; participantId: number | null; productId: number | null; type: string; url: string; caption: string | null; attribution: string; credit: string}
export interface PublicParticipant {id: number; participant: Participant; sales: Sales | null; productRows?: ProductRow[]}
export interface PublicEvent {banner?:PublicAsset|null;id:number;mode:'INFO_ONLY';event:EventData;participants:PublicParticipant[];publishedAt:string;assets:PublicAsset[]}
export interface PublicEventSummary { id: number; event: EventData; participantCount: number; publishedAt?: string; banner?: PublicAsset | null }
export interface PopularEventSummary extends PublicEventSummary { saveCount: number }

const placeholderRegistrationNames = new Set(['', '.', '-', '—', 'ㆍ'])

/** Keep collected evidence intact in the API while presenting useful public labels. */
export function presentPublicParticipant(row: PublicParticipant): PublicParticipant {
 const collectedName=row.participant.registrationName.trim()
 const memberNames=[...new Set(row.participant.members.map(member=>member.name.trim()).filter(Boolean))]
 const registrationName=placeholderRegistrationNames.has(collectedName)
  ? (memberNames.join(' · ')||'부스명 미확인')
  : collectedName
 if(!row.sales)return {...row,participant:{...row.participant,registrationName}}
 const products=(row.productRows?.map(product=>product.data)??row.sales.products)
  .filter(product=>['EVENT_LISTED','EVENT_SALE_CONFIRMED'].includes(product.evidenceScope))
 const names=[...new Set(products.map(product=>product.name.trim()).filter(Boolean))]
 const summary=names.length
  ? `${names.slice(0,2).join(' · ')}${names.length>2?` 외 ${names.length-2}개`:''}`
  : row.sales.categories.length
   ? `${row.sales.categories.slice(0,3).join(' · ')} 안내`
   : row.participant.subjects.length
    ? `${row.participant.subjects.slice(0,3).join(' · ')} 관련 부스`
    : '판매정보를 확인하고 있어요.'
 return {...row,participant:{...row.participant,registrationName},sales:{...row.sales,summary}}
}

export const publicCatalogApi={
 calendar:(query:string,combineEditions=true)=>loadAllEvents(new URLSearchParams(query), params=>publicRead<Page<PublicEventSummary>>(`/api/public/catalog/events?${params}`),combineEditions),
 popular:(category?:string)=>publicRead<PopularEventSummary[]>(`/api/public/catalog/events/popular${category?`?category=${encodeURIComponent(category)}`:''}`),
 browse:async(query:string)=>{const page=await publicRead<Page<PublicEventSummary>>(`/api/public/catalog/events?${query}`);return {...page,items:combineDfestaSummaries(page.items)}},
 events:async(page=0)=>{const result=await publicRead<Page<PublicEventSummary>>(`/api/public/catalog/events?page=${page}&size=20`);return {...result,items:combineDfestaSummaries(result.items)}},
 event:async(id:string)=>{
  const value=await publicRead<PublicEvent>(`/api/public/catalog/events/${id}`)
  return {...value,participants:value.participants.map(presentPublicParticipant)}
 },
}
