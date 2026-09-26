import { Link, useLocation } from 'react-router'
import { supportPath } from './rules'
import type { Target } from './api'
export function ReportLink({target,label='정보 오류 신고',viewedVersion}:{target:Target;label?:string;viewedVersion?:string}){
 const location=useLocation()
 return <Link className="support-report-link" to={supportPath('REPORT',target,viewedVersion)} state={{supportFrom:location.pathname+location.search}}>{label}</Link>
}
export function OwnershipLink({eventId,participantId}:{eventId:number;participantId:number}){return <Link className="support-report-link" to={supportPath('CLAIM',{namespace:'CATALOG',type:'PARTICIPANT',eventId,id:participantId})}>이 업체·서클의 운영자입니다</Link>}
