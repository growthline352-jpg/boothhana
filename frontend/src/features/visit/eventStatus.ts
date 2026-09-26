import type { EventData, OperationStatus } from '../collection/api'
import { eventSchedule } from '../discovery/browse'
export const operationLabels: Record<OperationStatus['state'], string> = {
  UNKNOWN:'개최 상태 미확인', SCHEDULED:'개최 안내 확인', CANCELED:'개최 취소', POSTPONED:'개최 연기', RESCHEDULED:'일정 변경',
}
export const unknownOperation: OperationStatus = {state:'UNKNOWN',note:null,sourceUrl:null,checkedOn:null}
export function eventStatus(event: EventData, today: string) {
  const op = event.operationStatus || unknownOperation
  if (['CANCELED','POSTPONED','RESCHEDULED'].includes(op.state))
    return {label: operationLabels[op.state], state: op.state.toLowerCase(), notice:op.note || '공식 안내를 확인해 주세요.', operation:op}
  // Old warnings are not classified as cancellation. Show a neutral warning instead of an unqualified promise.
  if (op.state === 'UNKNOWN' && (event.warnings?.length || op.note))
    return {label:'방문 전 안내 확인',state:'unknown',notice:op.note || event.warnings?.[0] || null,operation:op}
  return {...eventSchedule(event.occurrences,today),notice:null,operation:op}
}
