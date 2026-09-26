export type Permission = 'FAN' | 'CREATOR' | 'ADMIN'
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'ENDED'
export type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'
export type ReservationStatus = 'RESERVED' | 'PICKED_UP' | 'CANCELED'

export interface User {
  id: number
  displayName: string
  permissions: Permission[]
}

export interface EventSummary {
  id: number
  name: string
  startAt: string
  endAt: string
  venue: string
  description: string
  imageUrl?: string
  imageKey?: string
  removeImage?: boolean
  reservationStartAt?: string
  reservationEndAt?: string
  status: EventStatus
  boothCount?: number
  applicationStatus?: ApplicationStatus
}

export interface BoothSummary {
  id: number
  eventId: number | null
  name: string
  creatorName: string
  boothNumber: string
  intro: string
  imageUrl?: string
  imageKey?: string
  snsUrl?: string
  status: ApplicationStatus
  isPublic: boolean
  productCount?: number
  reservableCount?: number
  notices?: BoothNotice[]
}

export interface EventProduct {
  version: number
  productVersion: number
  id: number
  eventBoothId: number
  name: string
  description: string
  imageUrl?: string
  imageKey?: string
  price: number
  stockMode: 'FINITE' | 'INFINITE'
  stockQuantity: number | null
  soldOut: boolean
  isPublic: boolean
  reservationEnabled: boolean
}

export interface BoothNotice {
  id: number
  eventBoothId: number
  title: string
  body: string
  pinned: boolean
  createdAt: string
}

export interface ReservationItem {
  id?: number
  eventProductId: number
  productName?: string
  quantity: number
  unitPrice?: number
}

export interface Reservation {
  id: number
  reservationNo: string
  eventBoothId: number
  eventName: string
  boothName: string
  status: ReservationStatus
  qrToken: string
  createdAt: string
  items: ReservationItem[]
}

export interface PosSale {
  id: number
  saleNo: string
  eventBoothId: number
  paymentMethod: 'CASH' | 'TRANSFER' | 'OTHER'
  status: 'SOLD' | 'CANCELED'
  soldAt: string
  totalAmount: number
  items: ReservationItem[]
}

export interface EventApplication {
  revision: number
  id: number
  eventId: number
  eventName: string
  boothId: number
  boothName: string
  creatorName: string
  status: ApplicationStatus
  reason?: string
}

export interface ApiErrorBody {
  requestId?: string
  status: number
  code: string
  message: string
  fieldErrors?: Record<string, string>
}
