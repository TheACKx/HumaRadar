import store from './curators.json'
import { seriesChange } from '../lib/derive'
import type { Curator, CuratorRow, CuratorStore } from '../types'

/**
 * Risk curators' TVL, collected by scripts/sources/curators.mjs from DefiLlama.
 * Regenerate with `npm run collect -- --only=curators`.
 */
const STORE = store as unknown as CuratorStore

/** Colours, kept here rather than in the store: the collector writes data, the app decides how it looks. */
const COLORS: Record<string, string> = {
  sentora: '#8B7CF6',
  gauntlet: '#F5A524',
  k3: '#34D8A0',
  rockawayx: '#FF6B6B',
  clearstar: '#3FA9F5',
  armitage: '#E879F9',
  galaxy: '#FDE047',
  bitwise: '#60A5FA',
  steakhouse: '#FB7185',
}

const FALLBACK_COLOR = '#8A7FA8'

function toRow(c: Curator): CuratorRow {
  const latest = c.history.length ? c.history[c.history.length - 1] : null
  return {
    ...c,
    color: COLORS[c.id] ?? FALLBACK_COLOR,
    total: latest?.total ?? null,
    change7d: seriesChange(c.history, 7),
    change30d: seriesChange(c.history, 30),
    // a curator DefiLlama has tracked for under a year reads "—" here
    change365d: seriesChange(c.history, 365),
  }
}

/** Every tracked curator, largest TVL first. */
export const CURATORS: CuratorRow[] = Object.values(STORE.curators)
  .map(toRow)
  .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))

export const CURATORS_GENERATED_AT: string | null = STORE.generatedAt

/** Newest date present in any curator's history. */
export const CURATORS_LATEST_DATE: string | null =
  CURATORS.flatMap((r) => r.history.map((h) => h.date)).sort().pop() ?? null
