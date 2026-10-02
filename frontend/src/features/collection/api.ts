import { api } from '../../api/client'
export type ReviewState = 'PENDING' | 'REVIEWED' | 'EXCLUDED'
export type Subcategory = 'COMIC_DOUJIN' | 'DOLL' | 'ONLY_EVENT' | 'BIRTHDAY_CAFE' | 'STATIONERY_GOODS' | 'SUBCULTURE_MUSIC' | 'ANIME_GAME_FESTIVAL' | 'ART_BOOK' | 'BOARD_GAME' | 'CHARACTER_ART' | 'ILLUSTRATION' | 'WINE' | 'WEDDING' | 'LIFESTYLE' | 'DESIGN' | 'BUSINESS' | 'WALK' | 'LIGHT' | 'MUSIC' | 'FOOD' | 'CULTURE'
export interface Occurrence { startDate: string; endDate: string; startTime: string | null; endTime: string | null }
export interface EventSource { url: string; kind: string; access: string; evidence: string }
export interface SourceCoverage { channel: string; status: string; queries: string[]; checkedUrls: string[]; notes: string }
export interface Banner { imageUrl: string; pageUrl: string; rights: string; rightsEvidence: string | null; matchesEdition: boolean | null }
export interface OperationStatus { state: 'UNKNOWN'|'SCHEDULED'|'CANCELED'|'POSTPONED'|'RESCHEDULED'; note: string|null; sourceUrl: string|null; checkedOn: string|null }
export interface EventData {
  visitorGuide?: VisitorGuide | null
  operationStatus?: OperationStatus
  eventFormat?: string; discoveryLinks?: {kind: string; url: string | null; status: string; note: string | null}[]
  name: string; subcategory: Subcategory; organizer: string | null; edition: string | null; region: string
  venueName: string | null; address: string | null; description: string; admission: string | null
  subjects: string[]; occurrences: Occurrence[]; sources: EventSource[]; banners: Banner[]; warnings: string[]
}
export interface TicketInfo {id:string;name:string;visitDate:string|null;priceAmount:string|null;currency:string|null;salesStartsAt:string|null;salesEndsAt:string|null;entryTime:string|null;reservationUrl:string|null;status:string;note:string|null;sourceUrl:string|null;checkedOn:string|null}
export interface ProgramInfo {id:string;name:string;type:string;subjects:string[];day:string|null;startTime:string|null;endTime:string|null;venue:string|null;ticketRequirement:'INCLUDED'|'SEPARATE'|'UNKNOWN';ticketId:string|null;status:string;note:string|null;sourceUrl:string|null;checkedOn:string|null}
export interface FaqInfo {id:string;question:string;answer:string|null;status:'CONFIRMED'|'UNKNOWN';sourceUrl:string|null;checkedOn:string|null}
export interface SaleAnnouncement {id:string;title:string;salesMethod:string|null;salesStartsAt:string|null;salesEndsAt:string|null;pickupDay:string|null;note:string|null;sourceUrl:string;checkedOn:string}
export interface ContentStatus {kind:string;status:string;note:string|null;sourceUrl:string|null;checkedOn:string|null}
export interface VisitorGuide {tickets:TicketInfo[];programs:ProgramInfo[];faq:FaqInfo[];sales:SaleAnnouncement[];coverage:ContentStatus[]}
export interface Candidate {
  id: number; name: string; subcategory: Subcategory; venueName: string | null; startsOn: string; endsOn: string
  reviewState: ReviewState; revision: number; possibleDuplicateOf: number | null; lastSeenAt: string
}
export interface Detail {
  id: number; revision: number; reviewState: ReviewState; event: EventData; reviewedEvent: EventData | null
  validationWarnings: string[]; reviewNote: string; possibleDuplicateOf: number | null; firstSeenAt: string; lastSeenAt: string
  sourceCoverage?: SourceCoverage[]
}
export interface Receipt {
  runId: string; status: string; inserted: number; changed: number; unchanged: number; rejected: number
  rejections: { index: number; name: string; reasons: string[] }[]
  candidates?: { index: number; id: number; name: string }[]
}
export interface Run {
  id: string; status: string; executionMode: string; startedAt: string; finishedAt: string
  scope: { region: string; timezone: string; startDate: string; endDate: string }; summary: string; receipt: Receipt
}
export interface Page<T> { items: T[]; page: number; size: number; total: number }
export const collectionApi = {
  candidates: (state: ReviewState | 'ALL', page: number) => api<Page<Candidate>>(`/api/admin/subculture/candidates?state=${state}&page=${page}&size=20`),
  detail: (id: number) => api<Detail>(`/api/admin/subculture/candidates/${id}`),
  review: (id: number, revision: number, reviewState: ReviewState, note: string) => api<Detail>(`/api/admin/subculture/candidates/${id}/review`, {
    method: 'PATCH', body: JSON.stringify({ revision, reviewState, note }),
  }),
  runs: (page: number) => api<Page<Run>>(`/api/admin/subculture/runs?page=${page}&size=20`),
}
