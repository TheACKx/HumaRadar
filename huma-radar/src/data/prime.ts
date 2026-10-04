import store from './prime.json'
import type { PrimeStore, PrimeWallet } from '../types'

/**
 * Huma Prime wallets, collected by scripts/sources/prime.mjs.
 * Regenerate with `npm run collect -- --only=prime`.
 */
const STORE = store as unknown as PrimeStore

/** Every tracked Prime wallet, in the order scripts/tracked.mjs lists them. */
export const PRIME_WALLETS: PrimeWallet[] = Object.values(STORE.wallets)

export const PRIME_GENERATED_AT: string | null = STORE.generatedAt

/** First day any Prime wallet was recorded — the series starts here. */
export const PRIME_SINCE: string | null =
  PRIME_WALLETS.flatMap((w) => w.history.map((h) => h.date)).sort()[0] ?? null
