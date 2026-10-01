let owners = 0, previousOverflow = ''

/** Modal owners release only their own lock; closing one must not unlock another. */
export function acquireBodyScrollLock(): () => void {
  if (!owners) previousOverflow = document.body.style.overflow
  owners++
  document.body.style.overflow = 'hidden'
  let released = false
  return () => {
    if (released) return
    released = true
    if (--owners === 0) document.body.style.overflow = previousOverflow
  }
}
