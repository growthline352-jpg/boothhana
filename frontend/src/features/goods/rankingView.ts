import type { GoodsFeed, RankedGood } from './api'

// Do not render an unrelated response as a sales ranking or fabricate fallback products.
export function isGoodsFeed(value: unknown): value is GoodsFeed {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<GoodsFeed>
  return data.basis === 'POS_LOGGED_UNITS' && data.windowDays === 30 &&
    typeof data.from === 'string' && typeof data.to === 'string' && typeof data.asOf === 'string' &&
    [data.from,data.to,data.asOf].every(date => Number.isFinite(Date.parse(date))) &&
    Date.parse(data.to)-Date.parse(data.from)===30*86400000 && Date.parse(data.asOf)>=Date.parse(data.to) &&
    Array.isArray(data.items) && data.items.length <= 12 && data.items.every((item, index) =>
      item !== null && typeof item==='object' &&
      Number.isSafeInteger(item.productId) && item.productId > 0 &&
      Number.isSafeInteger(item.eventProductId) && item.eventProductId > 0 && item.rank === index + 1 &&
      typeof item.name === 'string' && item.name.length > 0 && typeof item.boothName === 'string' &&
      typeof item.eventName === 'string' && ['PUBLISHED','ENDED'].includes(item.eventState) &&
      typeof item.soldOut === 'boolean' && Number.isSafeInteger(item.price) && item.price >= 0 &&
      (item.imageUrl === null || /^https:\/\//.test(item.imageUrl)))
}
export function goodsState(item: RankedGood): string {
  if (item.eventState === 'ENDED') return '행사 종료 · 판매 이력 참고'
  return item.soldOut ? '현재 품절 표기' : '공개된 판매 안내'
}
export function carouselEdges(left:number, width:number, total:number) {
  return {previous:left > 2, next:left + width < total - 2}
}
export function rankingDate(value:string) {
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric'}).format(new Date(value))
}
