import df2610 from './layouts/df2610.json'
import dongneSunday from './layouts/dongne-sunday-20261004.json'
import jipconomy2026 from './layouts/jipconomy-2026.json'

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
  aliases?: string[]
  layoutBasis?: 'OFFICIAL_COORDINATES' | 'OFFICIAL_CODES'
  width: number
  height: number
  booths: SourceLayoutBooth[]
}

const layouts: SourceLayout[] = [df2610, dongneSunday, jipconomy2026]

function sourceKey(value: string) {
  try {
    const url = new URL(value)
    const pathname=decodeURIComponent(url.pathname).normalize('NFC').replace(/\/$/, '')
    return `${url.origin.toLowerCase()}${pathname}`
  } catch {
    return value.replace(/[?#].*$/, '').replace(/\/$/, '').normalize('NFC')
  }
}

export function layoutForSource(sourceUrl: string): SourceLayout | null {
  const key = sourceKey(sourceUrl)
  return layouts.find(layout => [layout.source,...(layout.aliases||[])].some(value=>sourceKey(value)===key)) || null
}
