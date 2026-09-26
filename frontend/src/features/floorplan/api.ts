import { api } from '../../api/client'
import type { Asset } from '../catalog/api'
export interface Point { x:number; y:number }
export interface PlanScope { hall:string|null; zone:string|null; dates:string[]; title:string }
export interface Shape { id:string; label:string|null; points:Point[]; recognition:'READABLE'|'UNCERTAIN'; boundaryConfirmed:boolean }
export interface Geometry { extractorVersion:string; complete:boolean; shapes:Shape[]; warnings:string[] }
export interface PlanLink { participantId:number; dates:string[]; method:string }
export interface MappedShape { shape:Shape; status:string; links:PlanLink[]; candidates:number[]; issues:string[] }
export interface Mapping { shapes:MappedShape[]; matched:number; unresolved:number; issues:string[] }
export interface ManualLink {participantId:number; dates:string[]; reason:string}
/** Workspace summaries deliberately omit geometry, mapping and image metadata. */
export interface PlanVersionSummary {id:string; event_id:number; asset_id:number; state:string; revision:number; sha256:string; image_width:number; image_height:number; scope:PlanScope; createdAt:string; updatedAt:string}
export interface PlanVersion extends PlanVersionSummary {geometry:Geometry|null; mapping:Mapping|null; manualLinks:Record<string,ManualLink>; imageUrl:string|null; pageUrl:string; credit:string; note:string}
export interface Source { asset:Asset; scope:PlanScope; canTransform:boolean; sourceRevision:number; lastError:string }
export interface Roster {id:number; name:string; locations:{code:string;hall:string|null;zone:string|null;dates:string[]}[]}
export interface Workspace { watch:{revision:number;disabled:boolean;last_status:string;last_error:string;lastCheckedAt:string;nextCheckAt:string;result:{warnings?:string[]}}|null; sources:Source[]; versions:PlanVersionSummary[]; roster:Roster[] }
export interface PublicShape {id:string;label:string|null;points:Point[];status:string;links:PlanLink[];issues:string[]}
export interface PublicPlan {sourceSha256?:string; offlineAllowed?:boolean; schematic?:boolean; id:string;assetId:number;scope:PlanScope;state:string;publishedAt:string;sourceUrl:string;credit:string;width?:number;height?:number;imageUrl:string|null;shapes:PublicShape[];partial?:boolean}
export interface PublicPlans {plans:PublicPlan[];managedAssetIds:number[]}
const base='/api/admin/subculture/v4/floorplans'
export const floorplanApi={
 version:(id:string)=>api<PlanVersion>(`${base}/versions/${encodeURIComponent(id)}`),
 admin:(id:number)=>api<Workspace>(`${base}/events/${id}`),
 watch:(id:number,revision:number,disabled:boolean)=>api<Workspace>(`${base}/events/${id}/watch`,{method:'PUT',body:JSON.stringify({revision,disabled})}),
 permission:(event:number,s:Source,allowed:boolean,note:string,credit:string)=>api(`${base}/events/${event}/sources/${s.asset.id}/permission`,{method:'PUT',body:JSON.stringify({assetRevision:s.asset.revision,sourceRevision:s.sourceRevision,allowed,note,credit})}),
 scope:(event:number,s:Source,scope:PlanScope)=>api(`${base}/events/${event}/sources/${s.asset.id}/scope`,{method:'PUT',body:JSON.stringify({revision:s.sourceRevision,scope})}),
 edit:(v:PlanVersion,geometry:Geometry,manualLinks:Record<string,ManualLink>,note:string)=>api<PlanVersion>(`${base}/versions/${v.id}`,{method:'PUT',body:JSON.stringify({revision:v.revision,geometry,manualLinks,note})}),
 publish:(v:PlanVersion,acceptPartial:boolean,note:string)=>api(`${base}/versions/${v.id}/publish`,{method:'POST',body:JSON.stringify({revision:v.revision,acceptPartial,note})}),
 withdraw:(v:PlanVersion,note:string)=>api<void>(`${base}/versions/${v.id}/withdraw`,{method:'POST',body:JSON.stringify({revision:v.revision,note,acceptPartial:true})}),
 public:(id:string)=>api<PublicPlans>(`/api/public/catalog/events/${encodeURIComponent(id)}/floorplans`),
}
