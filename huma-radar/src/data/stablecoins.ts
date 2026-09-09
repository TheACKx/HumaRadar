import store from './stablecoins.json'
import { seriesChange } from '../lib/derive'
import type { StableChain, StableRow, StableStore } from '../types'

/**
 * Stablecoin circulating supply per chain, collected by
 * scripts/sources/stablecoins.mjs from DefiLlama. Regenerate with
 * `npm run collect -- --only=stablecoins`.
 */
const STORE = store as unknown as StableStore

/**
 * Brand colours, kept here rather than in the store for the same reason chain
 * colours live in chains.ts: the collector writes data, the app decides how it
 * looks. Chains that also appear in the Networks list reuse their colour there.
 */
const COLORS: Record<string, string> = {
  all: '#C4A2F7',
  ethereum: '#8A92F5',
  solana: '#14F195',
  base: '#4C7DFF',
  xrpl: '#3FA9F5',
  plasma: '#B7F84A',
  robinhood: '#8FE04A',
  monad: '#A974F1',
  bsc: '#F0B90B',
  tempo: '#F2C14E',
  stellar: '#9BA9C7',
}

const FALLBACK_COLOR = '#8A7FA8'

/** The network-wide total is the headline, not a row beside the chains. */
export const ALL_CHAINS_ID = 'all'

function toRow(c: StableChain): StableRow {
  const latest = c.history.length ? c.history[c.history.length - 1] : null
  return {
    ...c,
    color: COLORS[c.id] ?? FALLBACK_COLOR,
    total: latest?.total ?? null,
    change7d: seriesChange(c.history, 7),
    change30d: seriesChange(c.history, 30),
  }
}

const ROWS: StableRow[] = Object.values(STORE.chains).map(toRow)

/** The network-wide total, or null if the collector has never reached it. */
export const STABLE_TOTAL: StableRow | null =
  ROWS.find((r) => r.id === ALL_CHAINS_ID) ?? null

/** Every tracked chain except the network total, biggest first. */
export const STABLE_CHAINS: StableRow[] = ROWS.filter((r) => r.id !== ALL_CHAINS_ID).sort(
  (a, b) => (b.total ?? 0) - (a.total ?? 0),
)

export const STABLE_GENERATED_AT: string | null = STORE.generatedAt

/** Newest date present in any chain's history. */
export const STABLE_LATEST_DATE: string | null =
  ROWS.flatMap((r) => r.history.map((h) => h.date)).sort().pop() ?? null
