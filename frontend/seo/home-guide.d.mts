export const homeGuide: {
  summary: string; title: string; intro: string; usageTitle: string; usage: string; notice: string; categoriesTitle: string
  categories: { key: string; label: string; description: string; href: string; directoryHref: string }[]
  aboutHref: string; aboutLabel: string
}
export function renderHomeGuide(): string
