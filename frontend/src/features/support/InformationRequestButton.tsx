export const informationKinds={FEATURE:'서비스 개선',BOOTH:'찾는 부스',PRODUCT:'상품·선입금',PROGRAM:'공연·시간표',TICKET:'입장권·예매'} as const
export type InformationKind=keyof typeof informationKinds
export interface InformationRequest {kind:InformationKind;eventId?:number;day?:string;query?:string}
export function InformationRequestButton({kind='FEATURE',eventId,day,query,label='못 찾은 정보 요청'}:InformationRequest&{label?:string}) {
  return <button className="btn secondary" type="button" onClick={()=>window.dispatchEvent(new CustomEvent<InformationRequest>('boothana:information-request',{detail:{kind,eventId,day,query}}))}>{label}</button>
}
