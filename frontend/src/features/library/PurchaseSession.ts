import {mergeSavedPurchases,validPurchasePlan,validPurchaseDraft,type PurchasePlan,type StoredPurchase} from './purchaseModel'
import type {MemoryEntry} from './types'
export interface PurchaseTransport {load:()=>Promise<{record:StoredPurchase|null;memories:MemoryEntry[];revision?:number}>;save:(plan:PurchasePlan,revision:number,owner:number)=>Promise<StoredPurchase>;remove?:(eventId:number,revision:number,owner:number)=>Promise<void>}
interface PurchaseState {status:'loading'|'ready'|'error';plan:PurchasePlan|null;memories:MemoryEntry[];revision:number;dirty:boolean;saving:boolean;error:string;errorKind:'save'|'lookup'|'delete'|'input'|null;message:string;latest:StoredPurchase|null;stored:boolean;deletedRevision:number|null}
type DraftStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>
/** Explicit edits and user-triggered one-click saves; viewing a library never writes a plan. */
export class PurchaseSession {
 private state:PurchaseState={status:'loading',plan:null,memories:[],revision:0,dirty:false,saving:false,error:'',errorKind:null,message:'',latest:null,stored:false,deletedRevision:null};
 private listeners=new Set<()=>void>();private epoch=0;private latestRequest=0;private writeGeneration=0;private active=false;private signature='';private transport:PurchaseTransport;private storage:DraftStorage;private current:()=>boolean;private owner:number;private eventId:number;private eventName:string;
 constructor(owner:number,eventId:number,eventName:string,transport:PurchaseTransport,storage:DraftStorage,current:()=>boolean){this.owner=owner;this.eventId=eventId;this.eventName=eventName;this.transport=transport;this.storage=storage;this.current=current}
 read=()=>this.state
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
 private publish(part:Partial<PurchaseState>){this.state={...this.state,...part};this.listeners.forEach(l=>l())}
 private key(){return `boothhana.purchase-draft:${this.owner}:${this.eventId}`}
 private rememberDraft(){try{if(this.state.dirty)this.storage.setItem(this.key(),JSON.stringify({plan:this.state.plan,revision:this.state.revision}));else this.storage.removeItem(this.key())}catch{/* server saving remains available */}}
 private accepts(epoch:number){return this.active&&epoch===this.epoch&&this.current()}
 activate(){this.active=true}
 dispose(){this.active=false;this.epoch++}
 load=async()=>{const epoch=++this.epoch;this.publish({status:'loading',error:'',errorKind:null});try{const {record,memories,revision:absenceRevision=0}=await this.transport.load();if(!this.accepts(epoch))return;if(!Number.isSafeInteger(absenceRevision)||absenceRevision<0||record&&(!validPurchasePlan(record.plan)||record.plan.eventId!==this.eventId||!Number.isSafeInteger(record.revision)||record.revision<1))throw Error('저장한 구매 메모를 확인하지 못했어요.');
  const base=mergeSavedPurchases(record?.plan||{eventId:this.eventId,eventName:memories.find(m=>m.current?.memory.eventName)?.current?.memory.eventName||this.eventName,budget:null,items:[]},memories);this.signature=JSON.stringify(base);let plan=base,revision=record?.revision||absenceRevision;
  try{const draft=JSON.parse(this.storage.getItem(this.key())||'null');if(draft&&validPurchaseDraft(draft.plan)&&draft.plan.eventId===this.eventId&&Number.isSafeInteger(draft.revision)&&draft.revision>=0){plan=mergeSavedPurchases(draft.plan,memories);revision=draft.revision}}catch{/* optional device draft */}
  this.publish({status:'ready',plan,memories,revision,dirty:JSON.stringify(plan)!==this.signature,saving:false,error:'',errorKind:null,message:'',latest:record&&revision<record.revision?record:null,stored:!!record,deletedRevision:!record&&absenceRevision>revision?absenceRevision:null});
 }catch(e){if(this.accepts(epoch))this.publish({status:'error',error:e instanceof Error?e.message:'저장한 부스를 확인하지 못했어요.',errorKind:'lookup'})}}
 edit=(plan:PurchasePlan)=>{if(!this.active||!this.current()||this.state.status!=='ready'||this.state.saving)return;const dirty=JSON.stringify(plan)!==this.signature;this.publish({plan,dirty,message:''});this.rememberDraft()}
 error=(message:string)=>this.publish({error:message,errorKind:'input'})
 remove=async()=>{if(!this.active||!this.current()||!this.transport.remove||!this.state.stored||this.state.saving||this.state.revision<1)return false;const epoch=this.epoch;this.writeGeneration++;this.publish({saving:true,error:'',errorKind:null});try{await this.transport.remove(this.eventId,this.state.revision,this.owner);if(!this.accepts(epoch))return false;try{this.storage.removeItem(this.key())}catch{/* optional cleanup */}await this.load();if(!this.active||!this.current()||this.state.status!=='ready')return false;this.publish({message:'구매 메모를 삭제했어요. 저장한 부스·상품은 그대로예요.'});return true}catch(e){if(this.accepts(epoch))this.publish({error:e instanceof Error?e.message:'구매 메모를 삭제하지 못했어요.',errorKind:'delete'});return false}finally{if(this.active&&this.current())this.publish({saving:false})}}
 changeAndSave=async(plan:PurchasePlan)=>{this.edit(plan);await this.save()}
 save=async()=>{if(!this.active||!this.current()||this.state.status!=='ready'||!this.state.plan||this.state.saving)return;this.writeGeneration++;if(this.state.deletedRevision!==null){this.publish({error:'다른 화면에서 삭제한 메모예요. 아래에서 초안을 새 메모로 저장하거나 정리해 주세요.',errorKind:'input'});return}const plan=this.state.plan,revision=this.state.revision,epoch=this.epoch;if(!validPurchasePlan(plan)){this.publish({error:'물건 이름·수량·예상금액을 확인한 뒤 저장해 주세요.',errorKind:'input'});return}this.publish({saving:true,error:'',errorKind:null,message:''});
  try{const stored=await this.transport.save(plan,revision,this.owner);if(!this.accepts(epoch))return;if(!validPurchasePlan(stored.plan)||stored.plan.eventId!==this.eventId||!Number.isSafeInteger(stored.revision)||stored.revision<1)throw Error('저장 결과를 확인하지 못했어요. 다시 시도해 주세요.');const known=Math.max(this.state.revision,this.state.deletedRevision??0,this.state.latest?.revision??0);if(stored.revision<known){this.publish({dirty:true,message:'',error:'저장 중 다른 화면에서 메모가 변경됐어요. 최신 상태를 확인한 뒤 다시 저장해 주세요.',errorKind:'save'});this.rememberDraft();return}this.signature=JSON.stringify(stored.plan);this.publish({plan:stored.plan,revision:stored.revision,dirty:false,error:'',errorKind:null,message:'계정에 저장했어요.',latest:null,stored:true,deletedRevision:null});try{this.storage.removeItem(this.key())}catch{/* optional cleanup */}
  }catch(e){if(this.accepts(epoch))this.publish({error:e instanceof Error?e.message:'저장하지 못했어요. 입력 내용은 유지했어요.',errorKind:'save'})}finally{if(this.accepts(epoch))this.publish({saving:false})}}
 checkLatest=async()=>{
  if(!this.active||!this.current()||this.state.status!=='ready'||this.state.saving)return;
  const epoch=this.epoch,request=++this.latestRequest,writeGeneration=this.writeGeneration;
  const currentRequest=()=>this.accepts(epoch)&&request===this.latestRequest&&writeGeneration===this.writeGeneration;
  try{
   const {record,revision=0}=await this.transport.load();if(!this.accepts(epoch))return;
   const known=Math.max(this.state.revision,this.state.deletedRevision??0,this.state.latest?.revision??0);
   if(record){
    if(record.plan.eventId!==this.eventId||!validPurchasePlan(record.plan)||!Number.isSafeInteger(record.revision)||record.revision<1)throw Error('최신 메모를 확인하지 못했어요.');
    if(record.revision>known)this.publish({latest:record,deletedRevision:null});
   }else{
    if(!Number.isSafeInteger(revision)||revision<0)throw Error('최신 메모를 확인하지 못했어요.');
    if(revision>known)this.publish({latest:null,deletedRevision:revision,stored:false,error:'',errorKind:null});
   }
   if(currentRequest()&&this.state.errorKind==='lookup')this.publish({error:'',errorKind:null});
  }catch(e){if(currentRequest())this.publish({error:e instanceof Error?e.message:'최신 메모를 확인하지 못했어요.',errorKind:'lookup'})}
 }
 useLatest=()=>{if(!this.active||!this.current()||!this.state.latest||this.state.saving)return;this.latestRequest++;const record=this.state.latest,plan=mergeSavedPurchases(record.plan,this.state.memories);this.signature=JSON.stringify(plan);this.publish({plan,revision:record.revision,dirty:false,error:'',errorKind:null,message:'최신 구매 메모를 불러왔어요.',latest:null,stored:true,deletedRevision:null});this.rememberDraft()}
 saveDeletedDraftAsNew=async()=>{if(!this.active||!this.current()||this.state.status!=='ready'||this.state.saving||this.state.deletedRevision===null||!this.state.plan)return;const revision=this.state.deletedRevision;this.signature='';this.publish({revision,deletedRevision:null,latest:null,stored:false,dirty:true,error:'',errorKind:null});this.rememberDraft();await this.save()}
 discardDeletedDraft=()=>{if(!this.active||!this.current()||this.state.status!=='ready'||this.state.saving||this.state.deletedRevision===null)return;this.latestRequest++;const plan=mergeSavedPurchases({eventId:this.eventId,eventName:this.state.plan?.eventName||this.eventName,budget:null,items:[]},this.state.memories);this.signature=JSON.stringify(plan);this.publish({plan,revision:this.state.deletedRevision,deletedRevision:null,latest:null,stored:false,dirty:false,error:'',errorKind:null,message:'초안을 정리했어요. 저장한 부스·상품은 그대로예요.'});this.rememberDraft()}
}
