export function formatUsd(n: number | null, opts: { compact?: boolean } = {}): string {
  if (n === null || !Number.isFinite(n)) return '—'
  const { compact = true } = opts
  if (!compact) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  const abs = Math.abs(n)
  if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B'
  if (abs >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (abs >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'
  return '$' + n.toFixed(0)
}

/**
 * A dollar move with its direction — "+$1.03B", "−$158.23M". A change of
 * nothing is left unsigned, since neither sign would be true of it.
 */
export function formatUsdSigned(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—'
  if (n === 0) return formatUsd(0)
  return (n > 0 ? '+' : '−') + formatUsd(Math.abs(n))
}

export function formatPct(n: number | null, digits = 2): string {
  if (n === null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits) + '%'
}

export function formatSigned(n: number | null, suffix: string, digits = 2): string {
  if (n === null || !Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return sign + n.toFixed(digits) + suffix
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** "3 hours ago" style stamp for the collector's last run. */
export function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  const mins = Math.round((Date.now() - then) / 60000)
  if (!Number.isFinite(mins)) return '—'
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

/** Tone class for a delta value; null and ~0 read as neutral. */
export function toneOf(n: number | null): 'up' | 'down' | 'flat' {
  if (n === null || !Number.isFinite(n) || Math.abs(n) < 0.005) return 'flat'
  return n > 0 ? 'up' : 'down'
}
