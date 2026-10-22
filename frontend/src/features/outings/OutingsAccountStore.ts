import {PersonalPlanStore,importId,type PlanTransport} from '../itinerary/PersonalPlanStore'
import type {Plan as AccountPlan} from '../itinerary/model'
import {fromAccountPlan,toAccountPlan} from './accountAdapter'
import {freshState,readState,storageKey,validPlan,type OutingsState} from './model'
type StorageLike=Pick<Storage,'getItem'|'setItem'>
interface Drafts {state:OutingsState;revisions:Record<string,number>}
export interface OutingsAccountState {owner:string;state:OutingsState;ready:boolean;busy:boolean;error:string;savedAt:string;dirtyIds:string[];savedIds:string[];imports:{key:string;plan:AccountPlan}[];conflict:boolean}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
/** Drafts are account-scoped; confirmed records use the existing itinerary store. */
export class OutingsAccountStore {
 readonly personal:PersonalPlanStore
 private owner='';private epoch=0;private importsJob=0;private locked=false;private importBusy=false
 private drafts:Drafts={state:freshState(),revisions:{}};private raw:string|null=null;private error='';private savedAt='';private conflict=false
 private history:Drafts[]=[];private listeners=new Set<()=>void>();private imports:OutingsAccountState['imports']=[]
 private snapshot:OutingsAccountState={owner:'',state:freshState(),ready:false,busy:false,error:'',savedAt:'',dirtyIds:[],savedIds:[],imports:[],conflict:false}
 private unsubscribe:(()=>void)|null=null
 private storage:StorageLike
 constructor(transport:PlanTransport,storage:StorageLike,personal?:PersonalPlanStore){this.storage=storage;this.personal=personal??new PersonalPlanStore(transport,storage)}
 read=()=>this.snapshot
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
 private key(){return this.owner==='guest'?storageKey:`${storageKey}:${this.owner}`}
 bind(owner:string){
  if(owner===this.owner)return
  if(owner&&!this.unsubscribe)this.unsubscribe=this.personal.subscribe(()=>{this.publish();void this.findImports()})
  this.epoch++;this.importsJob++;this.owner=owner;this.history=[];this.imports=[];this.error='';this.savedAt='';this.locked=false;this.conflict=false;this.importBusy=false
  this.drafts={state:freshState(),revisions:{}};this.raw=null
  if(owner)try{
   this.raw=this.storage.getItem(this.key())
   if(owner==='guest'){this.drafts.state=readState(this.storage);this.drafts.state.activeId=this.storage.getItem(`${storageKey}:active`)||this.drafts.state.activeId}
   else if(this.raw){const v=JSON.parse(this.raw);if(v.owner!==owner||v.version!==1||!v.state||!Array.isArray(v.state.plans)||!v.state.plans.every(validPlan)||!v.revisions||typeof v.revisions!=='object')throw Error('Invalid draft');this.drafts={state:{...readState({getItem:()=>JSON.stringify(v.state)}),activeId:typeof v.selectedId==='string'?v.selectedId:v.state.activeId},revisions:v.revisions};for(const p of this.drafts.state.plans)if(!Number.isSafeInteger(this.drafts.revisions[p.id])||this.drafts.revisions[p.id]<0)throw Error('Invalid revision')}
  }catch{this.locked=true;this.error='이 기기의 초안을 확인하지 못했어요. 저장 공간을 확인하고 새로고침해 주세요.'}
  this.personal.bind(owner);if(!owner){this.unsubscribe?.();this.unsubscribe=null}this.publish();if(owner)void this.findImports()
 }
 private publish(){
  const p=this.personal.read(),same=p.owner===this.owner,records=same?p.records:[],drafts=this.drafts.state.plans
  const plans=[...drafts,...records.filter(r=>!drafts.some(p=>p.id===r.plan.id)).map(r=>fromAccountPlan(r.plan))].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))
  this.snapshot={owner:this.owner,state:{...this.drafts.state,plans},ready:!!this.owner&&same&&p.status==='ready',busy:this.importBusy||same&&p.busy,error:this.error||same&&p.error||'',savedAt:this.savedAt,dirtyIds:drafts.map(p=>p.id),savedIds:records.map(r=>r.plan.id),imports:this.imports,conflict:this.conflict}
  this.listeners.forEach(f=>f())
 }
 private persist(){
  if(this.locked)throw Error('기기 저장 공간을 확인한 뒤 다시 열어 주세요.')
  if(this.storage.getItem(this.key())!==this.raw){this.locked=true;throw Error('다른 탭에서 일정이 바뀌었어요. 파일로 보관하고 새로고침해 주세요.')}
  const state={...this.drafts.state,activeId:this.drafts.state.plans[0]?.id??''}
  const raw=JSON.stringify(this.owner==='guest'?state:{version:1,owner:this.owner,state,revisions:this.drafts.revisions,selectedId:this.drafts.state.activeId});this.storage.setItem(this.key(),raw);this.raw=raw
  if(this.owner==='guest')this.storage.setItem(`${storageKey}:active`,this.drafts.state.activeId)
 }
 write=(change:OutingsState|((state:OutingsState)=>OutingsState),remember=true)=>{
  if(!this.owner)return
  const next=typeof change==='function'?change(this.snapshot.state):change
  if(remember)this.history=[...this.history.slice(-19),structuredClone(this.drafts)]
  const records=this.personal.read().records,revisions:Record<string,number>={}
  const plans=next.plans.filter(p=>!records.some(r=>r.plan.id===p.id&&equal(fromAccountPlan(r.plan),p)))
  for(const p of plans)revisions[p.id]=this.drafts.revisions[p.id]??records.find(r=>r.plan.id===p.id)?.revision??0
  this.drafts={state:{...next,plans},revisions}
  try{this.persist();this.error=''}catch(e){this.error=e instanceof Error?e.message:'기기에 저장하지 못했어요. 파일로 보관해 주세요.'}this.publish()
 }
 undo=()=>{const old=this.history.pop();if(old){this.drafts=old;try{this.persist();this.error=''}catch(e){this.error=String(e)}this.publish()}}
 get canUndo(){return this.history.length>0}
 save=async(id:string)=>{
  if(!this.snapshot.ready||this.snapshot.busy)throw Error('계정 일정을 먼저 확인해 주세요.')
  const epoch=this.epoch,plan=this.snapshot.state.plans.find(p=>p.id===id);if(!plan)throw Error('저장할 일정을 찾지 못했어요.')
  if(this.owner==='guest'&&!this.personal.read().records.some(r=>r.plan.id===id)&&this.personal.read().records.length>=20)throw Error('비회원은 저장한 일정을 최대 20개까지 보관할 수 있어요. 로그인하면 더 저장할 수 있어요.')
  const base=this.personal.read().records.find(r=>r.plan.id===id),revision=this.drafts.revisions[id]??base?.revision??0
  try{
   const result=await this.personal.save(toAccountPlan(plan,base?.plan),revision);if(epoch!==this.epoch)return
   const pending=this.drafts.state.plans.find(p=>p.id===id);if(pending&&equal(pending,plan))this.drafts.state.plans=this.drafts.state.plans.filter(p=>p.id!==id)
   this.drafts.revisions[id]=result.revision;this.history=[];this.savedAt=this.owner==='guest'?'이 기기에 저장됨':'계정에 저장됨';this.conflict=false
   try{this.persist();this.error=''}catch{this.error='계정에는 저장됐지만 기기 초안을 정리하지 못했어요. 파일로 보관해 주세요.'}this.publish()
  }catch(e){if(epoch===this.epoch){this.conflict=e instanceof Error&&'status' in e&&[404,409].includes(Number(e.status));this.error=e instanceof Error?e.message:'계정에 저장하지 못했어요.';this.publish()}throw e}
 }
 refresh=()=>this.personal.refresh()
 useLatest=(id:string)=>{
  if(!this.snapshot.ready)throw Error('최신 목록을 먼저 확인해 주세요.')
  this.drafts.state.plans=this.drafts.state.plans.filter(p=>p.id!==id);delete this.drafts.revisions[id];this.conflict=false;this.error='';this.history=[]
  try{this.persist()}catch(e){this.error=String(e)}this.publish()
 }
 remove=async(id:string)=>{
  if(!this.snapshot.ready||this.snapshot.busy)throw Error('계정 일정을 먼저 확인해 주세요.')
  const epoch=this.epoch,record=this.personal.read().records.find(r=>r.plan.id===id)
  if(record){if(this.drafts.revisions[id]!==undefined&&this.drafts.revisions[id]!==record.revision)throw Error('다른 기기에서 수정된 일정이에요. 최신 일정을 확인해 주세요.');await this.personal.remove(id);if(epoch!==this.epoch)return}
  this.drafts.state.plans=this.drafts.state.plans.filter(p=>p.id!==id);delete this.drafts.revisions[id];this.history=[];try{this.persist();this.error=''}catch(e){this.error=String(e)}this.publish()
 }
 private async findImports(){
  const epoch=this.epoch,job=++this.importsJob,p=this.personal.read();if(!this.owner.startsWith('member:')||p.owner!==this.owner||p.status!=='ready')return
  try{const candidates=[...p.local,...readState(this.storage).plans.map(p=>toAccountPlan(p))],ids=await Promise.all(candidates.map(p=>importId(this.owner,p)));if(epoch!==this.epoch||job!==this.importsJob)return
   const hidden:unknown=JSON.parse(this.storage.getItem(`${storageKey}:${this.owner}:hidden-imports`)||'[]');if(!Array.isArray(hidden)||!hidden.every(k=>typeof k==='string'))throw Error('Invalid import preferences')
   this.imports=candidates.flatMap((plan,i)=>hidden.includes(ids[i])||p.records.some(r=>r.plan.id===ids[i]||r.plan.id===plan.id&&equal(r.plan,plan))?[]:[{key:ids[i],plan}]).filter((r,i,all)=>all.findIndex(x=>x.key===r.key)===i);this.publish()
  }catch{if(epoch===this.epoch){this.error='기기 일정을 확인하지 못했어요. 원본은 그대로 보관돼 있어요.';this.publish()}}
 }
 importOne=async(key:string)=>{const p=this.imports.find(p=>p.key===key),epoch=this.epoch;if(!p||!this.snapshot.ready||this.snapshot.busy)return;this.importBusy=true;this.publish();try{await this.personal.importOne(p.plan);if(epoch===this.epoch)await this.findImports()}finally{if(epoch===this.epoch){this.importBusy=false;this.publish()}}}
 hideImport=(key:string)=>{if(!this.owner.startsWith('member:')||!this.imports.some(p=>p.key===key))return;const storageKeyForOwner=`${storageKey}:${this.owner}:hidden-imports`,hidden:unknown=JSON.parse(this.storage.getItem(storageKeyForOwner)||'[]');if(!Array.isArray(hidden)||!hidden.every(k=>typeof k==='string'))throw Error('가져오기 설정을 확인하지 못했어요.');this.storage.setItem(storageKeyForOwner,JSON.stringify([...new Set([...hidden,key])]));this.imports=this.imports.filter(p=>p.key!==key);this.publish()}
}
