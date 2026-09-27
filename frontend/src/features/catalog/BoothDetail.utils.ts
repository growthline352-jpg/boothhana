import { relevantLocations } from '../visit/visit'
import type { PublicParticipant } from './api'

export function hasMappableLocation(row: PublicParticipant, day: string, hall: string) {
  return relevantLocations(row.participant.locations, day, hall)
    .some(location => Boolean(location.code?.trim()))
}
