import type { GuestMemory,MemoryEntry,MemoryTarget,ResolvedMemory,SaveInput } from './types'
import { validDay } from '../visit/visit'
export const targetKey=(t:MemoryTarget)=>`CATALOG:${t.eventId}:${t.type}:${t.id}`
export function validTarget(value:unknown):value is MemoryTarget {
 if(!value||typeof value!=='object')return false
 const t=value as MemoryTarget,positive=(x:unknown)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0
 if(!['EVENT','PARTICIPANT','PRODUCT'].includes(t.type)||!positive(t.eventId)||!positive(t.id))return false
 return t.type==='EVENT'?t.id===t.eventId&&t.participantId===null:t.type==='PARTICIPANT'?t.participantId===t.id:positive(t.participantId)
}
/** Share URLs contain only PUBLIC identifiers and viewing context, never notes or library row IDs. */
export function memoryHref(t:MemoryTarget,day='',hall='',map=false){
 const q=new URLSearchParams();if(validDay(day))q.set('day',day);if(hall)q.set('hall',hall.slice(0,150))
 if(t.participantId){q.set(map?'focus':'booth',String(t.participantId));if(map)q.set('view','map')}
 if(map)q.set('view','map')
 if(!map&&t.type==='PRODUCT')q.set('product',String(t.id))
 return `/discover/${t.eventId}${q.size?'?'+q:''}`
}
export const normal=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim()
export function matchesMemory(e:MemoryEntry,q:string){
 const m=e.available?[e.saved,e.current?.memory].filter(Boolean).map(x=>`${x!.title} ${x!.eventName} ${x!.participantName} ${x!.summary} ${x!.tags.join(' ')}`).join(' '):''
 const hay=normal(`${m} ${e.note} ${e.day} ${e.hall} ${e.savedAt} ${e.visitedDays.join(' ')}`)
 return normal(q).split(' ').every(word=>hay.includes(word))
}
export function guestEntry(g:GuestMemory,r:ResolvedMemory):MemoryEntry{return {...r,id:g.key,revision:g.revision||0,savedAt:g.savedAt,updatedAt:g.savedAt,day:g.day,hall:g.hall,note:g.note,visitedDays:g.visitedDays,saved:r.available?r.current!.memory:null,changed:false,lastOpenedAt:null}}
export function validInput(input:SaveInput){if(!validTarget(input.target)||input.day&&!validDay(input.day)||input.hall.length>150)throw Error('저장 대상이나 방문일을 확인해 주세요.')}

/** Refresh only the public projection of an open editor. Never replace the private
 * note/revision or remount its unsaved draft just to recheck public visibility. */
export function refreshedEntry(entry: MemoryEntry, live: ResolvedMemory | null, ready = true): MemoryEntry {
 const t = entry.target, other = live?.target
 const matching = other && validTarget(other) && t.type === other.type && t.eventId === other.eventId
  && t.id === other.id && t.participantId === other.participantId
 if (!ready || !matching || !live?.available || !live.current)
  return {...entry, available: false, saved: null, current: null, image: null, changed: false}
 const current = live.current
 // The server's public PARTICIPANT projection has no evidenceScope when its
 // separately reviewed sales are absent. Match LibraryService's saved-sales policy.
 // Redact only this render projection; the stored entry and private draft stay intact.
 const saved = entry.saved && t.type === 'PARTICIPANT' && !current.evidenceScope
  ? {...entry.saved, summary: '', tags: [...current.memory.tags]} : entry.saved
 const remembered = entry.saved
 const changed = entry.changed || !!remembered && (
  remembered.title !== current.memory.title || remembered.eventName !== current.memory.eventName
  || remembered.participantName !== current.memory.participantName || remembered.summary !== current.memory.summary
  || JSON.stringify(remembered.tags) !== JSON.stringify(current.memory.tags))
 return {...entry, available: true, saved, current, image: live.image ?? null, changed}
}
