import {readPlans,validatePlan,writePlan,type Plan} from './model'
import type {StoredPlan} from './personalApi'
type StorageLike=Pick<Storage,'getItem'|'setItem'>
export interface PlanTransport {list:()=>Promise<StoredPlan[]>;save:(plan:Plan,revision:number,owner:number)=>Promise<StoredPlan>;remove:(id:string,revision:number,owner:number)=>Promise<void>}
export interface PlanState {owner:string;status:'loading'|'ready'|'error';records:StoredPlan[];local:Plan[];error:string;busy:boolean}
export interface ImportOutcome {plan:Plan;error:Error|null}
const empty=(owner=''):PlanState=>({owner,status:'loading',records:[],local:[],error:'',busy:false})
function checked(record:StoredPlan){if(!validatePlan(record.plan)||!Number.isSafeInteger(record.revision)||record.revision<1)throw new Error('저장된 일정 정보를 확인하지 못했어요.');return record}
const importKey=(owner:string)=>`boothhana.itinerary-imports.v1:${owner}`
function readImportAttempts(storage:StorageLike,owner:string,required=false):Record<string,string>{
 try{const value:unknown=JSON.parse(storage.getItem(importKey(owner))||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid import identity');const uuid=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;const entries=Object.entries(value).filter(([source,target])=>uuid.test(source)&&typeof target==='string'&&uuid.test(target));if(required&&entries.length!==Object.keys(value).length)throw new Error('Invalid import identity');return Object.fromEntries(entries)}catch{if(required)throw new Error('이 기기의 가져오기 재시도 정보를 확인하지 못했어요. 브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요. 아직 계정에 전송하지 않았어요.');return {}}
}
export async function importId(owner:string,plan:Plan){
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${owner}\n${JSON.stringify(plan)}`));const bytes=new Uint8Array(hash).slice(0,16);bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}
/** Explicit server saves; local drafts remain local. Old asynchronous responses cannot cross account boundaries. */
export class PersonalPlanStore {
 private state=empty();private epoch=0;private request=0;private listeners=new Set<()=>void>();
 private transport:PlanTransport;private storage:StorageLike
 constructor(transport:PlanTransport,storage:StorageLike){this.transport=transport;this.storage=storage}
 read=()=>this.state
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
 private publish(next:PlanState){this.state=next;this.listeners.forEach(listener=>listener())}
 private key(){return `boothhana.itineraries.v1:${this.state.owner}`}
 private current(epoch:number){if(epoch!==this.epoch)throw new Error('계정이 바뀌었어요. 현재 계정에서 다시 열어 주세요.')}
 bind(owner:string){if(owner===this.state.owner)return;this.epoch++;this.request++;this.publish(empty(owner));if(owner)void this.refresh()}
 refresh=async()=>{
  if(!this.state.owner||this.state.busy)return;const epoch=this.epoch,request=++this.request,owner=this.state.owner;
  this.publish({...this.state,status:'loading',error:''});
  try{
   const ownLocal=readPlans(this.storage,this.key()),local=owner==='guest'?ownLocal:[...ownLocal,...readPlans(this.storage,'boothhana.itineraries.v1:guest')].filter((p,i,all)=>all.findIndex(other=>JSON.stringify(other)===JSON.stringify(p))===i);let records:StoredPlan[],pending:Plan[]=[];
   if(owner==='guest')records=local.map(plan=>({plan,revision:1,updatedAt:plan.updatedAt}));
   else{records=(await this.transport.list()).map(checked);const attempts=readImportAttempts(this.storage,owner),identities=await Promise.all(local.map(plan=>importId(owner,plan)));pending=local.filter((p,i)=>!records.some(r=>r.plan.id===(attempts[identities[i]]||identities[i])||r.plan.id===p.id&&JSON.stringify(r.plan)===JSON.stringify(p)))}
   if(epoch===this.epoch&&request===this.request)this.publish({...this.state,status:'ready',records,local:pending,error:''});
  }catch(e){if(epoch===this.epoch&&request===this.request)this.publish({...this.state,status:'error',error:e instanceof Error?e.message:'일정을 불러오지 못했어요.'})}
 }
 save=async(plan:Plan,revision:number)=>{
  if(this.state.status!=='ready'||this.state.busy)throw new Error('계정 일정을 먼저 확인해 주세요.');const epoch=this.epoch,owner=this.state.owner;this.request++;this.publish({...this.state,busy:true,error:''});
  try{return await this.write(plan,revision,epoch,owner)}finally{if(epoch===this.epoch)this.publish({...this.state,busy:false})}
 }
 private async write(plan:Plan,revision:number,epoch:number,owner:string){
  let result:StoredPlan;
  if(owner==='guest'){writePlan(this.storage,this.key(),plan);result={plan,revision:1,updatedAt:plan.updatedAt}}
  else result=checked(await this.transport.save(plan,revision,Number(owner.slice(7))));
  this.current(epoch);const records=[result,...this.state.records.filter(r=>r.plan.id!==plan.id)];this.publish({...this.state,records:owner==='guest'?records.slice(0,20):records});return result;
 }
 remove=async(id:string)=>{
  if(this.state.status!=='ready'||this.state.busy)throw new Error('계정 일정을 먼저 확인해 주세요.');const epoch=this.epoch,owner=this.state.owner,record=this.state.records.find(r=>r.plan.id===id);if(!record)return;this.request++;this.publish({...this.state,busy:true});
  try{if(owner==='guest')this.storage.setItem(this.key(),JSON.stringify(this.state.records.filter(r=>r.plan.id!==id).map(r=>r.plan)));else await this.transport.remove(id,record.revision,Number(owner.slice(7)));this.current(epoch);this.publish({...this.state,records:this.state.records.filter(r=>r.plan.id!==id)})}
  finally{if(epoch===this.epoch)this.publish({...this.state,busy:false})}
 }
 importOne=async(plan:Plan,newCopy=false)=>{
  const epoch=this.epoch,owner=this.state.owner;if(!owner.startsWith('member:'))throw new Error('계정에 로그인해 주세요.');
  if(this.state.status!=='ready'||this.state.busy)throw new Error('계정 일정을 먼저 확인해 주세요.');this.request++;this.publish({...this.state,busy:true,error:''});
  try{
   const source=await importId(owner,plan);this.current(epoch);const attempts=readImportAttempts(this.storage,owner,true);
   const id=newCopy?crypto.randomUUID():attempts[source]||source;
   if(newCopy){attempts[source]=id;try{this.storage.setItem(importKey(owner),JSON.stringify(attempts))}catch{throw new Error('새 사본의 재시도 정보를 이 기기에 보관하지 못했어요. 브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요. 아직 계정에 전송하지 않았어요.')}}
   const result=await this.write({...plan,id},0,epoch,owner);this.current(epoch);
   // Keep the retry identity whenever a successful copy's browser cleanup is incomplete.
   let cleaned=true;
   for(const key of [this.key(),'boothhana.itineraries.v1:guest'])try{this.storage.setItem(key,JSON.stringify(readPlans(this.storage,key).filter(p=>JSON.stringify(p)!==JSON.stringify(plan))))}catch{cleaned=false}
   if(cleaned&&attempts[source])try{delete attempts[source];this.storage.setItem(importKey(owner),JSON.stringify(attempts))}catch{/* obsolete handles are harmless after source cleanup */}
   this.publish({...this.state,local:this.state.local.filter(p=>JSON.stringify(p)!==JSON.stringify(plan))});return result;
  }finally{if(epoch===this.epoch)this.publish({...this.state,busy:false})}
 }
 importAll=async():Promise<ImportOutcome[]>=>{
  const epoch=this.epoch,plans=[...this.state.local],outcomes:ImportOutcome[]=[];
  for(const plan of plans){this.current(epoch);try{await this.importOne(plan);outcomes.push({plan,error:null})}catch(error){this.current(epoch);outcomes.push({plan,error:error instanceof Error?error:new Error('일정을 가져오지 못했어요.')})}}
  return outcomes;
 }
 discardLocal=async(plan:Plan)=>{
  if(!this.state.owner.startsWith('member:')||this.state.status!=='ready'||this.state.busy)throw new Error('현재 계정을 먼저 확인해 주세요.');
  const epoch=this.epoch;this.request++;this.publish({...this.state,busy:true});
  try{for(const key of [this.key(),'boothhana.itineraries.v1:guest'])this.storage.setItem(key,JSON.stringify(readPlans(this.storage,key).filter(p=>JSON.stringify(p)!==JSON.stringify(plan))));this.current(epoch);this.publish({...this.state,local:this.state.local.filter(p=>JSON.stringify(p)!==JSON.stringify(plan))})}
  finally{if(epoch===this.epoch)this.publish({...this.state,busy:false})}
 }
}
