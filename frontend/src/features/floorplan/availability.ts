import type { EventData, PublicEvent } from '../catalog/api'
import type { PublicPlans } from './api'
import { generateSchematicPlan } from './schematic'

export function floorplanSourceUrl(event: EventData) {
  return event.discoveryLinks?.find(link => link.kind === 'FLOOR_PLAN' && link.url)?.url
    || event.discoveryLinks?.find(link => link.kind === 'OFFICIAL' && link.url)?.url
    || event.sources.find(source => source.kind === 'OFFICIAL')?.url
    || event.sources[0]?.url || ''
}

/** Use published content for the whole venue, independently of booth search or hall filters. */
export function hasFloorplanContent(value: PublicEvent, maps: PublicPlans | null) {
  const { event, assets, participants } = value
  if (event.discoveryLinks?.some(link => link.kind === 'FLOOR_PLAN' && link.url)) return true
  if (maps?.plans.some(plan => plan.state === 'READY')) return true
  // A withdrawn version must not make an old source image available again.
  if (maps && assets.some(asset => asset.type === 'FLOOR_PLAN' && asset.participantId === null
    && asset.productId === null && !maps.managedAssetIds.includes(asset.id))) return true
  return !!generateSchematicPlan(event, participants, '', '', floorplanSourceUrl(event))
}
