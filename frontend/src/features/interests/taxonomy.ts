import { taxonomy } from '../../../seo/taxonomy.mjs'
import type { InterestField } from './api'

export const taxonomyFields = taxonomy.fields
export const eventTypeLabels: Record<string, string> = Object.fromEntries(taxonomy.fields.flatMap(f => f.types.map(t => [t.code, t.label])))
export function eventTypeOptions(category: string, currentType?: string) {
  return [{ value: '', label: '전체' }, ...taxonomy.fields.find(f => f.code === category)!.types
    .filter(t => !t.aliasOf || t.code === currentType).map(t => ({ value: t.code, label: t.label }))]
}
export function canonicalEventType(type: string): string {
  const entry=taxonomy.fields.flatMap(f=>f.types).find(t=>t.code===type)
  return entry?.aliasOf || type
}

/** Display canonical codes in Korean while retaining original work/character names. */
export function eventSubjectLabels(type: string, subjects: string[]): string[] {
  const field = taxonomy.fields.find(f => f.types.some(t => t.code === type))
  const labels = new Map([...(field?.formats ?? []), ...(field?.topics ?? [])].map(o => [o.code.toLowerCase(), o.label]))
  return [...new Set(subjects.map(s => s.trim()).filter(Boolean).map(s => labels.get(s.toLowerCase()) ?? s))]
}

export function eventTopicIssues(field: InterestField | undefined, type: string, subjects: string[]): string[] {
  if (!field) return []
  const values = subjects.map(s => s.trim()).filter(Boolean)
  if (!values.length) return ['취향 주제 확인 필요: 주제 태그가 비어 있습니다.']
  const issues: string[] = []
  if (!field.topics.some(o => o.types?.includes(type) || values.some(s => [o.code, ...(o.subjects ?? [])].some(a => a.toLowerCase() === s.toLowerCase()))))
    issues.push('취향 주제 확인 필요: 연결되는 관심 주제가 없습니다.')
  const formatCodes = new Set(field.formats.map(o => o.code).filter(code => !field.topics.some(o => o.code === code)))
  if (values.every(s => formatCodes.has(s))) issues.push('취향 주제 확인 필요: 행사 유형 코드만 입력되어 있습니다.')
  return issues
}
