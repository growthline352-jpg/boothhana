import type { ReactNode } from 'react'
export type IconName = 'sparkles' | 'building' | 'festival' | 'search' | 'pin' | 'calendar' | 'arrow' | 'chevron' | 'ticket' | 'menu' | 'close' | 'info' | 'grid' | 'check' | 'download' | 'bookmark'
export function DiscoveryIcon({ name, size = 20 }: { name: IconName; size?: number }) {
  const shapes: Record<IconName, ReactNode> = {
    sparkles: <><path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3Z"/><path d="M20 2v4M18 4h4"/></>,
    building: <><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M7 7V3h10v4M8 11v3m8-3v3m-8 3v4m8-4v4M3 7l9-3 9 3"/></>,
    festival: <><path d="m4 21 4-13 9 9-13 4Zm5-7 3 3m2-9 3-3m0 7h4M10 4V1m11 4h-2m0-2v4"/><path d="M13 5c2-1 4-1 4-4M17 13c0-2 3-2 4-1"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></>,
    pin: <><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h1m5 0h1m-6 3h1"/></>,
    arrow: <><path d="M4 12h15m-6-6 6 6-6 6"/></>,
    chevron: <path d="m8 5 7 7-7 7"/>,
    ticket: <><path d="M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V6Z"/><path d="M15 7v2m0 2v2m0 2v2"/></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16"/>, close: <path d="m6 6 12 12M6 18 18 6"/>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
    bookmark: <path d="M6 3h12v18l-6-4-6 4Z"/>,
    check: <path d="m5 12 4 4L19 6"/>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{shapes[name]}</svg>
}
