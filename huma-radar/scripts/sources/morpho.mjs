/**
 * Morpho source — https://api.morpho.org/graphql
 *
 * Morpho's own API, the one app.morpho.org reads. Unlike Aave it exposes daily
 * history for BOTH TVL and rates back to creation, so 7D / 30D changes are
 * correct from the very first run — for vaults and for Blue markets alike.
 *
 * Three things are collected here:
 *
 *   vaults        — curated deposit vaults, per chain. Handles Vault V1
 *                   (`vaultByAddress`, state nested under `state`) and Vault V2
 *                   (`vaultV2ByAddress`, fields hoisted onto the vault).
 *   overlay vaults  — the same shape, filed under an overlay pseudo-chain. A
 *                     vault may appear both here and under its own chain, on
 *                     purpose, so overlay ids carry the overlay name.
 *   overlay markets — Morpho Blue markets: an isolated collateral/loan pair
 *                     with a real borrow side, queried through `marketById`.
 */

import { dayOf, makeClient, pct, upsert, usd } from '../lib/gql.mjs'
import { CHAINS, MORPHO, OVERLAYS } from '../tracked.mjs'

const gql = makeClient('https://api.morpho.org/graphql', 'Morpho API')

const V2_QUERY = `
query V2($a: String!, $c: Int!, $o: TimeseriesOptions!) {
  vaultV2ByAddress(address: $a, chainId: $c) {
    address name symbol creationTimestamp
    asset { symbol name address }
    totalAssetsUsd netApy netApyExcludingRewards
    historicalState {
      totalAssetsUsd(options: $o) { x y }
      avgNetApy(options: $o, lookbackHours: 24) { x y }
    }
  }
}`

const V1_QUERY = `
query V1($a: String!, $c: Int!, $o: TimeseriesOptions!) {
  vaultByAddress(address: $a, chainId: $c) {
    address name symbol creationTimestamp
    asset { symbol name address }
    state { totalAssetsUsd netApy netApyExcludingRewards }
    historicalState {
      totalAssetsUsd(options: $o) { x y }
      netApy(options: $o) { x y }
    }
  }
}`

const MARKET_QUERY = `
query M($k: String!, $c: Int!, $o: TimeseriesOptions!) {
  marketById(marketId: $k, chainId: $c) {
    marketId lltv creationTimestamp
    loanAsset { symbol name address }
    collateralAsset { symbol name address }
    state {
      supplyApy borrowApy utilization
      supplyAssetsUsd borrowAssetsUsd liquidityAssetsUsd
    }
    historicalState {
      supplyAssetsUsd(options: $o) { x y }
      borrowAssetsUsd(options: $o) { x y }
      liquidityAssetsUsd(options: $o) { x y }
      supplyApy(options: $o) { x y }
      borrowApy(options: $o) { x y }
      utilization(options: $o) { x y }
    }
  }
}`

const YEAR = 365 * 86400

const windowOptions = () => {
  const now = Math.floor(Date.now() / 1000)
  return { startTimestamp: now - YEAR, endTimestamp: now, interval: 'DAY' }
}

export async function collectMorpho({ store, today, backfill, log }) {
  let snapshots = 0
  let backfills = 0
  const options = windowOptions()

  for (const chain of CHAINS) {
    const vaults = MORPHO[chain.id]
    if (!vaults?.length) continue

    let found = 0
    for (const want of vaults) {
      const done = await writeVault({
        store, today, backfill, log, options,
        want,
        chainKey: chain.id,
        chainId: chain.chainId,
        id: `morpho-${chain.chainId}-${want.address.toLowerCase()}`,
      })
      if (!done) {
        log(`  Morpho ${chain.name.padEnd(10)} !! ${want.name} not found`)
        continue
      }
      found++
      snapshots += done.snapshots
      backfills += done.backfills
    }
    log(`  Morpho ${chain.name.padEnd(10)} ${found}/${vaults.length} vaults`)
  }

  // --- overlays -------------------------------------------------------------

  for (const overlay of OVERLAYS) {
    const vaults = overlay.morphoVaults ?? []
    if (vaults.length) {
      let found = 0
      for (const want of vaults) {
        const done = await writeVault({
          store, today, backfill, log, options,
          want,
          chainKey: overlay.id,
          chainId: want.chainId,
          // distinct from the per-chain id so a cross-listed vault appears twice
          id: `morpho-${overlay.id}-${want.address.toLowerCase()}`,
        })
        if (!done) {
          log(`  Morpho ${overlay.label.padEnd(10)} !! ${want.name} not found`)
          continue
        }
        found++
        snapshots += done.snapshots
        backfills += done.backfills
      }
      log(`  Morpho ${overlay.label.padEnd(10)} ${found}/${vaults.length} vaults`)
    }

    const markets = overlay.morphoMarkets ?? []
    // the collateral side of each market, kept for the roll-up rows below
    const collected = []
    if (markets.length) {
      let found = 0
      for (const want of markets) {
        const done = await writeMarket({
          store, today, backfill, log, options, want, chainKey: overlay.id,
        })
        if (!done) {
          log(`  Morpho ${overlay.label.padEnd(10)} !! market ${want.name} not found`)
          continue
        }
        found++
        snapshots += done.snapshots
        backfills += done.backfills
        collected.push(done.collateral)
      }
      log(`  Morpho ${overlay.label.padEnd(10)} ${found}/${markets.length} markets`)
    }

    for (const want of overlay.morphoCollateral ?? []) {
      const done = writeCollateralTotal({ store, today, log, overlay, want, collected })
      if (done) snapshots += done.snapshots
    }
  }

  return { snapshots, backfills }
}

/** Fetch, upsert and optionally backfill one vault. Null when not found. */
async function writeVault({ store, today, backfill, log, options, want, chainKey, chainId, id }) {
  const vault = await fetchVault(want.address, chainId, options)
  if (!vault) return null

  const entry = (store.markets[id] ??= { id, history: [] })

  Object.assign(entry, {
    id,
    chain: chainKey,
    chainId,
    protocol: 'Morpho',
    kind: 'vault',
    // prefer the configured name; fall back to whatever the API reports
    name: want.name ?? vault.name,
    symbol: vault.asset.symbol,
    venue: `Morpho ${vault.version}`,
    venueAddress: vault.address,
    assetName: vault.asset.name,
    assetAddress: vault.asset.address,
    borrowable: false,
    // set when the vault belongs on its tab but is not what the tab totals
    notInTotal: want.notInTotal ? true : undefined,
    url: want.url,
  })

  upsert(entry.history, {
    date: today,
    tvl: usd(vault.totalAssetsUsd),
    borrowed: null,
    available: null,
    apy: pct(vault.netApy),
    borrowApy: null,
    utilization: null,
  })

  let backfills = 0
  if (backfill && !entry.backfilledAt) {
    const n = backfillVault(entry, vault, today)
    if (n) {
      entry.backfilledAt = new Date().toISOString()
      backfills = 1
      log(`         ${(want.name ?? vault.name).slice(0, 30).padEnd(32)} backfilled ${n} days of TVL + APY`)
    }
  }
  return { snapshots: 1, backfills }
}

/** Fetch, upsert and optionally backfill one Blue market. Null when not found. */
async function writeMarket({ store, today, backfill, log, options, want, chainKey }) {
  const data = await gql(MARKET_QUERY, { k: want.marketId, c: want.chainId, o: options }).catch(
    () => null,
  )
  const m = data?.marketById
  if (!m) return null

  const collateral = m.collateralAsset?.symbol ?? '?'
  const loan = m.loanAsset.symbol
  const id = `morpho-market-${chainKey}-${want.chainId}-${want.marketId.slice(2, 12)}`
  const entry = (store.markets[id] ??= { id, history: [] })

  Object.assign(entry, {
    id,
    chain: chainKey,
    chainId: want.chainId,
    protocol: 'Morpho',
    kind: 'market',
    name: want.name ?? `${collateral} / ${loan}`,
    symbol: loan,
    venue: want.network ? `Morpho Blue · ${want.network}` : 'Morpho Blue',
    venueAddress: m.marketId,
    assetName: m.loanAsset.name,
    assetAddress: m.loanAsset.address,
    borrowable: true,
    collateralSymbol: collateral,
    loanSymbol: loan,
    // lltv is 18-decimal fixed point: 860000000000000000 -> 86
    lltv: m.lltv != null ? Number(m.lltv) / 1e16 : undefined,
    url: want.url,
  })

  const s = m.state
  upsert(entry.history, {
    date: today,
    tvl: usd(s.supplyAssetsUsd),
    borrowed: usd(s.borrowAssetsUsd),
    available: usd(s.liquidityAssetsUsd),
    apy: pct(s.supplyApy),
    borrowApy: pct(s.borrowApy),
    utilization: pct(s.utilization),
  })

  let backfills = 0
  if (backfill && !entry.backfilledAt) {
    const n = backfillMarket(entry, m.historicalState, today)
    if (n) {
      entry.backfilledAt = new Date().toISOString()
      backfills = 1
      log(`         ${entry.name.slice(0, 30).padEnd(32)} backfilled ${n} days of market history`)
    }
  }

  // handed back so an overlay can total its markets under one collateral symbol
  const asset = m.collateralAsset
  return {
    snapshots: 1,
    backfills,
    collateral: asset
      ? {
          symbol: asset.symbol,
          assetName: asset.name,
          assetAddress: asset.address,
          chainId: want.chainId,
          now: s.supplyAssetsUsd,
          byDate: byDate(m.historicalState.supplyAssetsUsd, usd),
        }
      : null,
  }
}

/**
 * One roll-up row per collateral symbol, totalling the TVL of every Blue market
 * that takes it — so the PST row on Huma Related adds up the PST / PYUSD,
 * PST / USDC and PST / AUSD markets.
 *
 * That TVL is Morpho's supplied figure, which on Blue is the *loan* asset:
 * the PYUSD, USDC and AUSD sitting in those markets to be borrowed, not the
 * PST posted against it. The collateral side is available as
 * `collateralAssetsUsd` and reads higher — $53.10M against $45.44M when this
 * was written — but the TVL total is what the row is asked to report, so that
 * the number ties back to the market rows a reader can see beneath it.
 *
 * It is a roll-up either way: those markets are listed above it, so it is held
 * out of the header totals — see supersededRollups() in lib/derive.ts.
 *
 * Morpho publishes no rate for a total like this, so the APY column reads "—"
 * rather than a 0.00% that would look like a rate someone chose.
 */
function writeCollateralTotal({ store, today, log, overlay, want, collected }) {
  const mine = collected.filter((c) => c && c.symbol === want.symbol)
  if (!mine.length) {
    log(`  Morpho ${overlay.label.padEnd(10)} !! no ${want.symbol} collateral to total`)
    return null
  }

  const first = mine[0]
  const id = `morpho-collateral-${overlay.id}-${want.symbol.toLowerCase()}`
  const entry = (store.markets[id] ??= { id, history: [] })

  Object.assign(entry, {
    id,
    chain: overlay.id,
    chainId: first.chainId,
    protocol: 'Morpho',
    kind: 'reserve',
    name: want.name ?? want.symbol,
    symbol: want.symbol,
    venue: `Morpho Blue · ${mine.length} market${mine.length === 1 ? '' : 's'}`,
    venueAddress: first.assetAddress,
    assetName: first.assetName,
    assetAddress: first.assetAddress,
    borrowable: false,
    rollup: true,
    url: want.url,
  })

  // Every day is re-derived from the markets' own history on each run, so the
  // stored series is rebuilt rather than merged into — that way a change to
  // what this row measures cannot leave older days on the previous basis.
  entry.history = []

  // A market reports from the day it was created and reports zero while empty,
  // so a day missing from one market's series simply contributes nothing to
  // that day's total.
  const dates = [...new Set(mine.flatMap((c) => [...c.byDate.keys()]))].sort()
  for (const date of dates) {
    if (date >= today) continue
    upsert(entry.history, {
      date,
      tvl: usd(mine.reduce((a, c) => a + (c.byDate.get(date) ?? 0), 0)),
      borrowed: null,
      available: null,
      apy: null,
      borrowApy: null,
      utilization: null,
    })
  }

  const total = mine.reduce((a, c) => a + (c.now ?? 0), 0)
  upsert(entry.history, {
    date: today,
    tvl: usd(total),
    borrowed: null,
    available: null,
    apy: null,
    borrowApy: null,
    utilization: null,
  })

  log(
    `  Morpho ${overlay.label.padEnd(10)} ${want.symbol.padEnd(10)} markets total ` +
      `$${(total / 1e6).toFixed(2)}M across ${mine.length} market${mine.length === 1 ? '' : 's'}`,
  )
  return { snapshots: 1 }
}

/** Try V2 first, fall back to V1. Returns a normalised shape or null. */
async function fetchVault(address, chainId, options) {
  const v2 = await gql(V2_QUERY, { a: address, c: chainId, o: options }).catch(() => null)
  const b = v2?.vaultV2ByAddress
  if (b) {
    return {
      version: 'V2',
      address: b.address,
      name: b.name,
      asset: b.asset,
      totalAssetsUsd: b.totalAssetsUsd,
      netApy: b.netApy,
      tvlSeries: b.historicalState.totalAssetsUsd,
      apySeries: b.historicalState.avgNetApy,
    }
  }

  const v1 = await gql(V1_QUERY, { a: address, c: chainId, o: options }).catch(() => null)
  const a = v1?.vaultByAddress
  if (a) {
    return {
      version: 'V1',
      address: a.address,
      name: a.name,
      asset: a.asset,
      totalAssetsUsd: a.state?.totalAssetsUsd,
      netApy: a.state?.netApy,
      tvlSeries: a.historicalState.totalAssetsUsd,
      apySeries: a.historicalState.netApy,
    }
  }
  return null
}

/** Index a { x, y } series by UTC date so several series can be aligned. */
function byDate(series, map) {
  const out = new Map()
  for (const p of series ?? []) {
    if (p.y != null) out.set(dayOf(p.x), map(p.y))
  }
  return out
}

/**
 * Morpho returns one point per day. Both series are keyed by timestamp; align
 * them on the UTC date so a day carries TVL and APY together.
 */
function backfillVault(entry, vault, today) {
  const tvl = byDate(vault.tvlSeries, usd)
  const apy = byDate(vault.apySeries, pct)

  const dates = [...new Set([...tvl.keys(), ...apy.keys()])].sort()
  for (const date of dates) {
    if (date >= today) continue // today comes from the live snapshot
    upsert(entry.history, {
      date,
      tvl: tvl.get(date) ?? null,
      borrowed: null,
      available: null,
      apy: apy.get(date) ?? null,
      borrowApy: null,
      utilization: null,
    })
  }
  return dates.length
}

/** Blue markets publish every field daily, so a backfilled day is complete. */
function backfillMarket(entry, hist, today) {
  const tvl = byDate(hist.supplyAssetsUsd, usd)
  const borrowed = byDate(hist.borrowAssetsUsd, usd)
  const available = byDate(hist.liquidityAssetsUsd, usd)
  const apy = byDate(hist.supplyApy, pct)
  const borrowApy = byDate(hist.borrowApy, pct)
  const utilization = byDate(hist.utilization, pct)

  const dates = [...new Set([...tvl.keys(), ...apy.keys(), ...borrowApy.keys()])].sort()
  for (const date of dates) {
    if (date >= today) continue
    upsert(entry.history, {
      date,
      tvl: tvl.get(date) ?? null,
      borrowed: borrowed.get(date) ?? null,
      available: available.get(date) ?? null,
      apy: apy.get(date) ?? null,
      borrowApy: borrowApy.get(date) ?? null,
      utilization: utilization.get(date) ?? null,
    })
  }
  return dates.length
}
