import type { PublicParticipant } from '../catalog/api'
import { matchesPublicParticipant } from '../catalog/publicSearch'
import { relevantLocations } from '../visit/visit'
import { normalizeCode } from './geometry'

export function matchesFloorplanSearch(label:string|null, people:PublicParticipant[], query:string, day:string, hall:string) {
  const value=query.trim()
  if(!value)return true
  if(normalizeCode(label||'').includes(normalizeCode(value)))return true
  return people.some(person=>matchesPublicParticipant({...person,participant:{...person.participant,locations:relevantLocations(person.participant.locations,day,hall)}},value))
}
