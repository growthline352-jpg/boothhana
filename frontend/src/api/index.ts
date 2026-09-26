import { api, resetCsrfToken } from './client'
import { createImageUploadTask } from './image-upload'
import type {
  BoothNotice,
  BoothSummary,
  EventApplication,
  EventProduct,
  EventSummary,
  PosSale,
  Reservation,
  ReservationItem,
  User,
} from '../types'

// Read models contain labels, counters, IDs and resolved image URLs that are not input DTOs.
// Project only the server's write contract. In particular, preserve BOTH update revisions.
const writeEvent = (x: Partial<EventSummary>) => ({name:x.name,startAt:x.startAt,endAt:x.endAt,venue:x.venue,
  description:x.description,imageKey:x.imageKey,reservationStartAt:x.reservationStartAt,reservationEndAt:x.reservationEndAt,status:x.status,removeImage:x.removeImage})
const writeBooth = (x: Partial<BoothSummary>) => ({name:x.name,intro:x.intro,imageKey:x.imageKey,snsUrl:x.snsUrl})
const writeEventBooth = (x: Pick<BoothSummary,'boothNumber'|'intro'|'isPublic'>) => ({boothNumber:x.boothNumber,intro:x.intro,isPublic:x.isPublic})
const writeProduct = (x: Partial<EventProduct>) => ({name:x.name,description:x.description,imageKey:x.imageKey,price:x.price,
  stockMode:x.stockMode,stockQuantity:x.stockQuantity,soldOut:x.soldOut,isPublic:x.isPublic,reservationEnabled:x.reservationEnabled,
  version:x.version,productVersion:x.productVersion})
const writeNotice = (x: Partial<BoothNotice>) => ({title:x.title,body:x.body,pinned:x.pinned})
const writeLines = (items: ReservationItem[]) => items.map(x=>({eventProductId:x.eventProductId,quantity:x.quantity}))

export const authApi = {
  me: () => api<User>('/api/me', { cache: 'no-store', signal: AbortSignal.timeout(15_000) }),
  logout: async () => {
    // Stop pending old-session mutations before requesting logout, even if logout later fails.
    resetCsrfToken()
    try { await api<void>('/api/logout', { method: 'POST' }) }
    finally { resetCsrfToken() }
  },
}

export const publicApi = {
  events: () => api<EventSummary[]>('/api/public/events'),
  event: (id: string) => api<EventSummary>(`/api/public/events/${id}`),
  eventBooths: (id: string) => api<BoothSummary[]>(`/api/public/events/${id}/booths`),
  booth: (id: string) => api<BoothSummary>(`/api/public/booths/${id}`),
  products: (id: string) => api<EventProduct[]>(`/api/public/booths/${id}/products`),
  product: (id: string) => api<EventProduct>(`/api/public/products/${id}`),
}

export const reservationApi = {
  list: () => api<Reservation[]>('/api/me/reservations'),
  detail: (id: string) => api<Reservation>(`/api/me/reservations/${id}`),
  receipt: (requestId: string) => api<{found:boolean;resultId?:number}>(`/api/me/reservation-requests/${encodeURIComponent(requestId)}`),
  create: (eventBoothId: number, items: ReservationItem[], requestId: string) =>
    api<Reservation>('/api/me/reservations', {
      method: 'POST',
      body: JSON.stringify({ eventBoothId, items:writeLines(items), requestId }),
    }),
  cancel: (id: number) => api<Reservation>(`/api/me/reservations/${id}/cancel`, { method: 'POST' }),
}

export const creatorApi = {
  applications: () => api<EventApplication[]>('/api/creator/applications'),
  resubmit: (id: number, revision: number) => api<EventApplication>(`/api/creator/applications/${id}/resubmit`, {method:'POST',body:JSON.stringify({revision})}),
  withdraw: (id: number, revision: number) => api<EventApplication>(`/api/creator/applications/${id}/withdraw`, {method:'POST',body:JSON.stringify({revision})}),
  events: (boothId?: number) => api<EventSummary[]>(`/api/creator/events${boothId ? `?boothId=${boothId}` : ''}`),
  booths: () => api<BoothSummary[]>('/api/creator/booths'),
  eventBooths: () => api<BoothSummary[]>('/api/creator/event-booths'),
  updateEventBooth: (id: number, body: Pick<BoothSummary, 'boothNumber' | 'intro' | 'isPublic'>) =>
    api<BoothSummary>(`/api/creator/event-booths/${id}`, { method: 'PATCH', body: JSON.stringify(writeEventBooth(body)) }),
  deleteEventBooth: (id: number) => api<void>(`/api/creator/event-booths/${id}`, { method: 'DELETE' }),
  createBooth: (body: Partial<BoothSummary>) =>
    api<BoothSummary>('/api/creator/booths', { method: 'POST', body: JSON.stringify(writeBooth(body)) }),
  updateBooth: (id: number, body: Partial<BoothSummary>) =>
    api<BoothSummary>(`/api/creator/booths/${id}`, { method: 'PATCH', body: JSON.stringify(writeBooth(body)) }),
  deleteBooth: (id: number) => api<void>(`/api/creator/booths/${id}`, { method: 'DELETE' }),
  apply: (eventId: number, boothId: number) =>
    api<EventApplication>('/api/creator/applications', {
      method: 'POST',
      body: JSON.stringify({ eventId, boothId }),
    }),
  products: (eventBoothId: string) => api<EventProduct[]>(`/api/creator/event-booths/${eventBoothId}/products`),
  saveProduct: (eventBoothId: string, body: Partial<EventProduct>) =>
    api<EventProduct>(`/api/creator/event-booths/${eventBoothId}/products`, { method: 'POST', body: JSON.stringify(writeProduct(body)) }),
  updateProduct: (id: number, body: Partial<EventProduct>) =>
    api<EventProduct>(`/api/creator/products/${id}`, { method: 'PATCH', body: JSON.stringify(writeProduct(body)) }),
  deleteProduct: (id: number) => api<void>(`/api/creator/products/${id}`, { method: 'DELETE' }),
  copyProducts: (eventBoothId: string, productIds: number[]) =>
    api<EventProduct[]>(`/api/creator/event-booths/${eventBoothId}/products/copy`, {
      method: 'POST',
      body: JSON.stringify({ productIds }),
    }),
  reservations: () => api<Reservation[]>('/api/creator/reservations'),
  reservationByNumber: (value: string) => api<Reservation>(`/api/creator/reservations/by-number/${encodeURIComponent(value)}`),
  pickup: (id: number) => api<Reservation>(`/api/creator/reservations/${id}/pickup`, { method: 'POST' }),
  posSales: () => api<PosSale[]>('/api/creator/pos-sales'),
  posSale: (id: number) => api<PosSale>(`/api/creator/pos-sales/${id}`),
  posReceipt: (requestId: string) => api<{found:boolean;resultId?:number}>(`/api/creator/pos-requests/${encodeURIComponent(requestId)}`),
  createPosSale: (eventBoothId: number, paymentMethod: string, items: ReservationItem[], requestId: string) =>
    api<PosSale>('/api/creator/pos-sales', { method: 'POST', body: JSON.stringify({ eventBoothId, paymentMethod, items:writeLines(items), requestId }) }),
  cancelPosSale: (id: number) => api<PosSale>(`/api/creator/pos-sales/${id}/cancel`, { method: 'POST' }),
  notices: (eventBoothId: string) => api<BoothNotice[]>(`/api/creator/event-booths/${eventBoothId}/notices`),
  saveNotice: (eventBoothId: string, body: Partial<BoothNotice>) =>
    api<BoothNotice>(`/api/creator/event-booths/${eventBoothId}/notices`, { method: 'POST', body: JSON.stringify(writeNotice(body)) }),
  updateNotice: (id: number, body: Partial<BoothNotice>) =>
    api<BoothNotice>(`/api/creator/notices/${id}`, { method: 'PATCH', body: JSON.stringify(writeNotice(body)) }),
  deleteNotice: (id: number) => api<void>(`/api/creator/notices/${id}`, { method: 'DELETE' }),
  pinNotice: (id: number) => api<BoothNotice>(`/api/creator/notices/${id}/pin`, { method: 'POST' }),
}

export const adminApi = {
  events: () => api<EventSummary[]>('/api/admin/events'),
  event: (id: string) => api<EventSummary>(`/api/admin/events/${id}`),
  createEvent: (body: Partial<EventSummary>) =>
    api<EventSummary>('/api/admin/events', { method: 'POST', body: JSON.stringify(writeEvent(body)) }),
  updateEvent: (id: number, body: Partial<EventSummary>) =>
    api<EventSummary>(`/api/admin/events/${id}`, { method: 'PATCH', body: JSON.stringify(writeEvent(body)) }),
  deleteEvent: (id: number) => api<void>(`/api/admin/events/${id}`, { method: 'DELETE' }),
  publishEvent: (id: number) => api<EventSummary>(`/api/admin/events/${id}/publish`, { method: 'POST' }),
  endEvent: (id: number) => api<EventSummary>(`/api/admin/events/${id}/end`, { method: 'POST' }),
  applications: () => api<EventApplication[]>('/api/admin/applications'),
  approve: (id: number, revision: number) => api<EventApplication>(`/api/admin/applications/${id}/approve`, { method: 'POST', body: JSON.stringify({ revision }) }),
  reject: (id: number, reason: string, revision: number) =>
    api<EventApplication>(`/api/admin/applications/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason, revision }) }),
}

export const uploadApi = {
  async image(file: File, target: 'booth' | 'product'): Promise<string> {
    return createImageUploadTask(file, target).run()
  },
}
