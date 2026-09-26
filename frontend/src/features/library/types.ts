import type { EventData, Location } from '../catalog/api'
export type TargetKind='EVENT'|'PARTICIPANT'|'PRODUCT'
export interface MemoryTarget {type:TargetKind;eventId:number;id:number;participantId:number|null}
export interface SaveInput {target:MemoryTarget;day:string;hall:string}
export interface SavedMemory {title:string;eventName:string;participantName:string;summary:string;tags:string[]}
export interface MemoryImage {id:number;url:string;credit:string;sourceUrl:string|null}
export interface MemoryVerification {state:'CONFIRMED_CURRENT'|'NOT_RECONFIRMED'|'LEGACY';lastSeenAt:string|null}
export interface MemoryCurrent {verification?:MemoryVerification|null;memory:SavedMemory;operationState:string;notice:string;venue:string;occurrences:EventData['occurrences'];locations:Location[];evidenceScope:string;price:{amount:string;currency:string;checkedOn?:string;note?:string}|null;saleState:string;links:{label:string;url:string}[];publishedAt:string;warnings?:string[]}
export interface ResolvedMemory {target:MemoryTarget;available:boolean;current:MemoryCurrent|null;image:MemoryImage|null}
export interface MemoryEntry extends ResolvedMemory {id:string;revision:number;savedAt:string;updatedAt:string;day:string;hall:string;note:string;visitedDays:string[];saved:SavedMemory|null;changed:boolean;lastOpenedAt:string|null}
export interface MemoryIndex {id:string;target:MemoryTarget;revision:number;day:string;hall:string;visitedDays:string[]}
export interface MemoryPage {items:MemoryEntry[];page:number;size:number;total:number;groups:{eventId:number;name:string;count:number}[]}
export interface GuestMemory extends SaveInput {key:string;savedAt:string;revision:number;note:string;visitedDays:string[]}
