import { useEffect, useRef, useState } from 'react'
import { SingleFlight } from './SingleFlight'

export function useSubmission() {
  const gate = useRef(new SingleFlight())
  const alive = useRef(true)
  const [pending, setPending] = useState(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  return {
    pending,
    begin() { if (!gate.current.begin()) return false; if (alive.current) setPending(true); return true },
    finish() { gate.current.finish(); if (alive.current) setPending(false) },
  }
}
