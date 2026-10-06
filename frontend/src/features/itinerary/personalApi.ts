import {api} from '../../api/client'
import type {Plan} from './model'
export interface StoredPlan {plan:Plan;revision:number;updatedAt:string}
export const personalApi={
 list:()=>api<StoredPlan[]>('/api/me/itineraries'),
 save:(plan:Plan,revision:number,expectedUserId:number)=>api<StoredPlan>(`/api/me/itineraries/${encodeURIComponent(plan.id)}`,{method:'PUT',body:JSON.stringify({plan,revision,expectedUserId})}),
 remove:(id:string,revision:number,expectedUserId:number)=>api<void>(`/api/me/itineraries/${encodeURIComponent(id)}?${new URLSearchParams({revision:String(revision),expectedUserId:String(expectedUserId)})}`,{method:'DELETE'}),
}
