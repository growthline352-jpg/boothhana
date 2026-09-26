import df2610 from './layouts/df2610.json'

export interface SourceLayoutBooth {
  code: string
  hall: string | null
  x: number
  y: number
  width: number
  height: number
}

export interface SourceLayout {
  source: string
  width: number
  height: number
  booths: SourceLayoutBooth[]
}

const layouts: SourceLayout[] = [df2610]

function sourceKey(value: string) {
  try {
    const url = new URL(value)
    return `${url.origin}${url.pathname.replace(/\/$/, '')}`
  } catch {
    return value.replace(/[?#].*$/, '').replace(/\/$/, '')
  }
}

export function layoutForSource(sourceUrl: string): SourceLayout | null {
  const key = sourceKey(sourceUrl)
  return layouts.find(layout => sourceKey(layout.source) === key) || null
}
