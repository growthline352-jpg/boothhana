export function formatPrice(value: number) {
  return `${value.toLocaleString('ko-KR')}원`
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(new Date(value))
}
