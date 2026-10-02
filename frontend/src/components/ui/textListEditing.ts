export function parseTextList(draft: string): string[] {
  return [...new Set(draft.split('\n').map(value => value.trim()).filter(Boolean))]
}

/** Keep in-progress spaces/newlines; replace the draft only for an external value change. */
export function syncTextListDraft(draft: string, value: string[]): string {
  return JSON.stringify(parseTextList(draft)) === JSON.stringify(value) ? draft : value.join('\n')
}
