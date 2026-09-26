export interface MemoryDraft { id: string; revision: number; note: string; day: string; hall: string }
/** Private, in-memory only. Suspend on identity lookup; discard on a confirmed account switch. */
export class MemoryDrafts {
  private owner = ''
  private value: MemoryDraft | null = null
  bind(owner: string) {
    if (owner !== 'guest' && !owner.startsWith('member:')) return
    if (owner !== this.owner) { this.owner = owner; this.value = null }
  }
  read(owner: string, id: string, revision: number): MemoryDraft | undefined {
    return owner === this.owner && this.value?.id === id && this.value.revision === revision ? { ...this.value } : undefined
  }
  put(owner: string, value: MemoryDraft) { if (owner === this.owner) this.value = { ...value } }
  clear(owner: string) { if (owner === this.owner) this.value = null }
}
