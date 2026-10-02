import type { BoothNotice, BoothSummary, EventSummary, PosSale, ReservationStatus } from '../../types'

export function eventBoothLabel(booth: BoothSummary, events: EventSummary[] = []) {
  const event = events.find(item => item.id === booth.eventId)
  return `${event?.name ?? `행사 #${booth.eventId}`} · ${booth.name} · ${booth.boothNumber || '부스 번호 미정'}`
}

export function eventDates(event?: EventSummary) {
  if (!event) return '행사 일정 확인 필요'
  const date = (value: string) => new Date(value).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
  return `${date(event.startAt)} — ${date(event.endAt)}`
}

export function saleBoothLabel(id: number, booths: BoothSummary[], events: EventSummary[]) {
  const booth = booths.find(item => item.id === id)
  return booth ? eventBoothLabel(booth, events) : `행사 부스 #${id} (목록에서 확인 불가)`
}

export const reservationStatusLabel: Record<ReservationStatus, string> = {
  RESERVED: '미수령', PICKED_UP: '수령 완료', CANCELED: '취소',
}

export function noticeTargetsBooth(editing: Partial<BoothNotice>, boothId: string, notices: BoothNotice[] | null) {
  return !editing.id || (editing.eventBoothId === Number(boothId) &&
    !!notices?.some(row => row.id === editing.id && row.eventBoothId === Number(boothId)))
}

export function salesForBooth(sales: PosSale[], boothId: string, all = false) {
  return sales.filter(sale => all || sale.eventBoothId === Number(boothId))
}
