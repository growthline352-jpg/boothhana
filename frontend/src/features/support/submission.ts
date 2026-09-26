import type { TicketInput } from './api'

export interface AttemptStorage {
  getItem(key:string):string|null
  setItem(key:string,value:string):void
  removeItem(key:string):void
}
/** A compare-before-write slot for one tab's opaque pending request ID.
 * An older form must not overwrite/remove the ID left by a newer form.
 * This is not a cross-process lock or server idempotency implementation.
 */
export class AttemptSlot {
  available: boolean
  private value: string | null = null
  private superseded = false
  private readonly storage: AttemptStorage | null
  private readonly key: string
  constructor(storage: AttemptStorage | null, key: string) {
    this.storage = storage; this.key = key
    this.available = storage !== null
    try { this.value = storage?.getItem(key) ?? null } catch { this.available = false }
  }
  read() { return this.value }
  replace(next: string | null): boolean {
    if (this.superseded) return false
    // Preserve the existing explicitly warned in-memory-only recovery mode.
    // A slot that could not be read must not later overwrite unknown metadata.
    if (!this.storage || !this.available) return true
    try {
      if (this.storage.getItem(this.key) !== this.value) { this.superseded = true; return false }
      if (next !== this.value) {
        if (next === null) this.storage.removeItem(this.key)
        else this.storage.setItem(this.key, next)
      }
      this.value = next
      return true
    } catch { this.available = false; return true }
  }
}
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** An attempt keeps one ID even when a missing receipt and an in-flight create race.
 * Storage contains only an opaque request ID. Text, evidence, contact details and snapshots
 * stay in memory; after a reload, the owner must check the receipt before editing again.
 */
export class TicketSubmission {
  requestId:string|null=null
  payload:TicketInput|null=null
  uncertain=false
  storageAvailable=true
  private readonly slot:AttemptSlot
  private readonly newId:()=>string
  constructor(storage:AttemptStorage|null,key:string,newId:()=>string=()=>crypto.randomUUID()) {
    this.slot=new AttemptSlot(storage,key);this.newId=newId
    this.storageAvailable=this.slot.available
    const saved=this.slot.read()
    if(saved&&uuidPattern.test(saved)){this.requestId=saved;this.uncertain=true}
  }
  prepare(data:Omit<TicketInput,'requestId'>):TicketInput {
    if(this.uncertain)throw new Error('기존 접수 결과부터 확인해 주세요.')
    this.requestId??=this.newId()
    // Freeze by copying: later edits cannot change an outstanding retry payload.
    this.payload=JSON.parse(JSON.stringify({...data,requestId:this.requestId})) as TicketInput
    this.persist(true)
    return this.payload
  }
  failed(error:unknown) {
    this.uncertain=!isDefiniteRejection(error)
    // Keep the same request ID after a confirmed rejection, too. A later concurrent
    // success cannot silently become another ticket merely because text was edited.
    this.persist()
  }
  missing(){this.uncertain=false;this.persist()}
  completed(){this.slot.replace(null);this.storageAvailable=this.slot.available;this.requestId=null;this.payload=null;this.uncertain=false}
  private persist(required=false){
    const current=this.requestId===null||this.slot.replace(this.requestId)
    this.storageAvailable=this.slot.available
    if(!current){this.uncertain=true;if(required){this.payload=null;this.requestId=null;throw new Error('다른 화면에서 접수 요청이 변경됐어요. 화면을 다시 열어 기존 접수 결과부터 확인해 주세요.')}}
  }
}

/** Explicit pre-commit client/auth/validation/rate errors. 409/5xx/parse/network errors
 * remain ambiguous and MUST NOT automatically create a different request ID.
 */
export function isDefiniteRejection(error:unknown):boolean {
  if(!error||typeof error!=='object'||!('status' in error))return false
  return [400,401,403,404,413,415,422,429].includes(Number(error.status))
}
export function attemptStorage():AttemptStorage|null {
  try{return typeof window==='undefined'?null:(window.sessionStorage??null)}catch{return null}
}
export function attemptKey(userId:number|undefined,kind:string,targetKey:string):string {
  // Include account and target identity, not the private form body or viewed context.
  return `boothhana:support-attempt:v13:${userId??'anonymous'}:${kind}:${targetKey}`
}
