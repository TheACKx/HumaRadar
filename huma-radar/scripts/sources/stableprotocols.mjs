/**
 * Stablecoin protocol source — TVL and yield for the products themselves.
 *
 * Reads DefiLlama through whichever of its two shapes an entry is quoting, as
 * described on STABLECOIN_PROTOCOLS in ../tracked.mjs:
 *
 *   yields.llama.fi/chart/<pool>   — TVL and APY together, one product
 *   api.llama.fi/protocol/<slug>   — protocol-wide TVL, no yield
 *   yields.llama.fi/pools          — every pool's current state, used to find
 *                                    which pools a protocol entry's median APY
 *                                    should be taken across
 *
 * Like the supply overlook this replaces rather than appends: DefiLlama serves
 * the whole daily history, so each run rewrites the series, trimmed to the last
 * HISTORY_DAYS days. An entry that fails keeps the series it already had.
 *
 * Both fields are nullable per day and are filled independently — a protocol
 * entry has TVL from its first day but no yield until its pools appear in the
 * yields index, and Huma has no yield at all.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STABLECOIN_PROTOCOLS } from '../tracked.mjs'
import { stringifyStore } from '../lib/gql.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const STORE = resolve(HERE, '../../src/data/stableprotocols.json')

const YIELDS = 'https://yields.llama.fi'
const PROTOCOLS = 'https://api.llama.fi/protocol'

/** Matches the supply overlook — enough for the drawer's 1Y range. */
const HISTORY_DAYS = 400

const round = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)))
/** APYs are stored at 4dp, the precision the app renders them at. */
const rate = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 1e4) / 1e4)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * A protocol entry fans out into one request per pool it takes the median
 * across, so a full run is a few dozen calls in a row. DefiLlama answers 429 to
 * a burst of those, so requests are spaced and a rate-limited one waits much
 * longer than a merely failed one.
 */
const GAP_MS = 400
let lastCall = 0

async function fetchJson(url, attempt = 1) {
  const since = Date.now() - lastCall
  if (since < GAP_MS) await sleep(GAP_MS - since)
  lastCall = Date.now()

  let limited = false
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } })
    if (!res.ok) {
      limited = res.status === 429
      throw new Error(`HTTP ${res.status}`)
    }
    return await res.json()
  } catch (err) {
    if (attempt >= 5) throw new Error(`DefiLlama: ${err.message}`)
    const wait = limited ? 3000 * attempt : 500 * 2 ** attempt
    console.warn(`    retry ${attempt} in ${wait}ms (${err.message})`)
    await sleep(wait)
    return fetchJson(url, attempt + 1)
  }
}

const dayOfUnix = (s) => new Date(Number(s) * 1000).toISOString().slice(0, 10)

/**
 * Latest reading per UTC day. Both endpoints emit an extra intraday point for
 * today on top of the daily one, so without this the current day would appear
 * twice and the newest value could lose to the stale one.
 */
function byDay(points) {
  const days = new Map()
  for (const p of points) if (p.date) days.set(p.date, p)
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
}

const median = (vals) => {
  if (!vals.length) return null
  const s = [...vals].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** One yields pool: TVL and APY on the same days. */
async function poolSeries(poolId) {
  const json = await fetchJson(`${YIELDS}/chart/${poolId}`)
  const data = Array.isArray(json?.data) ? json.data : []
  return byDay(
    data.map((p) => ({
      date: String(p.timestamp ?? '').slice(0, 10),
      tvl: round(p.tvlUsd),
      apy: rate(p.apy),
    })),
  )
}

/** Protocol-wide TVL, as the protocol page's headline chart reports it. */
async function protocolTvl(slug) {
  const json = await fetchJson(`${PROTOCOLS}/${slug}`)
  const tvl = Array.isArray(json?.tvl) ? json.tvl : []
  return byDay(
    tvl.map((p) => ({ date: dayOfUnix(p.date), tvl: round(p.totalLiquidityUSD), apy: null })),
  )
}

/**
 * Median APY per day across a project's pools for one ticker — the figure the
 * protocol page's "median APY" toggle draws. A pool that has not published a
 * given day simply does not vote on it.
 */
async function medianApyByDate(pools, log, label) {
  const perDate = new Map()

  for (const p of pools) {
    let series
    try {
      series = await poolSeries(p.pool)
    } catch (err) {
      log(`  Yields  ${label.padEnd(18)} !! pool ${p.pool}: ${err.message}`)
      continue
    }
    for (const point of series) {
      if (point.apy === null) continue
      if (!perDate.has(point.date)) perDate.set(point.date, [])
      perDate.get(point.date).push(point.apy)
    }
  }

  return new Map([...perDate].map(([date, vals]) => [date, rate(median(vals))]))
}

/** Merge a TVL series with a separately sourced APY series, on date. */
function join(tvlSeries, apyByDate) {
  const dates = new Set([...tvlSeries.map((p) => p.date), ...apyByDate.keys()])
  const tvlByDate = new Map(tvlSeries.map((p) => [p.date, p.tvl]))
  return [...dates]
    .sort()
    .map((date) => ({ date, tvl: tvlByDate.get(date) ?? null, apy: apyByDate.get(date) ?? null }))
}

/** The store as it stands, so an entry that fails today keeps yesterday's series. */
function loadStore() {
  try {
    return JSON.parse(readFileSync(STORE, 'utf8'))
  } catch {
    return { source: 'defillama', generatedAt: null, protocols: {} }
  }
}

let poolIndex = null

/** yields.llama.fi/pools, fetched once and shared by every protocol entry. */
async function pools(log) {
  if (poolIndex !== null) return poolIndex
  try {
    const json = await fetchJson(`${YIELDS}/pools`)
    poolIndex = Array.isArray(json?.data) ? json.data : []
  } catch (err) {
    log(`  Yields  !! pool index unavailable: ${err.message}`)
    poolIndex = []
  }
  return poolIndex
}

export async function collectStableProtocols({ log }) {
  const store = loadStore()
  store.protocols ??= {}
  let collected = 0
  let days = 0

  for (const want of STABLECOIN_PROTOCOLS) {
    const label = `${want.name} ${want.ticker}`
    let history = []
    let venue = null

    try {
      if (want.pool) {
        history = await poolSeries(want.pool)
        const hit = (await pools(log)).find((p) => p.pool === want.pool)
        venue = hit ? `${hit.project} · ${hit.chain}` : 'DefiLlama pool'
      } else {
        const tvl = await protocolTvl(want.protocol)
        const matched = want.yieldsProject
          ? (await pools(log)).filter(
              (p) =>
                p.project === want.yieldsProject &&
                String(p.symbol).toUpperCase() === want.yieldsSymbol.toUpperCase(),
            )
          : []
        const apy = matched.length ? await medianApyByDate(matched, log, label) : new Map()
        history = join(tvl, apy)
        venue = matched.length
          ? `${want.protocol} · median of ${matched.length} pool${matched.length === 1 ? '' : 's'}`
          : `${want.protocol} · TVL only`
      }
    } catch (err) {
      log(`  Yields  ${label.padEnd(18)} !! ${err.message}`)
      continue
    }

    history = history.slice(-HISTORY_DAYS)
    if (!history.length) {
      log(`  Yields  ${label.padEnd(18)} !! no usable days returned`)
      continue
    }

    store.protocols[want.id] = {
      id: want.id,
      name: want.name,
      ticker: want.ticker,
      /** which of DefiLlama's two shapes this row is quoting */
      kind: want.pool ? 'pool' : 'protocol',
      venue,
      url: want.url ?? `https://defillama.com/yields/pool/${want.pool}`,
      history,
    }
    collected++
    days += history.length

    const last = history[history.length - 1]
    const latestApy = [...history].reverse().find((p) => p.apy !== null)?.apy ?? null
    log(
      `  Yields  ${label.padEnd(18)} $${((last.tvl ?? 0) / 1e6).toFixed(1).padStart(8)}M` +
        ` · ${latestApy === null ? '   no yield' : `${latestApy.toFixed(2).padStart(6)}% APY`}` +
        ` · ${String(history.length).padStart(3)} days`,
    )
  }

  if (!collected) {
    log('  Yields  !! every entry failed, keeping the existing store')
    return { protocols: 0, days: 0 }
  }

  store.source = 'defillama'
  store.generatedAt = new Date().toISOString()
  mkdirSync(dirname(STORE), { recursive: true })
  writeFileSync(STORE, stringifyStore(store))

  return { protocols: collected, days }
}
