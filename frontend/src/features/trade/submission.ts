import { AttemptSlot, isDefiniteRejection, type AttemptStorage } from '../support/submission'

/** Persist only an opaque ID, never a cart, payment memo or personal data. */
export class TradeSubmission<T extends object> {
  requestId:string|null=null
  payload:(T & {requestId:string})|null=null
  uncertain=false
  storageAvailable:boolean
  private slot:AttemptSlot
  private idFactory:()=>string
  constructor(storage:AttemptStorage|null,key:string,idFactory:()=>string=()=>crypto.randomUUID()) {
    this.slot=new AttemptSlot(storage,key);this.idFactory=idFactory
    this.storageAvailable=this.slot.available
    const id=this.slot.read()
    if(id&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)){this.requestId=id;this.uncertain=true}
  }
  prepare(data:T) {
    if(this.uncertain)throw new Error('이전 요청의 저장 결과부터 확인해 주세요.')
    this.requestId??=this.idFactory()
    this.payload=JSON.parse(JSON.stringify({...data,requestId:this.requestId})) as T & {requestId:string}
    this.persist(true);return this.payload
  }
  failed(error:unknown){this.uncertain=!isDefiniteRejection(error);this.persist()}
  missing(){this.uncertain=false;this.persist()}
  completed(){this.slot.replace(null);this.storageAvailable=this.slot.available;this.requestId=null;this.payload=null;this.uncertain=false}
  private persist(required=false){
    const current=this.requestId===null||this.slot.replace(this.requestId)
    this.storageAvailable=this.slot.available
    if(!current){this.uncertain=true;if(required){this.payload=null;this.requestId=null;throw new Error('다른 화면에서 예약·판매 요청이 변경됐어요. 화면을 다시 열어 기존 저장 결과부터 확인해 주세요.')}}
  }
}
export const tradeAttemptKey=(userId:number|undefined,kind:'RESERVATION'|'POS',booth:string)=>
  `boothhana:trade:v14:${userId??'anonymous'}:${kind}:${booth}`
