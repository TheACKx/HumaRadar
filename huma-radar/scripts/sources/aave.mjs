/**
 * Aave v3 source — https://api.v3.aave.com/graphql
 *
 * The same API app.aave.com reads, so numbers match the app exactly.
 * Exposes 365 days of daily supply/borrow APY, but no history for
 * supplied/borrowed totals — those accumulate from the first run.
 *
 * Each chain's markets are fetched once and used for everything on it: that
 * chain's own reserves, plus any overlay reserve that lives there.
 */

import { makeClient, pct, upsert, usd } from '../lib/gql.mjs'
import { AAVE, CHAINS, OVERLAYS } from '../tracked.mjs'

const gql = makeClient('https://api.v3.aave.com/graphql', 'Aave API')

const MARKETS_QUERY = `
query Markets($ids: [ChainId!]!) {
  markets(request: { chainIds: $ids }) {
    name
    address
    reserves {
      underlyingToken { symbol name address decimals }
      size { usd }
      supplyInfo { apy { value } }
      borrowInfo {
        apy { value }
        total { usd }
        availableLiquidity { usd }
        utilizationRate { value }
        borrowingState
      }
    }
  }
}`

const APY_HISTORY_QUERY = `
query History($s: SupplyAPYHistoryRequest!, $b: BorrowAPYHistoryRequest!) {
  supplyAPYHistory(request: $s) { avgRate { value } date }
  borrowAPYHistory(request: $b) { avgRate { value } date }
}`

export async function collectAave({ store, today, backfill, log }) {
  let snapshots = 0
  let backfills = 0

  for (const chain of CHAINS) {
    const cfg = AAVE[chain.id]
    // [overlay, entry] pairs for every overlay reserve on this chain
    const overlayWants = OVERLAYS.flatMap((o) =>
      (o.aave ?? []).filter((a) => a.chainId === chain.chainId).map((a) => [o, a]),
    )
    if (!cfg && !overlayWants.length) continue

    const data = await gql(MARKETS_QUERY, { ids: [chain.chainId] })
    const fresh = []

    if (cfg) {
      const market = data.markets.find((m) => m.name === cfg.market)
      if (!market) {
        log(`  Aave   ${chain.name.padEnd(10)} SKIP — ${cfg.market} not returned`)
      } else {
        let found = 0
        for (const want of cfg.reserves) {
          const r = pickReserve(market, want)
          if (!r) {
            log(`  Aave   ${chain.name.padEnd(10)} !! ${want.symbol} not found`)
            continue
          }
          const label = want.as ?? want.symbol
          const written = writeReserve({
            store, today, market, reserve: r,
            chainKey: chain.id,
            chainId: chain.chainId,
            venue: cfg.market,
            name: label,
            symbol: label,
            id: `aave-${chain.chainId}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '')}`,
          })
          snapshots++
          found++
          fresh.push(written)
        }
        log(`  Aave   ${chain.name.padEnd(10)} ${found}/${cfg.reserves.length} reserves`)
      }
    }

    // --- overlays ----------------------------------------------------------
    for (const [overlay, want] of overlayWants) {
      const market = data.markets.find((m) => m.name === want.market)
      const r = market && pickReserve(market, want)
      if (!r) {
        log(`  Aave   ${overlay.label.padEnd(10)} !! ${want.name} on ${want.market} not found`)
        continue
      }
      const written = writeReserve({
        store, today, market, reserve: r,
        chainKey: overlay.id,
        chainId: want.chainId,
        venue: want.market,
        name: want.name,
        symbol: want.symbol,
        // distinct from the per-chain id so a cross-listed reserve appears twice
        id: `aave-${overlay.id}-${want.chainId}-${want.symbol.toLowerCase()}`,
      })
      snapshots++
      fresh.push(written)
      log(`  Aave   ${overlay.label.padEnd(10)} ${want.name.padEnd(8)} ${venueShort(want.market).padEnd(10)} ${fmt(r.size.usd)}`)
    }

    if (backfill) {
      for (const { entry, isNew, label } of fresh) {
        if (!isNew && entry.apyBackfilledAt) continue
        const n = await backfillApy(entry, today)
        if (n) {
          entry.apyBackfilledAt = new Date().toISOString()
          backfills++
          log(`         ${label.padEnd(24)} backfilled ${n} days of APY`)
        }
      }
    }
  }

  return { snapshots, backfills }
}

const fmt = (v) => '$' + (Number(v) / 1e6).toFixed(2) + 'M'
const venueShort = (v) => v.replace(/^AaveV3/, '')

/**
 * Resolve one configured reserve against a market's reserve list. An entry may
 * pin an address because the same symbol can appear twice (Arbitrum lists both
 * native USDC and bridged USDC.e); otherwise the deepest match by size wins.
 */
function pickReserve(market, want) {
  const matches = market.reserves.filter((r) =>
    want.address
      ? r.underlyingToken.address.toLowerCase() === want.address.toLowerCase()
      : r.underlyingToken.symbol === want.symbol,
  )
  if (!matches.length) return null
  return matches.sort((a, b) => Number(b.size.usd) - Number(a.size.usd))[0]
}

/** Upsert today's snapshot for one reserve. */
function writeReserve({
  store, today, market, reserve, chainKey, chainId, venue, name, symbol, id,
}) {
  const b = reserve.borrowInfo
  const borrowable = b?.borrowingState === 'ENABLED'

  const entry = (store.markets[id] ??= { id, history: [] })
  const isNew = entry.history.length === 0

  Object.assign(entry, {
    id,
    chain: chainKey,
    chainId,
    protocol: 'Aave v3',
    kind: 'reserve',
    name,
    symbol,
    venue,
    venueAddress: market.address,
    assetName: reserve.underlyingToken.name,
    assetAddress: reserve.underlyingToken.address,
    borrowable,
    url: 'https://app.aave.com/markets/',
  })

  upsert(entry.history, {
    date: today,
    tvl: usd(reserve.size.usd),
    borrowed: borrowable ? usd(b.total.usd) : null,
    available: borrowable ? usd(b.availableLiquidity.usd) : null,
    apy: pct(reserve.supplyInfo.apy.value),
    borrowApy: borrowable ? pct(b.apy.value) : null,
    utilization: borrowable ? pct(b.utilizationRate.value) : null,
  })

  return { entry, isNew, label: name }
}

/** Aave publishes daily APY averages but no historical totals. */
async function backfillApy(entry, today) {
  const req = {
    market: entry.venueAddress,
    underlyingToken: entry.assetAddress,
    chainId: entry.chainId,
    window: 'LAST_YEAR',
  }
  let data
  try {
    data = await gql(APY_HISTORY_QUERY, { s: req, b: req })
  } catch (err) {
    console.warn(`         backfill failed for ${entry.name}: ${err.message}`)
    return 0
  }

  const supply = new Map(data.supplyAPYHistory.map((p) => [p.date.slice(0, 10), pct(p.avgRate.value)]))
  const borrow = new Map(data.borrowAPYHistory.map((p) => [p.date.slice(0, 10), pct(p.avgRate.value)]))

  const dates = [...new Set([...supply.keys(), ...borrow.keys()])].sort()
  for (const date of dates) {
    if (date >= today) continue // today comes from the live snapshot
    upsert(entry.history, {
      date,
      tvl: null,
      borrowed: null,
      available: null,
      apy: supply.get(date) ?? null,
      borrowApy: entry.borrowable ? borrow.get(date) ?? null : null,
      utilization: null,
    })
  }
  return dates.length
}
