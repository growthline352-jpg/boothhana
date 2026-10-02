import type { Location } from '../catalog/api'

export const dateEvidenceLabels = {
  DECLARED: '주최자·업체가 참가일을 명시함', ROSTER: '공식 참가 명단에서 확인함',
  EVENT_PERIOD: '행사 기간만 확인됨', UNKNOWN: '참가일 미확인',
}
export function withDateEvidence(location: Location, evidence: Location['dateEvidence']): Location {
  return {...location, dateEvidence: evidence || null,
    ...(['UNKNOWN','EVENT_PERIOD'].includes(evidence || '') ? {startDate:null,endDate:null} : {})}
}
export function locationEditError(locations: Location[]): string | null {
  for (const row of locations) {
    if (['DECLARED','ROSTER'].includes(row.dateEvidence || '') && (!row.startDate || !row.endDate)) return '참가일을 확인한 위치에는 시작일과 종료일을 입력해 주세요.'
    if (['UNKNOWN','EVENT_PERIOD'].includes(row.dateEvidence || '') && (row.startDate || row.endDate)) return '참가일이 미확인인 위치는 날짜를 비워 주세요.'
    if (!!row.startDate !== !!row.endDate || row.startDate && row.endDate && row.startDate > row.endDate) return '참가일의 시작일과 종료일을 확인해 주세요.'
  }
  return null
}
