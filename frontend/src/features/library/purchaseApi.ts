import {api} from '../../api/client'
import type {PurchasePlan,StoredPurchase} from './purchaseModel'
export const purchaseApi={
 list:()=>api<StoredPurchase[]>('/api/me/purchase-plans'),
 read:(eventId:number)=>api<{record:StoredPurchase|null;revision:number}>(`/api/me/purchase-plans/${eventId}`),
 save:(plan:PurchasePlan,revision:number,expectedUserId:number)=>api<StoredPurchase>(`/api/me/purchase-plans/${plan.eventId}`,{method:'PUT',body:JSON.stringify({plan,revision,expectedUserId})}),
 remove:(eventId:number,revision:number,expectedUserId:number)=>api<void>(`/api/me/purchase-plans/${eventId}?${new URLSearchParams({revision:String(revision),expectedUserId:String(expectedUserId)})}`,{method:'DELETE'}),
}
