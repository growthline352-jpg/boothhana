export class SingleFlight {
  private busy = false
  begin() { if (this.busy) return false; this.busy = true; return true }
  finish() { this.busy = false }
}
