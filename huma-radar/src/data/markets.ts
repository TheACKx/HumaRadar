import store from './snapshots.json'
import type { Market, Protocol, SnapshotStore } from '../types'

/**
 * Display order for the protocol filter tabs, fixed so the strip does not
 * reshuffle as you move between chains. A protocol absent from the current
 * selection is simply left out.
 */
export const PROTOCOL_ORDER: Protocol[] = [
  'Aave v3', 'Morpho', 'Fluid', 'JupLend', 'Kamino', 'Orca', 'Combined',
]

/**
 * Live data, collected by scripts/collect.mjs from Aave's v3 API and Morpho's
 * API. Regenerate with `npm run collect`.
 */
const STORE = store as unknown as SnapshotStore

export const MARKETS: Market[] = Object.values(STORE.markets).sort(
  (a, b) =>
    a.chain.localeCompare(b.chain) ||
    a.protocol.localeCompare(b.protocol) ||
    a.name.localeCompare(b.name),
)

export const GENERATED_AT: string | null = STORE.generatedAt

/** Newest date present in any market's history. */
export const LATEST_DATE: string | null =
  MARKETS.flatMap((m) => m.history.map((h) => h.date)).sort().pop() ?? null

/** Human label for a venue: "AaveV3Ethereum" -> "Core Market". */
export function venueLabel(venue: string): string {
  if (venue === 'AaveV3Ethereum') return 'Core Market'
  if (venue.startsWith('AaveV3')) return venue.replace(/^AaveV3/, '') + ' Market'
  return venue
}
