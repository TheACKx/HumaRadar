import store from './topwallets.json'
import type { TopWallet, TopWalletStore } from '../types'

/**
 * The largest PST holders, collected by scripts/sources/topwallets.mjs.
 * Regenerate with `npm run collect -- --only=topwallets`.
 */
const STORE = store as unknown as TopWalletStore

/** Every tracked top wallet, largest Total PST Exposure first. */
export const TOP_WALLETS: TopWallet[] = Object.values(STORE.wallets).sort(
  (a, b) => (b.history[b.history.length - 1]?.exposure ?? 0) - (a.history[a.history.length - 1]?.exposure ?? 0),
)

export const TOP_WALLETS_GENERATED_AT: string | null = STORE.generatedAt
