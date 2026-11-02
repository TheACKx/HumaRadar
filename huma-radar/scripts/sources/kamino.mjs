/**
 * Kamino source — https://api.kamino.finance
 *
 * Kamino runs lending markets on Solana. One request returns metrics for every
 * reserve in a market, already denominated in USD, so a reserve is just a
 * lookup by its pubkey:
 *
 *   /kamino-market/<market>/reserves/metrics
 *
 * Most tracked reserves are collateral-only in practice — depositors are not
 * paid a supply APY and nothing is borrowed against them — so `apy` comes
 * through as 0 and the borrow columns stay empty rather than reporting a rate
 * nobody pays. A reserve that is genuinely lent out, like the USDC side of
 * Kamino's Huma market, fills those columns from the same fields.
 *
 * A reserve seen for the first time is backfilled from Kamino's daily history,
 *
 *   /kamino-market/<market>/reserves/<reserve>/metrics/history
 *
 * so a newly added market arrives with its series back to launch rather than
 * starting on the day it was added. Days before its first deposit are skipped.
 */

import { upsert } from '../lib/gql.mjs'
import { OVERLAYS, SOLANA_CHAIN_ID } from '../tracked.mjs'

const API = 'https://api.kamino.finance'

const num = (v) => (v == null ? null : Number(v))
const round = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v))
/** Kamino returns rates as fractions ("0.0597"); store percent at 4dp. */
const pct = (v) => (v == null ? null : Math.round(Number(v) * 100 * 10000) / 10000)

const cache = new Map()

async function marketReserves(market) {
  if (cache.has(market)) return cache.get(market)
  const res = await fetch(`${API}/kamino-market/${market}/reserves/metrics`, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Kamino API: HTTP ${res.status} for market ${market}`)
  const json = await res.json()
  cache.set(market, json)
  return json
}

/** The last year of a reserve's daily metrics, as history rows; days before it held $1,000 (launch dust) are dropped. */
async function reserveHistory(market, reserve, today) {
  const end = new Date(`${today}T23:59:59Z`)
  const start = new Date(end.getTime() - 365 * 86400e3)
  const res = await fetch(
    `${API}/kamino-market/${market}/reserves/${reserve}/metrics/history` +
      `?env=mainnet-beta&start=${start.toISOString()}&end=${end.toISOString()}&frequency=day`,
    { headers: { accept: 'application/json' } },
  )
  if (!res.ok) throw new Error(`Kamino API: HTTP ${res.status} for reserve history ${reserve}`)
  const json = await res.json()

  const rows = []
  for (const h of json.history ?? []) {
    const m = h.metrics ?? {}
    const supplied = num(m.depositTvl)
    const borrowed = num(m.borrowTvl)
    if (!rows.length && !(supplied >= 1000)) continue // not launched yet
    const anyBorrowed = (borrowed ?? 0) > 0
    rows.push({
      date: h.timestamp.slice(0, 10),
      tvl: round(supplied),
      borrowed: anyBorrowed ? round(borrowed) : null,
      available: anyBorrowed ? round(supplied - borrowed) : null,
      apy: pct(m.supplyInterestAPY),
      borrowApy: anyBorrowed ? pct(m.borrowInterestAPY) : null,
      utilization: anyBorrowed && supplied ? (borrowed / supplied) * 100 : null,
    })
  }
  return rows
}

export async function collectKamino({ store, today, log }) {
  let snapshots = 0
  let backfills = 0

  const wants = OVERLAYS.flatMap((o) => (o.kamino ?? []).map((k) => [o, k]))

  for (const [overlay, want] of wants) {
    let reserves
    try {
      reserves = await marketReserves(want.market)
    } catch (err) {
      log(`  Kamino ${overlay.label.padEnd(7)} ${want.name.padEnd(10)} !! ${err.message}`)
      continue
    }

    const r = reserves.find((x) => x.reserve === want.reserve)
    if (!r) {
      log(`  Kamino ${overlay.label.padEnd(7)} ${want.name.padEnd(10)} !! reserve not in market`)
      continue
    }

    // totalSupplyUsd / totalBorrowUsd are already USD; the bare totals are
    // token units, which for a stable-backed syrup token are near enough the
    // same but not guaranteed to be
    const supplied = num(r.totalSupplyUsd) ?? num(r.totalSupply)
    const borrowed = num(r.totalBorrowUsd) ?? num(r.totalBorrow)
    const anyBorrowed = (borrowed ?? 0) > 0

    const id = `kamino-${want.reserve.slice(0, 10).toLowerCase()}`
    const isNew = !store.markets[id]?.history?.length
    const entry = (store.markets[id] ??= { id, history: [] })

    if (isNew) {
      try {
        const past = (await reserveHistory(want.market, want.reserve, today)).filter((row) => row.date < today)
        for (const row of past) upsert(entry.history, row)
        backfills += past.length
        log(`  Kamino ${overlay.label.padEnd(7)} ${(want.name ?? r.liquidityToken).padEnd(10)} backfilled ${past.length} days`)
      } catch (err) {
        log(`  Kamino ${overlay.label.padEnd(7)} ${(want.name ?? r.liquidityToken).padEnd(10)} !! backfill: ${err.message}`)
      }
    }

    Object.assign(entry, {
      id,
      chain: overlay.id,
      chainId: SOLANA_CHAIN_ID,
      protocol: 'Kamino',
      kind: 'reserve',
      name: want.name ?? r.liquidityToken,
      symbol: r.liquidityToken,
      venue: want.venue ?? 'Kamino Lend',
      venueAddress: r.reserve,
      assetName: r.liquidityToken,
      assetAddress: r.liquidityTokenMint,
      borrowable: anyBorrowed,
      ratesAreApr: false,
      // set when the row belongs on its tab but is not what the tab totals
      notInTotal: want.notInTotal ? true : undefined,
      url: want.url,
    })

    upsert(entry.history, {
      date: today,
      tvl: round(supplied),
      borrowed: anyBorrowed ? round(borrowed) : null,
      available: anyBorrowed ? round(supplied - borrowed) : null,
      apy: pct(r.supplyApy),
      borrowApy: anyBorrowed ? pct(r.borrowApy) : null,
      utilization: anyBorrowed && supplied ? (borrowed / supplied) * 100 : null,
    })
    snapshots++
    log(
      `  Kamino ${overlay.label.padEnd(7)} ${(want.name ?? r.liquidityToken).padEnd(10)}` +
        ` supplied $${(supplied / 1e6).toFixed(2)}M` +
        (anyBorrowed ? ` · borrow ${(pct(r.borrowApy) ?? 0).toFixed(2)}% APY` : ''),
    )
  }

  return { snapshots, backfills }
}
