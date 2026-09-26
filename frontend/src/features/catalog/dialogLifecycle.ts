/** Native dialogs supply keyboard containment and an inert background.
 * Multiple consumers (e.g. a note editor containing a QR dialog) may unmount in
 * either order. Only the last registered modal releases the page scroll lock.
 */
type Entry = { dialog: HTMLDialogElement; initial: HTMLElement | null; trigger: HTMLElement | null; users: number }
type DialogStack = { entries: Entry[]; overflow: string }
const stacks = new WeakMap<Document, DialogStack>()

export function openCatalogDialog(dialog: HTMLDialogElement, initial: HTMLElement | null, trigger: HTMLElement | null) {
  const doc = dialog.ownerDocument || document
  if (!dialog.open) dialog.showModal() // A failed open must not alter the lock.
  const stack: DialogStack = stacks.get(doc) ?? { entries: [], overflow: doc.body.style.overflow }
  stacks.set(doc, stack)
  const existing = stack.entries.find(item => item.dialog === dialog)
  const entry: Entry = existing ?? { dialog, initial, trigger, users: 1 }
  if (existing) entry.users++
  else stack.entries.push(entry)
  doc.body.style.overflow = 'hidden'
  if (stack.entries.at(-1) === entry) initial?.focus({ preventScroll: true })
  let released = false
  return () => {
    if (released) return
    released = true
    if (--entry.users > 0) return
    const wasTop = stack.entries.at(-1) === entry
    stack.entries = stack.entries.filter(item => item !== entry)
    if (dialog.open) dialog.close()
    const remaining = stack.entries.at(-1)
    if (!remaining) {
      doc.body.style.overflow = stack.overflow
      stacks.delete(doc)
    }
    if (!wasTop) return
    // Never focus a removed/closed parent or anything underneath another modal.
    const triggerDialog = trigger?.closest?.('dialog') as HTMLDialogElement | null | undefined
    if (trigger?.isConnected && (!triggerDialog || triggerDialog.open)
        && (!remaining || remaining.dialog.contains(trigger))) {
      trigger.focus({ preventScroll: true })
    } else if (remaining) {
      (remaining.initial?.isConnected ? remaining.initial : remaining.dialog).focus({ preventScroll: true })
    } else {
      doc.querySelector<HTMLElement>('#public-main')?.focus({ preventScroll: true })
    }
  }
}
