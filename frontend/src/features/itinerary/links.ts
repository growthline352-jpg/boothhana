import {categorySitesActive,isLocalPreview} from '../discovery/site'
export function itineraryHref(event?:number|string,day?:string){
 const origin=categorySitesActive()&&!isLocalPreview()?'https://boothana.kr':''
 if(event===undefined)return `${origin}/outings?view=plans`
 const root=`${origin}/itinerary`
 const params=new URLSearchParams()
 if(event)params.set('event',String(event))
 if(day)params.set('day',day)
 return root+(params.size?'?'+params:'')
}
