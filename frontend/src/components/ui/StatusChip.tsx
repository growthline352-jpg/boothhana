export function StatusChip({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'active' | 'warning' | 'danger' | 'muted' | 'info' }) {
  return <span className={`chip ${tone}`}>{children}</span>
}
