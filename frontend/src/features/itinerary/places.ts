import {distance,validPoint,type Point,type PlanStop} from './model'
import {publicRead} from '../../api/client'

export interface Place {id:string;name:string;address:string;point:Point;kind:'FOOD'|'CAFE'|'PLACE';url:string;provider?:'KAKAO'|'OSM';openingHours?:string;distance?:number}
const cache=new Map<string,{until:number;places:Place[]}>(),inflight=new Map<string,Promise<Place[]>>()
async function cached(key:string,work:()=>Promise<Place[]>){const hit=cache.get(key);if(hit&&hit.until>Date.now())return hit.places;const running=inflight.get(key);if(running)return running;const job=work().then(places=>{cache.set(key,{until:Date.now()+3600000,places});return places}).finally(()=>inflight.delete(key));inflight.set(key,job);return job}
const local=typeof window!=='undefined'&&/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
// Public demo providers are opt-in local review adapters. Production requires configured providers.
const photon=import.meta.env.VITE_ITINERARY_SEARCH_URL || (local?'https://photon.komoot.io/api/':'')
const nearby=import.meta.env.VITE_ITINERARY_NEARBY_URL || (local?'https://photon.komoot.io/reverse':'')
export const placeSearchAvailable=!local||!!photon,nearbyAvailable=!local||!!nearby
type PlaceData={features?:{geometry:{coordinates:number[]};properties:Record<string,string>}[]}
export function decodePlaces(data:PlaceData,fallback=''):Place[]{
 return (data.features||[]).flatMap(f=>{
  const point={lat:f.geometry?.coordinates?.[1],lng:f.geometry?.coordinates?.[0]},p=f.properties
  if(!validPoint(point)||!p)return []
  const kakao=p.provider==='KAKAO',url=kakao?p.place_url:`https://www.openstreetmap.org/${p.osm_type==='W'?'way':p.osm_type==='R'?'relation':'node'}/${p.osm_id}`
  return [{id:kakao?`KAKAO/${p.place_id}`:`${p.osm_type}/${p.osm_id}`,name:p.name||fallback,address:kakao?p.address:[p.city,p.district,p.street,p.housenumber].filter(Boolean).join(' '),point,
   kind:p.osm_value==='cafe'?'CAFE' as const:p.osm_value==='restaurant'?'FOOD' as const:'PLACE' as const,url,provider:kakao?'KAKAO' as const:'OSM' as const}]
 })
}
export async function resolveAddress(address:string):Promise<Point|null>{
 if(!address.trim())return null
 return cached(`address:${address}`,async()=>decodePlaces(await publicRead<PlaceData>(`/api/public/itinerary/places/geocode?${new URLSearchParams({address})}`)))
  .then(places=>places[0]?.point||null).catch(()=>null)
}
export async function searchPlaces(query:string,center:Point):Promise<Place[]>{
 if(local&&!photon)throw new Error('장소 검색을 연결 중이에요. 이름·주소를 직접 입력하고 지도에서 위치를 골라 주세요.')
 const q=query.trim().slice(0,100);if(q.length<2)return []
 return cached(`search:${q}:${center.lat}:${center.lng}`,async()=>{
  if(!local)return decodePlaces(await publicRead<PlaceData>(`/api/public/itinerary/places/search?${new URLSearchParams({q,lat:String(center.lat),lon:String(center.lng)})}`),q)
  const url=new URL(photon);url.search=new URLSearchParams({q,lat:String(center.lat),lon:String(center.lng),limit:'6'}).toString()
  const response=await fetch(url,{signal:AbortSignal.timeout(18000)});if(!response.ok)throw new Error('장소 검색에 연결하지 못했어요. 지도에서 위치를 직접 고를 수 있어요.')
  return decodePlaces(await response.json() as PlaceData,q)
 }).catch(()=>{throw new Error('장소 검색을 불러오지 못했어요. 다시 검색하거나 지도에서 위치를 골라 주세요.')})
}
export async function nearbyPlaces(center:Point):Promise<Place[]>{
 if(local&&!nearby)throw new Error('주변 음식점 검색을 연결 중이에요. 가고 싶은 장소를 직접 추가할 수 있어요.')
 return cached(`near:${center.lat.toFixed(4)}:${center.lng.toFixed(4)}`,async()=>{
  if(!local)return decodePlaces(await publicRead<PlaceData>(`/api/public/itinerary/places/nearby?${new URLSearchParams({lat:String(center.lat),lon:String(center.lng)})}`)).filter(p=>p.kind!=='PLACE'&&distance(center,p.point)<=1.2).map(p=>({...p,distance:distance(center,p.point)})).sort((a,b)=>a.distance-b.distance)
  const url=new URL(nearby);url.search=new URLSearchParams({lat:String(center.lat),lon:String(center.lng),radius:'1.2',limit:'16'}).toString();url.searchParams.append('osm_tag','amenity:restaurant');url.searchParams.append('osm_tag','amenity:cafe')
  const response=await fetch(url,{signal:AbortSignal.timeout(18000)})
  if(!response.ok)throw new Error('주변 장소를 불러오지 못했어요. 직접 입력하거나 잠시 후 다시 찾아 주세요.')
  const data=await response.json() as {features?:{geometry:{coordinates:number[]};properties:Record<string,string>}[]}
  return (data.features||[]).flatMap(f=>{const point={lat:f.geometry.coordinates[1],lng:f.geometry.coordinates[0]},p=f.properties;if(!validPoint(point)||!p.name||!['restaurant','cafe'].includes(p.osm_value)||distance(center,point)>1.2)return []
   return [{id:`${p.osm_type}/${p.osm_id}`,name:p.name,address:[p.city,p.district,p.street,p.housenumber].filter(Boolean).join(' '),point,kind:p.osm_value==='cafe'?'CAFE' as const:'FOOD' as const,url:`https://www.openstreetmap.org/${p.osm_type==='W'?'way':p.osm_type==='R'?'relation':'node'}/${p.osm_id}`,distance:distance(center,point)}]
  }).sort((a,b)=>(a.distance||0)-(b.distance||0)).filter((p,i,all)=>all.findIndex(x=>x.name===p.name&&distance(x.point,p.point)<.08)===i).slice(0,16)
 }).catch(()=>{throw new Error('주변 장소를 불러오지 못했어요. 직접 입력하거나 잠시 후 다시 찾아 주세요.')})
}
export function placeStop(place:Place,start:string):PlanStop{return {id:crypto.randomUUID(),name:place.name,address:place.address,point:place.point,kind:place.kind,source:place.provider||'OSM',url:place.url,start,duration:place.kind==='FOOD'?60:45,locked:false,note:'',openingHours:place.openingHours}}
