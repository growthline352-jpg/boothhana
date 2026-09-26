import type { PublicParticipant } from './api'

/** Only explicitly published display fields; never stringify raw/private records or URL metadata. */
export function normalizePublicSearch(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim()
}
export function publicParticipantSearchText(row: PublicParticipant): string {
  const p = row.participant
  const products = row.sales ? (row.productRows?.map(item => item.data) ?? row.sales.products ?? []) : []
  const fields: (string | null | undefined)[] = [p.registrationName, ...p.subjects,
    ...p.locations.flatMap(l => [l.code, l.hall, l.zone]),
    ...p.members.flatMap(m => [m.name, ...m.aliases]),
    row.sales?.summary, ...(row.sales?.categories ?? []), ...(row.sales?.subjects ?? []),
    ...products.flatMap(item => [item.name, item.summary, item.memberName, ...item.categories, ...item.subjects]),
  ]
  return normalizePublicSearch(fields.filter((v): v is string => typeof v === 'string').join(' '))
}
export function matchesPublicParticipant(row: PublicParticipant, query: string): boolean {
  const words = normalizePublicSearch(query).split(' ').filter(Boolean)
  const text = publicParticipantSearchText(row)
  return words.every(word => text.includes(word))
}
