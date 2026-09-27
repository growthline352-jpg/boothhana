/** Public static ES module shared with the isolated offline reader. No new dependency. */
export interface OfflineModule {
 syncOwner(owner: string, stillAllowed?: () => boolean): Promise<{owner:string;epoch:string}>
 downloadEvent(options:{apiBase:string;eventId:number;owner:string;selection:{type:string;id:number}[];day:string;onProgress:(text:string)=>void;stillAllowed:()=>boolean}):Promise<{id:number;missing:string[];omittedImages:number;noApprovedPlan:boolean;bytes:number;savedAt:number}>
 listPacks():Promise<{id:number;name:string;savedAt:number;expiresAt:number;bytes:number;region:string;missing:number;omittedImages:number;noApprovedPlan:boolean}[]>
 clearAll():Promise<void>
}
let pending:Promise<OfflineModule>|null=null
export function loadOfflineModule():Promise<OfflineModule>{
 const path='/offline/store.mjs'
 if(!pending)pending=import(/* @vite-ignore */ path).catch(error=>{pending=null;throw error})
 return pending!
}
