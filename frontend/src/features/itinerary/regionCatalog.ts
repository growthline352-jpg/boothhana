import shapes from './region-shapes.json'
import type {EventData} from '../collection/api'

export type Province = 'SEOUL'|'GYEONGGI'
export const itineraryRegions = shapes as {id:string;province:Province;name:string;short:string;point:{lat:number;lng:number};label:number[];anchor:number[];path:string}[]
export const regionArea = (id:string) => itineraryRegions.find(r=>r.id===id)
const otherProvince=/(?:^|\s)(?:부산|대구|인천|대전|울산|광주광역|세종|충청|충북|충남|전라|전북|전남|경상|경북|경남|강원|제주)/
export const outsideMetro=(address:string)=>otherProvince.test(address)
const token=(name:string,text:string)=>new RegExp(`(?:^|[\\s,])${name}(?=[\\s,]|$)`).test(text)

/** Use the operating venue's address, not the grouped event's headline location. */
export function regionForEvent(event:Pick<EventData,'address'|'region'|'venueName'|'districts'>){
 const address=(event.address||'').normalize('NFKC').replaceAll('특례시','시')
 if(otherProvince.test(address))return undefined
 const seoul=/(?:^|\s)서울(?:특별시|시)?(?=\s|$)/.test(address)
 const gyeonggi=/(?:^|\s)경기(?:도)?(?=\s|$)/.test(address)
 const province=seoul?'SEOUL':gyeonggi?'GYEONGGI':event.region==='SEOUL'||event.region==='GYEONGGI'?event.region:undefined
 if(!province)return undefined
 const regions=itineraryRegions.filter(r=>r.province===province)
 const exact=regions.find(r=>token(r.name,address))
 if(exact)return exact
 // Old addresses sometimes omit the 시/군 suffix ("경기 고양 일산서구 ...").
 if(province==='GYEONGGI')return regions.find(r=>token(r.short,address))
 const districts=[...new Set((event.districts||[]).filter(d=>regions.some(r=>r.name===d)))]
 return districts.length===1?regions.find(r=>r.name===districts[0]):undefined
}
