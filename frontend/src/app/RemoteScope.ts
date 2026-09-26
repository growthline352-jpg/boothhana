export class RemoteScope {
  private live = false
  private sequence = 0
  activate() { this.live = true }
  deactivate() { this.live = false; this.sequence += 1 }
  begin(): number | null { return this.live ? ++this.sequence : null }
  accepts(ticket: number) { return this.live && this.sequence === ticket }
  isActive() { return this.live }
}
