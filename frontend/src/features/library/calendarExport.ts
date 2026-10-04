import type {EventData} from '../collection/api'
import {validDay} from '../visit/visit'
const escape=(value:string)=>value.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,')
const stamp=(value:Date)=>value.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')
function fold(value:string){let line='',bytes=0;const lines:string[]=[];for(const char of value){const size=new TextEncoder().encode(char).length;if(bytes+size>75){lines.push(line);line=' ';bytes=1}line+=char;bytes+=size}lines.push(line);return lines.join('\r\n')}
export function visitCalendar(event:EventData,id:number,day:string,now=new Date()):string{
 if(!validDay(day)||!event.occurrences.some(o=>o.startDate<=day&&o.endDate>=day))throw new Error('현재 행사 일정에 있는 방문일을 골라 주세요.')
 if(event.operationStatus?.state==='CANCELED'||event.operationStatus?.state==='POSTPONED')throw new Error('취소·연기된 행사의 현재 공지를 확인하세요.')
 const occurrences=event.occurrences.filter(o=>o.startDate<=day&&o.endDate>=day)
 const exact=occurrences.length===1&&occurrences[0].startTime&&occurrences[0].endTime
 let start:string,end:string
 if(exact){const o=occurrences[0];const begin=new Date(`${day}T${o.startTime}:00+09:00`),finish=new Date(`${day}T${o.endTime}:00+09:00`);if(finish<=begin)finish.setUTCDate(finish.getUTCDate()+1);start=`DTSTART:${stamp(begin)}`;end=`DTEND:${stamp(finish)}`}
 else{start=`DTSTART;VALUE=DATE:${day.replaceAll('-','')}`;end=`DTEND;VALUE=DATE:${new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10).replaceAll('-','')}`}
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//BoothHana//Visit//KO','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:boothana-event-${id}-${day}@boothana.kr`,`DTSTAMP:${stamp(now)}`,start,end,`SUMMARY:${escape(event.name)}`,`LOCATION:${escape([event.venueName,event.address].filter(Boolean).join(' · '))}`,`URL:https://boothana.kr/discover/${id}`,`DESCRIPTION:${escape('추가 당시 행사 안내입니다. 변경 사항은 자동 반영되지 않습니다. 공식 안내와 캘린더 알림 설정을 확인하세요.')}`,'END:VEVENT','END:VCALENDAR'].map(fold).join('\r\n')+'\r\n'
}
export function downloadVisit(event:EventData,id:number,day:string){const blob=new Blob([visitCalendar(event,id,day)],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`boothana-${id}-${day}.ics`;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000)}
