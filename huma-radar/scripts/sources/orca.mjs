/**
 * Orca source — https://api.orca.so/v2/solana/pools/<address>
 *
 * Orca's own API, the one orca.so reads. A Whirlpool is a concentrated-liquidity
 * AMM pool rather than a lending venue, so there is no borrow side: `tvlUsdc`
 * is both sides of the pair priced in USD, and the only yield is trading fees.
 *
 * `stats.<window>.yieldOverTvl` is the fee yield **over that whole window**,
 * not per day — the 30-day figure divided by the pool's TVL reproduces
 * `stats.30d.fees` — so annualising means scaling by 365/days. The 30-day
 * window is used because a pool this quiet swings wildly over 24 hours: on the
 * day this was written 24h read 0.0008% annualised against 30d's 0.10%.
 *
 * Filed under `kind: 'pool'`, so the table labels it a Pool rather than a
 * lending venue and shows the Whirlpool's fee tier in the venue column.
 *
 * No historical endpoint, so the series builds from the first collector run.
 */

import { upsert } from '../lib/gql.mjs'
import { OVERLAYS, SOLANA_CHAIN_ID } from '../tracked.mjs'

const API = 'https://api.orca.so/v2/solana/pools'

const round = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v))
/** Percent at 4dp, the precision the app renders rates at. */
const rate = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1e4) / 1e4)

/** Days each stats window covers, for annualising its fee yield. */
const WINDOW_DAYS = { '24h': 1, '7d': 7, '30d': 30 }

/** Annualised trading-fee yield, as a percent. */
function feeApy(stats, window = '30d') {
  const y = Number(stats?.[window]?.yieldOverTvl)
  if (!Number.isFinite(y)) return null
  return rate(y * (365 / WINDOW_DAYS[window]) * 100)
}

async function fetchPool(address) {
  const res = await fetch(`${API}/${address}`, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`Orca API: HTTP ${res.status} for pool ${address}`)
  const json = await res.json()
  const pool = json?.data
  if (!pool) throw new Error(`Orca API: no pool data for ${address}`)
  return pool
}

export async function collectOrca({ store, today, log }) {
  let snapshots = 0

  const wants = OVERLAYS.flatMap((o) => (o.orca ?? []).map((p) => [o, p]))

  for (const [overlay, want] of wants) {
    let pool
    try {
      pool = await fetchPool(want.address)
    } catch (err) {
      log(`  Orca   ${overlay.label.padEnd(7)} ${(want.name ?? want.address).padEnd(14)} !! ${err.message}`)
      continue
    }

    const a = pool.tokenA
    const b = pool.tokenB
    const name = want.name ?? `${a.symbol} / ${b.symbol}`
    const tvl = Number(pool.tvlUsdc)
    const apy = feeApy(pool.stats)

    const id = `orca-${want.address.slice(0, 10).toLowerCase()}`
    const entry = (store.markets[id] ??= { id, history: [] })

    Object.assign(entry, {
      id,
      chain: overlay.id,
      chainId: SOLANA_CHAIN_ID,
      protocol: 'Orca',
      kind: 'pool',
      name,
      symbol: a.symbol,
      venue: `Orca Whirlpool · ${(pool.feeRate / 1e4).toFixed(2)}% fee`,
      venueAddress: pool.address,
      assetName: `${a.name} / ${b.name}`,
      assetAddress: a.address,
      borrowable: false,
      notInTotal: want.notInTotal ? true : undefined,
      url: want.url,
    })

    upsert(entry.history, {
      date: today,
      tvl: round(tvl),
      borrowed: null,
      available: null,
      apy,
      borrowApy: null,
      utilization: null,
    })
    snapshots++
    log(
      `  Orca   ${overlay.label.padEnd(7)} ${name.padEnd(14)} tvl $${(tvl / 1e6).toFixed(2)}M` +
        ` · fees ${(apy ?? 0).toFixed(2)}% APY (30d)`,
    )
  }

  return { snapshots, backfills: 0 }
}
