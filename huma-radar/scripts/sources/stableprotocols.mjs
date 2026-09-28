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

async function fetchJson(url, attempt = 1, init = {}) {
  const since = Date.now() - lastCall
  if (since < GAP_MS) await sleep(GAP_MS - since)
  lastCall = Date.now()

  let limited = false
  try {
    const res = await fetch(url, { ...init, headers: { accept: 'application/json', ...init.headers } })
    if (!res.ok) {
      limited = res.status === 429
      throw new Error(`HTTP ${res.status}`)
    }
    return await res.json()
  } catch (err) {
    if (attempt >= 5) throw new Error(`${new URL(url).hostname}: ${err.message}`)
    const wait = limited ? 3000 * attempt : 500 * 2 ** attempt
    console.warn(`    retry ${attempt} in ${wait}ms (${err.message})`)
    await sleep(wait)
    return fetchJson(url, attempt + 1, init)
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

const COINS = 'https://coins.llama.fi'
const COINGECKO = 'https://api.coingecko.com/api/v3'

/**
 * One year of daily market caps per token, from CoinGecko, for a row that has
 * none yet. The coins API only knows today, and CoinGecko is what it is keyed
 * by: on 2026-09-28 the two agreed on all three syrup tokens.
 *
 * A token contributes 0 before its first day, since it did not exist; a day it
 * did exist for but has no figure is dropped rather than summed short, which
 * would read as an outflow.
 */
async function backfillMcaps(want, today) {
  const perDay = new Map()
  const first = {}
  for (const t of want.mcaps) {
    const id = t.coin.replace(/^coingecko:/, '')
    const json = await fetchJson(`${COINGECKO}/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`)
    for (const [ms, v] of json?.market_caps ?? []) {
      const date = new Date(ms).toISOString().slice(0, 10)
      if (date >= today || !v) continue // today comes from the coins API
      if (!perDay.has(date)) perDay.set(date, {})
      perDay.get(date)[t.ticker] = round(v)
      if (!first[t.ticker] || date < first[t.ticker]) first[t.ticker] = date
    }
  }

  const rows = []
  for (const date of [...perDay.keys()].sort()) {
    const parts = {}
    let complete = true
    for (const t of want.mcaps) {
      const v = perDay.get(date)[t.ticker]
      if (v != null) parts[t.ticker] = v
      else if (!first[t.ticker] || date < first[t.ticker]) parts[t.ticker] = 0
      else {
        complete = false
        break
      }
    }
    if (complete) rows.push({ date, parts })
  }
  return rows
}

/**
 * Summed market caps, with APY weighted by each token's share of them. The
 * history accumulates — a day at a time from the coins API — instead of being
 * refetched, so what came before survives a bad day; each run recomputes the
 * APY for every stored day from the pools' own rate history.
 */
async function mcapsSeries(want, stored) {
  const today = new Date().toISOString().slice(0, 10)

  const caps = await fetchJson(`${COINS}/mcaps`, 1, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ coins: want.mcaps.map((t) => t.coin) }),
  })
  const now = {}
  for (const t of want.mcaps) {
    const v = caps?.[t.coin]?.mcap
    if (v == null) throw new Error(`coins API returned no market cap for ${t.coin}`)
    now[t.ticker] = round(v)
  }

  // only rows already on this basis carry forward; anything else was a
  // different measure, and continuing it would draw a false step
  let rows = stored?.kind === 'mcaps' ? stored.history.filter((h) => h.parts) : []
  let backfilled = 0
  if (!rows.length) {
    rows = await backfillMcaps(want, today)
    backfilled = rows.length
  }
  rows = rows.filter((h) => h.date !== today).concat({ date: today, parts: now })

  const apyOf = {}
  for (const t of want.mcaps) {
    const series = await poolSeries(t.pool)
    apyOf[t.ticker] = new Map(series.map((p) => [p.date, p.apy]))
  }

  const history = rows.map(({ date, parts }) => {
    let tvl = 0
    let weight = 0
    let weighted = 0
    for (const [ticker, cap] of Object.entries(parts)) {
      tvl += cap
      const apy = apyOf[ticker]?.get(date)
      if (apy != null && cap > 0) {
        weight += cap
        weighted += cap * apy
      }
    }
    return { date, tvl, apy: weight ? rate(weighted / weight) : null, parts }
  })
  return { history, backfilled }
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
      if (want.mcaps) {
        const res = await mcapsSeries(want, store.protocols[want.id])
        history = res.history
        venue = `${want.mcaps.map((t) => t.ticker).join(' + ')} · market cap`
        if (res.backfilled) log(`  Yields  ${label.padEnd(18)} backfilled ${res.backfilled} days of market cap from CoinGecko`)
      } else if (want.pool) {
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
      /** which source shape this row is quoting — see STABLECOIN_PROTOCOLS */
      kind: want.mcaps ? 'mcaps' : want.pool ? 'pool' : 'protocol',
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
