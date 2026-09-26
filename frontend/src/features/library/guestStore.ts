import type { GuestMemory,SaveInput } from './types'
import { targetKey,validTarget,validInput } from './memory'
import { validDay } from '../visit/visit'
const PREFIX='boothhana.memory.v15.',MAX=200,TTL=90*86400000
export interface LocalStoragePort {length:number;key(i:number):string|null;getItem(k:string):string|null;setItem(k:string,v:string):void;removeItem(k:string):void}
/** Per-item keys avoid unrelated memories clobbering each other across tabs. No public snapshots/images stored. */
export class GuestStore {
 private storage:()=>LocalStoragePort
 private now:()=>number
 constructor(storage:()=>LocalStoragePort,now=()=>Date.now()){this.storage=storage;this.now=now}
 list():GuestMemory[]{const s=this.storage(),out:GuestMemory[]=[],keys:string[]=[];for(let i=0;i<s.length;i++){const k=s.key(i);if(k?.startsWith(PREFIX))keys.push(k)}for(const key of keys){
  try{const x=JSON.parse(s.getItem(key)||'null') as GuestMemory
   if(x&&typeof x.savedAt==='string'&&Number.isFinite(Date.parse(x.savedAt))&&this.now()-Date.parse(x.savedAt)>TTL){s.removeItem(key);continue}
   if(!x||!validTarget(x.target)||x.key!==targetKey(x.target)||key!==PREFIX+x.key||typeof x.savedAt!=='string'||!Number.isFinite(Date.parse(x.savedAt))||Date.parse(x.savedAt)>this.now()+60000||this.now()-Date.parse(x.savedAt)>TTL)continue
   if(typeof x.day!=='string'||x.day&&!validDay(x.day)||typeof x.hall!=='string'||x.hall.length>150||typeof x.note!=='string'||x.note.length>1000||!Array.isArray(x.visitedDays))continue
   out.push({key:x.key,target:x.target,savedAt:x.savedAt,revision:Number.isSafeInteger(x.revision)&&x.revision>=0?x.revision:0,day:x.day,hall:x.hall,note:x.note,visitedDays:x.visitedDays.filter(d=>typeof d==='string'&&validDay(d)).slice(0,366)})
  }catch{/* Invalid/foreign storage is never interpreted as executable data. */}}
  return out.sort((a,b)=>b.savedAt.localeCompare(a.savedAt)||a.key.localeCompare(b.key)).slice(0,MAX)
 }
 save(input:SaveInput){validInput(input);const all=this.list(),key=targetKey(input.target),old=all.find(x=>x.key===key);if(old)return old
  if(all.length>=MAX)throw Error('기기 임시 저장은 최대 200개예요. 계정에 가져오거나 항목을 정리해 주세요.')
  const x:GuestMemory={...input,key,savedAt:new Date(this.now()).toISOString(),revision:0,note:'',visitedDays:[...new Set(all.filter(x=>x.target.eventId===input.target.eventId&&x.target.participantId===input.target.participantId).flatMap(x=>x.visitedDays))]};this.write(x);return x
 }
 update(key:string,changes:Partial<Pick<GuestMemory,'note'|'day'|'hall'|'visitedDays'>>,expectedRevision?:number){const old=this.list().find(x=>x.key===key);if(!old)throw Error('기기 저장 기록이 없어요. 새로 확인해 주세요.')
  if(expectedRevision!==undefined&&old.revision!==expectedRevision)throw Error('다른 화면에서 메모가 변경됐어요. 다시 열어 확인한 뒤 저장해 주세요.');
  const next={...old,...changes,revision:old.revision+1};if(next.note.length>1000)throw Error('메모는 1,000자 이내로 적어 주세요.');validInput(next);if(next.visitedDays.some(d=>!validDay(d)))throw Error('방문 날짜를 확인해 주세요.');this.write(next);return next
 }
 remove(key:string,revision?:number){const old=this.list().find(x=>x.key===key);if(old&&revision!==undefined&&old.revision!==revision)throw Error('다른 화면에서 변경됐어요. 다시 확인한 뒤 삭제해 주세요.');this.storage().removeItem(PREFIX+key)}
 clear(){const s=this.storage(),keys:string[]=[];for(let i=0;i<s.length;i++){const k=s.key(i);if(k?.startsWith(PREFIX))keys.push(k)}for(const k of keys)s.removeItem(k)}
 private write(x:GuestMemory){const s=this.storage(),key=PREFIX+x.key,value=JSON.stringify(x);s.setItem(key,value);if(s.getItem(key)!==value)throw Error('이 기기에 저장하지 못했어요. 로그인 후 계정 보관함을 이용해 주세요.')}
}
export const isGuestStorageKey=(key:string|null)=>key===null||key.startsWith(PREFIX)
