import { api } from '../../api/client'

export interface RankedGood {
  rank: number
  productId: number
  eventProductId: number
  name: string
  price: number
  imageUrl: string | null
  boothName: string
  eventName: string
  eventState: 'PUBLISHED' | 'ENDED'
  soldOut: boolean
}
export interface GoodsFeed {
  basis: 'POS_LOGGED_UNITS'
  windowDays: number
  from: string
  to: string
  asOf: string
  items: RankedGood[]
}
export interface GoodsCandidate {
  product_id: number
  event_product_id: number
  name: string
  price: number
  booth_name: string
  event_name: string
  units: number
  category: string | null
  enabled: boolean
  revision: number
}
export const goodsApi = {
  bestsellers: (category: string) => api<GoodsFeed>(`/api/public/goods/bestsellers?category=${encodeURIComponent(category)}`),
  candidates: (q: string, page: number) => api<{items: GoodsCandidate[];page:number;size:number;hasNext:boolean}>(
    `/api/admin/goods-showcase?q=${encodeURIComponent(q)}&page=${page}`),
  configure: (id:number, category:string, enabled:boolean, revision:number) => api<{revision:number}>(
    `/api/admin/goods-showcase/${id}`, {method:'PUT',body:JSON.stringify({category,enabled,revision})}),
}
