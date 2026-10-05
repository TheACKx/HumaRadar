import store from './tenure.json'
import type { TenurePoint, TenureStore, UnlockMonth } from '../types'

/**
 * PST lockups — Huma Prime's from its vault, the Huma dApp's from its locked
 * deposits — collected by scripts/sources/tenure.mjs.
 * Regenerate with `npm run collect -- --only=tenure`.
 */
const STORE = store as unknown as TenureStore

export const TENURE: TenurePoint[] = STORE.history
export const TENURE_GENERATED_AT: string | null = STORE.generatedAt
export const TENURE_DAPP_SINCE: string | null = STORE.dappSince ?? null

/** When locked PST unlocks, month by month, as of the latest collection. */
export const UNLOCKS: UnlockMonth[] = STORE.unlocks?.months ?? []
export const UNLOCKS_AS_OF: string | null = STORE.unlocks?.asOf ?? null
