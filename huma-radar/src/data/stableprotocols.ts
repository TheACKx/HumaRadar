import store from './stableprotocols.json'
import { datedChange, latestOf } from '../lib/derive'
import type { StableProtocol, StableProtocolRow, StableProtocolStore } from '../types'

/**
 * TVL and yield for the stablecoin products themselves, collected by
 * scripts/sources/stableprotocols.mjs from DefiLlama. Regenerate with
 * `npm run collect -- --only=stableprotocols`.
 */
const STORE = store as unknown as StableProtocolStore

/**
 * Brand colours, kept here rather than in the store for the same reason the
 * chain colours live in chains.ts: the collector writes data, the app decides
 * how it looks.
 */
const COLORS: Record<string, string> = {
  huma: '#C4A2F7',
  sky: '#FFC443',
  aave: '#B6509E',
  maple: '#FF7A45',
  ondo: '#4C7DFF',
  ethena: '#E879F9',
  spark: '#FB7185',
  hastra: '#7DD3FC',
  onre: '#34D8A0',
  reusd: '#22D3EE',
  reusde: '#67E8F9',
  usd3: '#A3E635',
  susd3: '#BEF264',
  cap: '#F472B6',
  avant: '#FBBF24',
  valos: '#8A92F5',
  fluid: '#3FA9F5',
  usdai: '#FDBA74',
  tori: '#F87171',
  yuzu: '#FDE047',
  ember: '#FB923C',
}

const FALLBACK_COLOR = '#8A7FA8'

function toRow(p: StableProtocol): StableProtocolRow {
  return {
    ...p,
    color: COLORS[p.id] ?? FALLBACK_COLOR,
    tvl: latestOf(p.history, (h) => h.tvl),
    apy: latestOf(p.history, (h) => h.apy),
    // yield moves are read in percentage points as well as relative percent,
    // so neither gets the money floor a dollar baseline needs
    apy7d: datedChange(p.history, (h) => h.apy, 7),
    apy30d: datedChange(p.history, (h) => h.apy, 30),
    tvl7d: datedChange(p.history, (h) => h.tvl, 7, { moneyFloor: true }),
    tvl30d: datedChange(p.history, (h) => h.tvl, 30, { moneyFloor: true }),
  }
}

/** Every tracked product, largest TVL first. */
export const STABLE_PROTOCOLS: StableProtocolRow[] = Object.values(STORE.protocols)
  .map(toRow)
  .sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))

export const STABLE_PROTOCOLS_GENERATED_AT: string | null = STORE.generatedAt

/** Newest date present in any product's history. */
export const STABLE_PROTOCOLS_LATEST_DATE: string | null =
  STABLE_PROTOCOLS.flatMap((r) => r.history.map((h) => h.date)).sort().pop() ?? null
