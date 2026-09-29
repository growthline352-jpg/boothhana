import type { Target, TicketKind } from './api'
export const kinds:Record<TicketKind,string>={REPORT:'정보 오류 신고',INQUIRY:'고객문의',CLAIM:'주최자·부스 운영자 인증'}
export const categories:Record<TicketKind,Record<string,string>>={REPORT:{SCHEDULE_PLACE:'일정·장소',PARTICIPATION_LOCATION:'참가·부스 위치',PRODUCT_PRICE:'상품·가격·판매 상태',IMAGE_RIGHTS:'이미지·권리',OTHER:'기타 정보 오류'},INQUIRY:{ACCOUNT:'로그인·계정',SERVICE:'서비스 이용 오류',RESERVATION:'예약·수령',BUSINESS:'업체 등록·관리',EVENT_REQUEST:'행사 추가 요청',OTHER:'기타 문의'},CLAIM:{OWNERSHIP:'업체 운영·관리권 확인',ORGANIZER:'행사 주최자 확인'}}
export const statuses:Record<string,string>={OPEN:'접수',IN_PROGRESS:'확인 중',WAITING_USER:'추가 정보 요청',ANSWERED:'답변 완료',RESOLVED:'처리 완료',CLOSED:'종료'}
export const resolutions:Record<string,string>={UPDATED:'공개 정보 변경 확인',HIDDEN:'공개 숨김 확인',NO_CHANGE:'확인 후 정보 유지',DUPLICATE:'기존 신고에 연결',OTHER:'사유 안내 후 종료',CLOSE:'답변 후 종료',APPROVED:'관리 관계 승인',REJECTED:'관리 관계 반려'}
export function parseKind(value:string|null):TicketKind{return value==='REPORT'||value==='CLAIM'?value:'INQUIRY'}
export function readTarget(params:URLSearchParams):Target|null {
 const raw=params.get('target');if(!raw)return null
 try{if(raw.length>2000)return null;const v=JSON.parse(raw) as Target
  if(!['CATALOG','PLATFORM'].includes(v.namespace)||!['EVENT','PARTICIPANT','PRODUCT','ASSET','FLOORPLAN','BOOTH','RESERVATION'].includes(v.type)||!Number.isSafeInteger(v.eventId)||v.eventId<0)return null
  if(v.type==='FLOORPLAN'){if(typeof v.planId!=='string'||!/^[\da-f-]{36}$/i.test(v.planId))return null}else if(!Number.isSafeInteger(v.id)||Number(v.id)<1)return null
  if(v.namespace==='CATALOG'&&v.eventId<1)return null
  for(const key of ['day','hall','areaId'] as const)if(v[key]!=null&&(typeof v[key]!=='string'||v[key]!.length>100))return null
  // Select exact fields; do not trust serialized arbitrary objects as identity or an existing snapshot.
  return {namespace:v.namespace,type:v.type,eventId:v.eventId,id:v.id??null,planId:v.planId??null,areaId:v.areaId??null,day:v.day??null,hall:v.hall??null}
 }catch{return null}
}
export function supportPath(kind:TicketKind,target?:Target,viewedVersion?:string){const p=new URLSearchParams({kind});if(target)p.set('target',JSON.stringify(target));if(viewedVersion)p.set('seen',viewedVersion.slice(0,1000));return `/support/new?${p}`}
export function safeReturnPath(value:string){if(!value.startsWith('/')||value.startsWith('//')||/[\\\r\n\0]/.test(value)||value.length>2000)return '/';return value}
export function evidenceLines(text:string){const values=text.split('\n').map(x=>x.trim()).filter(Boolean);if(values.length>5)throw new Error('근거 링크는 5개까지 입력해 주세요.');for(const v of values){try{const u=new URL(v);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||v.length>2048||v.includes('\\'))throw new Error()}catch{throw new Error('근거 링크는 올바른 HTTP(S) 주소로 입력해 주세요.')}}return values}
export function secureGuestKey(){const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}
export function validGuest(access:{ticketId:string;accessKey:string}){return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(access.ticketId)&&/^[\w-]{43}$/.test(access.accessKey)}
export function outcomeTone(status:string){return status==='WAITING_USER'?'warning':status==='RESOLVED'||status==='ANSWERED'?'active':'muted'}
