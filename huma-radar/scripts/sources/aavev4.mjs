/**
 * Aave v4 source — https://api.aave.com/graphql
 *
 * v4 is not v3 with a new version number. Liquidity lives in hubs, and each
 * market — a "spoke" — draws on one; Aave Pro labels a reserve "Main on Core"
 * for the Main spoke on the Core hub. It is also served by a different API from
 * v3 (api.aave.com rather than api.v3.aave.com), so it gets its own source.
 *
 * Reserves are addressed by the id Aave Pro puts in its reserve URLs, which is
 * exactly what the API's `reserve` query takes (see AAVE_V4 in ../tracked.mjs).
 *
 * Like v3, the API publishes rate history but not supplied/borrowed history, so
 * a new row backfills APY only; its TVL history starts the day it is collected.
 */

import { AAVE_V4, CHAINS } from '../tracked.mjs'
import { makeClient, pct, upsert, usd } from '../lib/gql.mjs'

const gql = makeClient('https://api.aave.com/graphql', 'Aave v4 API')

const RESERVE_QUERY = `
query Reserve($id: ReserveId!) {
  reserve(request: { query: { reserveId: $id } }) {
    id
    canBorrow
    chain { chainId }
    spoke { name address }
    asset {
      hub { name }
      underlying { address info { symbol name } }
    }
    summary {
      supplied { exchange { value } }
      borrowed { exchange { value } }
      supplyApy { value }
      borrowApy { value }
    }
  }
}`

// LAST_MONTH comes back in six-hour samples; ALL only in weekly averages, which
// would be wrong to write as daily points
const HISTORY_QUERY = `
query History($id: ReserveId!) {
  supply: supplyApyHistory(request: { reserve: $id, window: LAST_MONTH }) { date avgRate { value } }
  borrow: borrowApyHistory(request: { reserve: $id, window: LAST_MONTH }) { date avgRate { value } }
}`

const fmt = (v) => `$${(Number(v) / 1e6).toFixed(1)}M`.padStart(10)

export async function collectAaveV4({ store, today, backfill, log }) {
  let snapshots = 0
  let backfills = 0

  for (const chain of CHAINS) {
    const wants = AAVE_V4[chain.id]
    if (!wants?.length) continue

    for (const want of wants) {
      let r
      try {
        r = (await gql(RESERVE_QUERY, { id: want.reserveId })).reserve
      } catch (err) {
        log(`  Aave v4 ${chain.name.padEnd(9)} !! ${want.name}: ${err.message}`)
        continue
      }
      if (!r) {
        log(`  Aave v4 ${chain.name.padEnd(9)} !! ${want.name} not found`)
        continue
      }

      const { entry, isNew } = writeReserve({ store, today, chain, want, reserve: r })
      snapshots++
      log(`  Aave v4 ${chain.name.padEnd(9)} ${want.name.padEnd(8)} ${entry.venue.padEnd(14)} ${fmt(r.summary.supplied.exchange.value)}`)

      if (backfill && (isNew || !entry.apyBackfilledAt)) {
        const n = await backfillApy(entry, want.reserveId, today)
        if (n) {
          entry.apyBackfilledAt = new Date().toISOString()
          backfills++
          log(`          ${want.name.padEnd(24)} backfilled ${n} days of APY`)
        }
      }
    }
  }

  return { snapshots, backfills }
}

function writeReserve({ store, today, chain, want, reserve }) {
  const s = reserve.summary
  const supplied = Number(s.supplied.exchange.value)
  const borrowed = Number(s.borrowed.exchange.value)
  const borrowable = reserve.canBorrow !== false

  const id = `aavev4-${chain.chainId}-${reserve.spoke.address.toLowerCase()}-${want.name.toLowerCase()}`
  const entry = (store.markets[id] ??= { id, history: [] })
  const isNew = entry.history.length === 0

  Object.assign(entry, {
    id,
    chain: chain.id,
    chainId: chain.chainId,
    protocol: 'Aave v4',
    kind: 'reserve',
    name: want.name,
    symbol: reserve.asset.underlying.info.symbol,
    // Aave Pro's own wording: the spoke, on the hub it draws from
    venue: `${reserve.spoke.name} on ${reserve.asset.hub.name}`,
    venueAddress: reserve.spoke.address,
    assetName: reserve.asset.underlying.info.name,
    assetAddress: reserve.asset.underlying.address,
    borrowable,
    url: `https://pro.aave.com/explore/reserve/${want.reserveId}`,
  })

  upsert(entry.history, {
    date: today,
    tvl: usd(supplied),
    borrowed: borrowable ? usd(borrowed) : null,
    available: borrowable ? usd(supplied - borrowed) : null,
    apy: pct(s.supplyApy.value),
    borrowApy: borrowable ? pct(s.borrowApy.value) : null,
    utilization: borrowable && supplied > 0 ? Math.round((borrowed / supplied) * 100 * 10000) / 10000 : null,
  })

  return { entry, isNew }
}

/**
 * Daily means of the six-hour samples. A market's history can open with days
 * before it went live, all reading 0%; those are trimmed rather than drawn as
 * a flat line, since a rate of nothing on a market that did not exist yet is
 * not a measurement.
 */
async function backfillApy(entry, reserveId, today) {
  let data
  try {
    data = await gql(HISTORY_QUERY, { id: reserveId })
  } catch (err) {
    console.warn(`          backfill failed for ${entry.name}: ${err.message}`)
    return 0
  }

  const daily = (samples) => {
    const days = new Map()
    for (const p of samples) {
      const d = p.date.slice(0, 10)
      const list = days.get(d) ?? []
      list.push(Number(p.avgRate.value))
      days.set(d, list)
    }
    return new Map([...days].map(([d, v]) => [d, pct(v.reduce((a, b) => a + b, 0) / v.length)]))
  }
  const supply = daily(data.supply)
  const borrow = daily(data.borrow)

  const dates = [...new Set([...supply.keys(), ...borrow.keys()])].sort()
  const firstLive = dates.findIndex((d) => (supply.get(d) ?? 0) > 0 || (borrow.get(d) ?? 0) > 0)
  if (firstLive === -1) return 0

  let n = 0
  for (const date of dates.slice(firstLive)) {
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
    n++
  }
  return n
}
