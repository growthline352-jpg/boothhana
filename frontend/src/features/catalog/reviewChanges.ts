/** Compare only edited fields, independent of JSON object property order. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameValue(v, b[i]))
  }
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every(k => Object.hasOwn(right, k) && sameValue(left[k], right[k]))
}
export function changedFields(original: object, edited: object): Record<string, unknown> {
  const base = original as Record<string, unknown>
  return Object.fromEntries(Object.entries(edited).filter(([key, value]) => !sameValue(base[key], value)))
}
export function parseObject(text: string): Record<string, unknown> {
  if (!text.trim()) return {}
  const value: unknown = JSON.parse(text)
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('변경할 필드만 JSON 객체로 입력해 주세요.')
  if (Object.keys(value).some(k => ['__proto__', 'prototype', 'constructor'].includes(k))) throw new Error('허용되지 않는 필드입니다.')
  return value as Record<string, unknown>
}
