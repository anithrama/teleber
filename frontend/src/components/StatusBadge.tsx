export function StatusBadge({ status }: { status?: string | null }) {
  const label = status ? status.replaceAll('_', ' ') : 'Unknown'
  const tone = (status || 'unknown').toLowerCase().replaceAll('_', '-')
  return <span className={`status-badge status-badge--${tone}`}>{label}</span>
}