import { relevantLocations } from '../visit/visit'
import type { PublicAsset, PublicParticipant } from './api'

export function boothDetailImages(assets: PublicAsset[]) {
  const order = new Map([['BOOTH_CUT', 0], ['LOGO', 1], ['SALES_SHEET', 2], ['BANNER', 3]])
  return [...assets]
    .filter(asset => order.has(asset.type) && (asset.type !== 'BANNER' || (asset.participantId !== null && asset.productId === null)))
    .sort((a, b) => (order.get(a.type) ?? 9) - (order.get(b.type) ?? 9))
    .filter((asset, index, values) => values.findIndex(item => item.url === asset.url) === index)
    .slice(0, 3)
}

export function hasMappableLocation(row: PublicParticipant, day: string, hall: string) {
  return relevantLocations(row.participant.locations, day, hall)
    .some(location => Boolean(location.code?.trim()))
}
