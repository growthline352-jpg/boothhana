import type { PublicParticipant } from './api'

/** Only explicitly published display fields; never stringify raw/private records or URL metadata. */
export function normalizePublicSearch(value: string): string {
  let text=value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim()
  for(const [alias,canonical] of [['하츠네 미쿠','하츠네미쿠'],['미쿠','하츠네미쿠'],['블아','블루아카이브'],['블루 아카이브','블루아카이브'],['보카로','보컬로이드'],['보컬로','보컬로이드'],['프세카','프로젝트세카이'],['프로젝트 세카이','프로젝트세카이']] as const)
    text=text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${alias}(?![\\p{L}\\p{N}])`,'gu'),canonical)
  return text
}
export function participantFacets(row:PublicParticipant,kind:'subject'|'category'):string[] {
  const products=row.productRows?.map(item=>item.data)??row.sales?.products??[]
  const values=kind==='subject'?[...row.participant.subjects,...(row.sales?.subjects??[]),...products.flatMap(p=>p.subjects)]:[...(row.sales?.categories??[]),...products.flatMap(p=>p.categories)]
  return [...new Set(values.filter(Boolean))]
}
export function matchesParticipantFacet(row:PublicParticipant,kind:'subject'|'category',query:string) {
  return !query || participantFacets(row,kind).some(value=>normalizePublicSearch(value)===normalizePublicSearch(query))
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
