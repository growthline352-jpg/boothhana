/** Optional details used by the unified day planner; core itinerary fields stay shared. */
export interface OutingDetails {
 placeId:string;kind:string;area:string;description:string;tags:string[];cost:number|null;indoor:boolean|null;
 booking:string;source:'sample'|'catalog'|'custom';sourceUrl?:string;admission?:string;state?:string;
 travel:number|null;fixed:string;done:boolean;
}
export function validOutingDetails(value:unknown):value is OutingDetails {
 if(!value||typeof value!=='object')return false
 const v=value as OutingDetails, text=(x:unknown,n:number):x is string=>typeof x==='string'&&x.length<=n&&!x.includes('\0')
 return text(v.placeId,100)&&!!v.placeId&&['event','popup','exhibition','festival','subculture','cafe','food','walk','custom'].includes(v.kind)
  &&text(v.area,100)&&text(v.description,3000)&&Array.isArray(v.tags)&&v.tags.length<=30&&v.tags.every(x=>text(x,100))
  &&(v.cost===null||typeof v.cost==='number'&&Number.isFinite(v.cost)&&v.cost>=0&&v.cost<=10000000)
  &&[true,false,null].includes(v.indoor)&&text(v.booking,500)&&['sample','catalog','custom'].includes(v.source)
  &&(v.travel===null||Number.isInteger(v.travel)&&v.travel>=0&&v.travel<=360)&&typeof v.fixed==='string'&&(v.fixed===''||/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v.fixed))&&typeof v.done==='boolean'
  &&(v.sourceUrl===undefined||v.sourceUrl===''||text(v.sourceUrl,2048)&&/^https:\/\//.test(v.sourceUrl))
  &&(v.admission===undefined||text(v.admission,500))&&(v.state===undefined||text(v.state,32))
}
