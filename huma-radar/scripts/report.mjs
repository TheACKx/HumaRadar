/**
 * Weekly report numbers.
 *
 * Every figure in reports/<date>.md comes from here, so none of the arithmetic
 * is left to whoever writes the prose — the report's author adds the why, and
 * cannot get a total or a percentage wrong, because it never computes one.
 *
 *   npm run report                        latest snapshot vs 7 and 30 days back
 *   npm run report -- --date=2026-09-25   a specific snapshot date
 *   npm run report -- --offline           skip the live DefiLlama calls
 *
 * Reads the Huma Radar stores in src/data and reports/config.json, and makes a
 * handful of live DefiLlama calls for what the stores do not hold: which chain
 * each product lives on, and which stablecoins make up each chain's supply.
 *
 * Writes reports/data/<date>.json (every number, for audit and for next week),
 * reports/data/<date>.tables.md (the tables, ready to paste, and the
 * self-checks the prose has to respect), and reports/data/<date>.headline.json
 * (the handful of figures the site shows above a report and in its week list).
 *
 *   npm run report -- --date=2026-09-23 --headline-only
 *   npm run report -- --date=2026-09-23 --x-only
 *
 * rebuild only the headline, or only the X posts, from an existing <date>.json
 * without refetching the numbers — live figures move, so a full rerun would stop
 * matching a report already written.
 *
 * X posts for the week's research go to reports/data/<date>.x.md (and .x.json).
 * They are kept out of the tables file on purpose: report:check treats every
 * figure in the tables as verified, and a number in a post is only the
 * account's own claim. --no-x skips X; --refresh-x ignores this week's cache.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHAINS, SOLANA_CHAIN_ID, STABLECOINS, STABLECOIN_PROTOCOLS } from './tracked.mjs'
import { fetchXPosts, readXToken, renderXDigest } from './lib/x.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = resolve(HERE, '../src/data')
const REPORTS = resolve(HERE, '../../reports')
const CONFIG = JSON.parse(readFileSync(resolve(REPORTS, 'config.json'), 'utf8'))
const T = CONFIG.thresholds

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  }),
)

const load = (name) => JSON.parse(readFileSync(resolve(DATA, `${name}.json`), 'utf8'))
const listOf = (x) => (Array.isArray(x) ? x : Object.values(x))

const snapStore = load('snapshots')
const stableStore = load('stablecoins')
const protoStore = load('stableprotocols')

const MARKETS = listOf(snapStore.markets)
const CHAIN_TOTALS = listOf(stableStore.chains)
const PRODUCTS = listOf(protoStore.protocols)

// ---------------------------------------------------------------- dates

const addDays = (date, n) => {
  const t = new Date(`${date}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

const latest = MARKETS.reduce((a, r) => {
  const d = r.history.at(-1)?.date
  return d && d > a ? d : a
}, '')

const END = args.date ?? latest
const WEEK = addDays(END, -7)
const MONTH = addDays(END, -30)

/**
 * The value on `date`, or on the nearest earlier day within `slack` days. A
 * collector day can fail, and a report should say it used the day before
 * rather than show a hole — so the date actually used travels with the value.
 */
function valueAt(history, field, date, slack = 2) {
  const floor = addDays(date, -slack)
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i]
    if (h.date > date) continue
    if (h.date < floor) break
    if (h[field] != null) return { v: h[field], date: h.date }
  }
  return null
}

const change = (now, then) => {
  if (now == null || then == null) return null
  const usd = now - then
  return { usd, pct: then === 0 ? null : (usd / then) * 100, from: then, to: now }
}

/**
 * The prompt's two tests, with floors on the percentage one: without them a
 * $12M vault moving $1.2M outranks a $4B product moving $150M, and the
 * deep-dive budget goes on noise. The first calibration run flagged 26
 * individual markets, most of them single-digit-million moves.
 */
function significant(now, then, c) {
  if (!c) return false
  if (Math.abs(c.usd) >= T.wowUsd) return true
  const size = Math.max(now ?? 0, then ?? 0)
  return c.pct != null && Math.abs(c.pct) >= T.wowPct &&
    size >= T.minTvlForPct && Math.abs(c.usd) >= T.minUsdForPct
}

/**
 * Same direction for `trendWeeks` consecutive weeks reads as a trend; anything
 * else is mixed, which the prose may call a one-off only with evidence.
 */
function trendOf(pointAt) {
  const pts = []
  for (let w = 0; w <= T.trendWeeks; w++) pts.push(pointAt(addDays(END, -7 * w)))
  if (pts.some((p) => p == null)) return 'insufficient history'
  const deltas = pts.slice(0, -1).map((p, i) => p - pts[i + 1])
  if (deltas.every((d) => d > 0)) return `up ${T.trendWeeks} wks`
  if (deltas.every((d) => d < 0)) return `down ${T.trendWeeks} wks`
  return 'mixed'
}

/**
 * The largest day-over-day change inside the window. A week's move that
 * arrived in one day reads as a single depositor, migration or cap change;
 * one spread across the week reads as demand. First needed for USDT on Aave
 * Ethereum, which lost $244M between two snapshots with borrowing flat.
 */
function biggestDay(history, field) {
  let best = null
  for (let d = addDays(WEEK, 1); d <= END; d = addDays(d, 1)) {
    const a = valueAt(history, field, addDays(d, -1), 0)?.v
    const b = valueAt(history, field, d, 0)?.v
    if (a == null || b == null) continue
    if (!best || Math.abs(b - a) > Math.abs(best.usd)) best = { date: d, usd: b - a }
  }
  return best
}

const endpoints = (history, field) => {
  const from = valueAt(history, field, WEEK)?.v ?? null
  const to = valueAt(history, field, END)?.v ?? null
  return from == null && to == null ? null : { from, to }
}

const NETWORK = Object.fromEntries(CHAINS.map((c) => [c.chainId, c.name]))
NETWORK[SOLANA_CHAIN_ID] = 'Solana'

// ---------------------------------------------------------------- live calls

const GAP_MS = 400
let lastCall = 0
async function getJson(url, attempt = 1) {
  const wait = lastCall + GAP_MS - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastCall = Date.now()
  try {
    const res = await fetch(url)
    if (res.status === 429 && attempt < 4) {
      await new Promise((r) => setTimeout(r, 3000 * attempt))
      return getJson(url, attempt + 1)
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
      return getJson(url, attempt + 1)
    }
    throw new Error(`${url}: ${err.message}`)
  }
}

const notes = []
const live = !args.offline

// DefiLlama keys its chain breakdown with extras such as "Ethereum-staking" and
// "borrowed" that are not chains; only plain chain names are TVL
const NOT_A_CHAIN = /-|^(staking|pool2|borrowed|vesting|offers|treasury)$/i

const dayOf = (s) => new Date(s * 1000).toISOString().slice(0, 10)

async function productChains(meta) {
  if (!live) return null
  try {
    if (meta.pool) {
      const d = await getJson(`https://yields.llama.fi/poolsEnriched?pool=${meta.pool}`)
      const p = (d.data ?? d)[0]
      return p?.chain ? [{ chain: p.chain, whole: true }] : null
    }
    const d = await getJson(`https://api.llama.fi/protocol/${meta.protocol}`)
    const out = []
    for (const [chain, v] of Object.entries(d.chainTvls ?? {})) {
      if (NOT_A_CHAIN.test(chain) || !v.tvl?.length) continue
      const hist = v.tvl.map((p) => ({ date: dayOf(p.date), tvl: p.totalLiquidityUSD }))
      const now = valueAt(hist, 'tvl', END)?.v ?? null
      const wk = valueAt(hist, 'tvl', WEEK)?.v ?? null
      out.push({ chain, now, wk, change: change(now, wk) })
    }
    return out.sort((a, b) => (b.now ?? 0) - (a.now ?? 0))
  } catch (err) {
    notes.push(`Chain split unavailable for ${meta.name} ${meta.ticker}: ${err.message}`)
    return null
  }
}

// ---------------------------------------------------------------- 1. products

/**
 * For a lending pool, DefiLlama's yields "TVL" is available liquidity —
 * supplied minus borrowed — not deposits. Verified on Aave USDC, where it
 * matched Huma Radar's own supplied-minus-borrowed to within a few million
 * every day: supply was flat at $2.38B while borrowing rose, and the row
 * read as a 21% outflow that never happened. The lendBorrow index names every
 * lending pool, so the distinction is detected rather than hand-maintained.
 */
async function lendingPools() {
  if (!live) return new Map()
  try {
    const rows = await getJson('https://yields.llama.fi/lendBorrow')
    return new Map(rows.map((r) => [r.pool, r]))
  } catch (err) {
    notes.push(`Lending-pool index unavailable, so liquidity rows are unmarked: ${err.message}`)
    return new Map()
  }
}

async function products() {
  const out = []
  const lending = await lendingPools()
  for (const r of PRODUCTS) {
    const meta = STABLECOIN_PROTOCOLS.find((m) => m.id === r.id) ?? {}
    const nowP = valueAt(r.history, 'tvl', END)
    const now = nowP?.v ?? null
    const wk = valueAt(r.history, 'tvl', WEEK)?.v ?? null
    const mo = valueAt(r.history, 'tvl', MONTH)?.v ?? null
    const c = change(now, wk)
    const apy = valueAt(r.history, 'apy', END)?.v ?? null
    const apyWk = valueAt(r.history, 'apy', WEEK)?.v ?? null
    if (now == null && !r.history.some((h) => h.tvl != null)) {
      notes.push(`${r.name} ${r.ticker}: no TVL anywhere in the store — the source stopped returning it, so the row is yield-only this week`)
    }
    const lb = meta.pool ? lending.get(meta.pool) : null
    out.push({
      id: r.id,
      label: `${r.name} ${r.ticker}`,
      source: meta.pool ? 'pool' : 'protocol',
      metric: lb ? 'liquidity' : 'tvl',
      liveSupplied: lb?.totalSupplyUsd ?? null,
      liveBorrowed: lb?.totalBorrowUsd ?? null,
      asOf: nowP?.date ?? null,
      now, wk, mo,
      wow: c,
      m30: change(now, mo),
      apy,
      apyWowPp: apy != null && apyWk != null ? apy - apyWk : null,
      apyRange: endpoints(r.history, 'apy'),
      bigDay: biggestDay(r.history, 'tvl'),
      significant: significant(now, wk, c),
      trend: trendOf((d) => valueAt(r.history, 'tvl', d)?.v ?? null),
      chains: await productChains({ ...meta, name: r.name, ticker: r.ticker }),
    })
  }
  return out.sort((a, b) => Math.abs(b.wow?.usd ?? 0) - Math.abs(a.wow?.usd ?? 0))
}

// ---------------------------------------------------------------- 2. venues

/**
 * The site's own counting rule, per tab: a roll-up is dropped where the tab
 * also lists that protocol's individual markets, since it would count the same
 * money twice. Composite rows sum other rows by construction and never count.
 * Reusing the rule means the report's totals are the totals people see.
 */
function countedIn(rows) {
  const hasOwnVenues = new Set(rows.filter((r) => !r.rollup).map((r) => r.protocol))
  return rows.filter(
    (r) => r.protocol !== 'Combined' && !(r.rollup && hasOwnVenues.has(r.protocol)),
  )
}

const venueKey = (r) =>
  `${r.protocol}|${r.chainId}|${r.venueAddress.toLowerCase()}|${r.assetAddress.toLowerCase()}`

function uniqueVenues() {
  const tabs = [...new Set(MARKETS.map((r) => r.chain))]
  const seen = new Map()
  for (const tab of tabs) {
    for (const r of countedIn(MARKETS.filter((m) => m.chain === tab))) {
      const k = venueKey(r)
      if (seen.has(k)) seen.get(k).tabs.push(tab)
      else seen.set(k, { row: r, tabs: [tab] })
    }
  }
  return [...seen.values()]
}

// Morpho's API serves a market's history from its creation, so a day before its
// first point is a day it did not exist, worth 0. Every other venue's history
// starts when the collector began watching it, so an earlier day is unknown.
const BACKFILLED = new Set(['Morpho'])

function rowValue(row, date) {
  const v = valueAt(row.history, 'tvl', date)?.v
  if (v != null) return v
  if (BACKFILLED.has(row.protocol)) {
    const first = row.history.find((h) => h.tvl != null)?.date
    if (first && date < first) return 0
  }
  return null
}

/** Strict: a group's value on a date, only if every member has one. For trends. */
function groupAt(members, date) {
  let total = 0
  for (const m of members) {
    const v = rowValue(m.row, date)
    if (v == null) return null
    total += v
  }
  return total
}

// past this share of the group, a like-for-like change describes a different group
const LIKE_FOR_LIKE_MAX = 0.1

/**
 * A group's change, like for like. Members without a value on either date are
 * left out of both sides instead of blanking the whole group — otherwise one
 * newly tracked market hides the move of the other eighteen, and a vault that
 * launched mid-week would hide a real inflow. If what is left out is more than
 * a tenth of the group's value the change is withheld: it would no longer be a
 * change in this group.
 */
function groupChange(members, a, b) {
  let full = 0
  let nowLike = 0
  let thenLike = 0
  let left = 0
  let leftValue = 0
  for (const m of members) {
    const va = rowValue(m.row, a)
    const vb = rowValue(m.row, b)
    if (va != null) full += va
    if (va == null || vb == null) {
      left++
      leftValue += va ?? vb ?? 0
      continue
    }
    nowLike += va
    thenLike += vb
  }
  const n = members.length
  const coverage = left ? `${n - left}/${n}` : null
  if (left === n) return { now: full || null, change: null, coverage, reason: 'no history' }
  if (full > 0 && leftValue / full > LIKE_FOR_LIKE_MAX) {
    return { now: full, change: null, coverage, reason: `only ${n - left} of ${n} markets have history` }
  }
  return { now: full, change: change(nowLike, thenLike), coverage, reason: null }
}

function venues() {
  const unique = uniqueVenues()
  const groups = new Map()
  for (const u of unique) {
    const net = NETWORK[u.row.chainId] ?? String(u.row.chainId)
    const k = `${u.row.protocol}|${net}`
    if (!groups.has(k)) groups.set(k, { protocol: u.row.protocol, network: net, members: [] })
    groups.get(k).members.push(u)
  }

  const marketOf = (u) => {
    const r = u.row
    const now = rowValue(r, END)
    const wk = rowValue(r, WEEK)
    return {
      name: r.name,
      venue: r.venue,
      protocol: r.protocol,
      network: NETWORK[r.chainId] ?? String(r.chainId),
      tabs: u.tabs,
      kind: r.rollup ? 'total' : r.kind,
      now, wk,
      wow: change(now, wk),
      bigDay: biggestDay(r.history, 'tvl'),
      borrowed: endpoints(r.history, 'borrowed'),
      utilization: endpoints(r.history, 'utilization'),
      supplyApy: endpoints(r.history, 'apy'),
      trend: trendOf((d) => valueAt(r.history, 'tvl', d)?.v ?? null),
      url: r.url,
    }
  }

  const rows = [...groups.values()].map((g) => {
    const w = groupChange(g.members, END, WEEK)
    const m = groupChange(g.members, END, MONTH)
    const now = w.now
    const c = w.change
    // which markets inside the group the move actually came from
    const contributors = g.members
      .map(marketOf)
      .filter((m) => m.wow && m.wow.usd !== 0)
      .sort((a, b) => Math.abs(b.wow.usd) - Math.abs(a.wow.usd))
      .slice(0, T.contributorsPerGroup)
      .map((m) => ({ ...m, share: c?.usd ? m.wow.usd / c.usd : null }))
    return {
      protocol: g.protocol,
      network: g.network,
      markets: g.members.length,
      now,
      wow: c,
      wowCoverage: w.coverage,
      m30: m.change,
      m30Why: m.reason,
      significant: significant(now, c?.from, c),
      trend: trendOf((d) => groupAt(g.members, d)),
      contributors,
    }
  })

  // A market can move hard while its group nets to little — an inflow on one
  // Aave reserve and an outflow on another. Those surface here, by dollars
  // alone, so netting cannot hide them.
  const flaggedGroups = new Set(rows.filter((g) => g.significant).map((g) => `${g.protocol}|${g.network}`))
  const movers = unique
    .map(marketOf)
    .filter((m) => m.wow && Math.abs(m.wow.usd) >= T.wowUsd)
    .map((m) => ({ ...m, inFlaggedGroup: flaggedGroups.has(`${m.protocol}|${m.network}`) }))
    .sort((a, b) => Math.abs(b.wow.usd) - Math.abs(a.wow.usd))

  return {
    listings: MARKETS.length,
    unique: unique.length,
    groups: rows.sort((a, b) => Math.abs(b.wow?.usd ?? 0) - Math.abs(a.wow?.usd ?? 0)),
    movers,
    unique_: unique,
  }
}

// ---------------------------------------------------------------- 3. supply

/** Non-USD pegs are converted at the asset's price; unpriced ones are skipped. */
function pegValue(asset, amounts) {
  if (!amounts) return null
  const raw = Object.values(amounts).reduce((a, v) => a + (Number(v) || 0), 0)
  if (asset.pegType === 'peggedUSD') return raw
  return asset.price ? raw * asset.price : null
}

async function supply() {
  let assets = null
  if (live) {
    try {
      assets = (await getJson('https://stablecoins.llama.fi/stablecoins?includePrices=true')).peggedAssets
    } catch (err) {
      notes.push(`Per-stablecoin breakdown unavailable: ${err.message}`)
    }
  }

  const out = CHAIN_TOTALS.map((c) => {
    const nowP = valueAt(c.history, 'total', END)
    const now = nowP?.v ?? null
    const wk = valueAt(c.history, 'total', WEEK)?.v ?? null
    const mo = valueAt(c.history, 'total', MONTH)?.v ?? null
    const slug = STABLECOINS.find((s) => s.id === c.id)?.slug

    let top = null
    let driver = null
    let liveSum = null
    let dayMover = null
    if (assets && c.id !== 'all') {
      const onChain = assets
        .map((a) => {
          const cc = a.chainCirculating?.[slug]
          if (!cc) return null
          const n = pegValue(a, cc.current)
          const w = pegValue(a, cc.circulatingPrevWeek)
          const d = pegValue(a, cc.circulatingPrevDay)
          // A seven-figure balance identical to the dollar a week apart is either
          // a static supply or a coin DefiLlama has not re-read; the data cannot
          // say which, so it is marked rather than shown as a measured +0.00%.
          // (A near-zero move is not this: USDT on BSC moved +$427K on $9.18B.)
          const frozen = w != null && n >= 1e6 && n === w
          return n == null ? null : {
            symbol: a.symbol, now: n, wk: w, frozen,
            day: frozen ? null : change(n, d),
            wow: frozen ? null : change(n, w),
          }
        })
        .filter(Boolean)
      liveSum = onChain.reduce((a, x) => a + x.now, 0)
      top = [...onChain].sort((a, b) => b.now - a.now).slice(0, 3)

      // share of gross movement rather than of the net, which stays meaningful
      // when two coins move hard in opposite directions and nearly cancel
      const gross = onChain.reduce((a, x) => a + Math.abs(x.wow?.usd ?? 0), 0)
      const biggest = [...onChain].sort(
        (a, b) => Math.abs(b.wow?.usd ?? 0) - Math.abs(a.wow?.usd ?? 0),
      )[0]
      if (gross > 0 && biggest?.wow) {
        const share = Math.abs(biggest.wow.usd) / gross
        driver = { symbol: biggest.symbol, usd: biggest.wow.usd, share, dominant: share >= T.dominantShare }
      }
      // the snapshot is the day's 00:00 point and the live figures are newer,
      // so a big same-day move shows up as drift between the two
      const today = [...onChain].sort((a, b) => Math.abs(b.day?.usd ?? 0) - Math.abs(a.day?.usd ?? 0))[0]
      if (today?.day) dayMover = { symbol: today.symbol, usd: today.day.usd }
    }

    return {
      id: c.id,
      name: c.name,
      asOf: nowP?.date ?? null,
      now, wk, mo,
      wow: change(now, wk),
      m30: change(now, mo),
      top, driver, liveSum, dayMover,
    }
  })

  const all = out.find((c) => c.id === 'all')
  const chains = out.filter((c) => c.id !== 'all').sort((a, b) => (b.wow?.usd ?? 0) - (a.wow?.usd ?? 0))
  return { all, chains }
}

// ---------------------------------------------------------------- 4. huma

function huma(productRows, supplyRows, venueData) {
  const tab = MARKETS.filter((r) => r.chain === CONFIG.huma.tab)
  const hasOwnVenues = new Set(tab.filter((r) => !r.rollup).map((r) => r.protocol))
  const excluded = new Set(
    tab.filter((r) => r.notInTotal || (r.rollup && hasOwnVenues.has(r.protocol))).map((r) => r.id),
  )
  const counted = tab.filter((r) => !excluded.has(r.id)).map((row) => ({ row }))

  const totW = groupChange(counted, END, WEEK)
  const totM = groupChange(counted, END, MONTH)

  const rows = tab
    .map((r) => {
      const n = rowValue(r, END)
      const w = rowValue(r, WEEK)
      const b = valueAt(r.history, 'borrowApy', END)?.v ?? null
      const bw = valueAt(r.history, 'borrowApy', WEEK)?.v ?? null
      return {
        name: r.name,
        venue: r.venue,
        protocol: r.protocol,
        network: NETWORK[r.chainId] ?? String(r.chainId),
        kind: r.rollup ? 'total' : r.kind,
        inTotal: !excluded.has(r.id),
        now: n, wk: w,
        wow: change(n, w),
        borrowApy: b,
        borrowApyWowPp: b != null && bw != null ? b - bw : null,
        utilization: valueAt(r.history, 'utilization', END)?.v ?? null,
      }
    })
    .sort((a, b) => (b.now ?? 0) - (a.now ?? 0))

  // where on the tab the money moved, by network
  const byNetwork = {}
  for (const c of counted) {
    const net = NETWORK[c.row.chainId] ?? String(c.row.chainId)
    ;(byNetwork[net] ??= []).push(c)
  }
  const networks = Object.entries(byNetwork).map(([network, members]) => {
    const g = groupChange(members, END, WEEK)
    return { network, now: g.now, wow: g.change, coverage: g.coverage }
  })

  const product = productRows.find((p) => p.id === CONFIG.huma.product)

  // Huma against its own market: PST on a chain vs that chain's stablecoin supply
  const vsMarket = CONFIG.huma.compareChains.map((id) => {
    const s = supplyRows.chains.find((c) => c.id === id)
    const pst = product?.chains?.find((c) => c.chain.toLowerCase() === s?.name.toLowerCase())
    const tabNet = networks.find((n) => n.network.toLowerCase() === s?.name.toLowerCase())
    return {
      chain: s?.name ?? id,
      supplyWowPct: s?.wow?.pct ?? null,
      pstWowPct: pst?.change?.pct ?? null,
      pstWowUsd: pst?.change?.usd ?? null,
      pstNow: pst?.now ?? null,
      tabWowUsd: tabNet?.wow?.usd ?? null,
      tabWowPct: tabNet?.wow?.pct ?? null,
    }
  })

  const pick = (pred) => rows.find(pred) ?? null
  return {
    tabTotal: { now: totW.now, wow: totW.change, m30: totM.change, m30Why: totM.reason },
    product,
    pstLiquidity: pick((r) => r.protocol === 'Combined'),
    pstJupLend: pick((r) => r.protocol === 'JupLend' && r.kind === 'total'),
    pstMorpho: pick((r) => r.protocol === 'Morpho' && r.kind === 'total'),
    networks,
    vsMarket,
    rows,
    counted: counted.length,
    excluded: excluded.size,
  }
}

// ---------------------------------------------------------------- 5. research

/**
 * One research pass per source rather than per flagged row: Aave's product,
 * Aave on Ethereum and Aave on Plasma are one blog and one search, not three.
 * Anything flagged that no source claims is listed so the gap is visible.
 */
function research(productRows, venueData) {
  const flaggedProducts = productRows.filter((p) => p.significant)
  const flaggedGroups = venueData.groups.filter((g) => g.significant)
  const claimed = new Set()

  const targets = CONFIG.sources
    .filter((src) => src.radar)
    .map((src) => {
      const items = [
        ...flaggedProducts.filter((p) => src.radar.products?.includes(p.id)).map((p) => {
          claimed.add(`p:${p.id}`)
          return `${p.label} ${fmt.signed(p.wow.usd)} (${fmt.pct(p.wow.pct)})` +
            (p.metric === 'liquidity' ? ' [liquidity, not deposits — check the borrow side]' : '')
        }),
        ...flaggedGroups.filter((g) => src.radar.venues?.includes(g.protocol)).map((g) => {
          claimed.add(`g:${g.protocol}|${g.network}`)
          return `${g.protocol} on ${g.network} ${fmt.signed(g.wow.usd)} (${fmt.pct(g.wow.pct)})`
        }),
      ]
      return {
        id: src.id,
        name: src.name,
        x: src.x ? `https://x.com/${src.x}` : null,
        blog: src.blog,
        items,
      }
    })
    .filter((t) => t.items.length)

  const unclaimed = [
    ...flaggedProducts.filter((p) => !claimed.has(`p:${p.id}`)).map((p) => p.label),
    ...flaggedGroups.filter((g) => !claimed.has(`g:${g.protocol}|${g.network}`)).map((g) => `${g.protocol} on ${g.network}`),
  ]
  return { targets, unclaimed }
}

// ---------------------------------------------------------------- 6. X posts

/**
 * Every research pass whose source has an X handle, plus the sources read
 * every week regardless (Huma), so an X-only announcement from them is never
 * missed just because their numbers were quiet.
 */
function xAccounts(targets) {
  const want = new Map()
  const add = (id, why) => {
    const src = CONFIG.sources.find((s) => s.id === id)
    if (src?.x && !want.has(src.x.toLowerCase())) want.set(src.x.toLowerCase(), { handle: src.x, name: src.name, why })
  }
  for (const t of targets) add(t.id, 'flagged')
  for (const id of CONFIG.x.always) add(id, 'always read')
  return [...want.values()]
}

/**
 * From a week before the window opens — announcements often lead the flows
 * they cause — to the end of the report's snapshot day, or now if that is
 * still ahead: X rejects an end time in the future.
 */
function xWindow() {
  const start = new Date(`${addDays(WEEK, -CONFIG.x.lookbackDaysBeforeWindow)}T00:00:00Z`)
  const dayAfter = new Date(`${addDays(END, 1)}T00:00:00Z`)
  const now = new Date(Date.now() - 60_000)
  const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z')
  return { start: iso(start), end: iso(dayAfter < now ? dayAfter : now) }
}

async function readX(targets) {
  if (args['no-x'] || !live) return null
  return fetchXPosts({
    accounts: xAccounts(targets),
    window: xWindow(),
    token: readXToken(resolve(REPORTS, 'x-token.local')),
    limits: CONFIG.x,
    cachePath: resolve(REPORTS, `data/${END}.x.json`),
    usersPath: resolve(REPORTS, 'data/x-users.json'),
    refresh: Boolean(args['refresh-x']),
  })
}

function writeX(x) {
  if (!x) return
  writeFileSync(resolve(REPORTS, `data/${END}.x.md`), renderXDigest(x, END))
}

// ---------------------------------------------------------------- 7. checks

function checks({ productRows, venueData, supplyRows, humaData, xData }) {
  const out = []
  const push = (name, ok, detail, level = 'fail') => out.push({ name, ok, detail, level })

  const stale = [
    ...productRows.filter((p) => p.asOf && p.asOf !== END).map((p) => `${p.label} (${p.asOf})`),
    ...supplyRows.chains.filter((c) => c.asOf && c.asOf !== END).map((c) => `${c.name} (${c.asOf})`),
    ...venueData.unique_
      .filter((u) => valueAt(u.row.history, 'tvl', END, 0) == null)
      .map((u) => `${u.row.protocol} ${u.row.name} (${u.row.chain})`),
  ]
  push('every row carries the end-date snapshot', stale.length === 0,
    stale.length ? `stale or missing: ${stale.join('; ')}` : `all rows on ${END}`)

  // totals, summed a second way: across the flat list rather than the groups
  const flat = venueData.unique_.reduce((a, u) => a + (valueAt(u.row.history, 'tvl', END)?.v ?? 0), 0)
  const grouped = venueData.groups.reduce((a, g) => a + (g.now ?? 0), 0)
  push('venue groups sum to the flat venue total', Math.abs(flat - grouped) < 1,
    `groups ${fmt.money(grouped)} vs flat ${fmt.money(flat)}`)

  const partial = venueData.groups.filter((g) => g.wowCoverage)
  push('like-for-like group changes are marked', true,
    partial.length ? partial.map((g) => `${g.protocol} on ${g.network} (${g.wowCoverage})`).join(', ')
      : 'every group change covers all its markets', 'warn')

  const humaSum = humaData.rows.filter((r) => r.inTotal).reduce((a, r) => a + (r.now ?? 0), 0)
  push('Huma tab total equals the sum of its counted rows',
    humaData.tabTotal.now != null && Math.abs(humaSum - humaData.tabTotal.now) < 1,
    `rows ${fmt.money(humaSum)} vs total ${fmt.money(humaData.tabTotal.now)}`)

  const netSum = humaData.networks.reduce((a, n) => a + (n.now ?? 0), 0)
  push('Huma by-network split sums to the tab total',
    Math.abs(netSum - (humaData.tabTotal.now ?? 0)) < 1,
    `networks ${fmt.money(netSum)} vs total ${fmt.money(humaData.tabTotal.now)}`)

  // every percentage agrees with the two values it came from, and in sign
  const all = [...productRows, ...venueData.groups, ...supplyRows.chains, supplyRows.all,
    humaData.tabTotal, ...humaData.networks, ...humaData.rows]
  const bad = all.filter((r) => {
    const c = r.wow
    if (!c || c.pct == null) return false
    const expect = ((c.to - c.from) / c.from) * 100
    return Math.abs(expect - c.pct) > 1e-9 || Math.abs(c.to - c.from - c.usd) > 1e-6 ||
      Math.sign(c.usd) !== Math.sign(c.pct)
  })
  push('every WoW % matches its own two values', bad.length === 0,
    bad.length ? bad.map((r) => r.label ?? r.name ?? r.protocol).join(', ') : `${all.length} rows`)

  // two independent sources for the same chain totals should roughly agree
  const drift = supplyRows.chains
    .filter((c) => c.liveSum != null && c.now)
    .map((c) => ({ name: c.name, d: (c.liveSum - c.now) / c.now }))
  const far = drift.filter((x) => Math.abs(x.d) > T.crossCheckTolerance)
  // Drift is not an arithmetic failure: the snapshot is the day's 00:00 point
  // and the live per-stablecoin figures are hours newer. Past the tolerance it
  // usually means a large same-day move the snapshot has not seen yet — first
  // caught as USDC on Solana falling $900M on 2026-09-23 — so name the coin.
  if (drift.length) {
    const explain = (x) => {
      const c = supplyRows.chains.find((r) => r.name === x.name)
      const m = c?.dayMover
      return `${x.name} ${(x.d * 100).toFixed(2)}%` +
        (m ? ` (largest one-day mover ${m.symbol} ${fmt.signed(m.usd)})` : '')
    }
    push(`chain totals agree with the live per-stablecoin sums (±${T.crossCheckTolerance * 100}%)`, far.length === 0,
      far.length
        ? `live figures are newer than the snapshot — ${far.map(explain).join('; ')}`
        : `max drift ${(Math.max(...drift.map((x) => Math.abs(x.d))) * 100).toFixed(2)}%`,
      'warn')
  }

  // a roll-up kept on one tab must not overlap markets counted from another
  const kept = venueData.unique_.filter((u) => u.row.rollup)
  const overlap = kept.filter((k) =>
    venueData.unique_.some(
      (u) => !u.row.rollup && u.row.protocol === k.row.protocol &&
        u.row.chainId === k.row.chainId &&
        u.row.assetAddress.toLowerCase() === k.row.assetAddress.toLowerCase(),
    ),
  )
  push('no roll-up double counts markets listed elsewhere', overlap.length === 0,
    overlap.length ? overlap.map((k) => `${k.row.protocol} ${k.row.name}`).join(', ')
      : `${kept.length} roll-ups kept, none overlapping`)

  if (xData) {
    const failed = xData.accounts.filter((a) => a.error)
    const got = xData.accounts.filter((a) => !a.error)
    push('X posts read for every research account', failed.length === 0,
      failed.length
        ? `not read: ${failed.map((a) => `@${a.handle} (${a.error})`).join(', ')}`
        : `${got.reduce((n, a) => n + a.posts.length, 0)} posts from ${got.length} accounts · ` +
          `read this run ${xData.postsRead} (est. $${xData.estCostUsd.toFixed(2)})`,
      'warn')
  }

  return out
}

// ---------------------------------------------------------------- formatting

const fmt = {
  money(v) {
    if (v == null) return '—'
    const a = Math.abs(v)
    const s = a >= 1e9 ? `$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `$${(a / 1e6).toFixed(1)}M`
      : a >= 1e3 ? `$${(a / 1e3).toFixed(0)}K` : `$${a.toFixed(0)}`
    return v < 0 ? `−${s}` : s
  },
  signed(v) {
    if (v == null) return '—'
    return v >= 0 ? `+${fmt.money(v)}` : fmt.money(v)
  },
  pct(v) {
    if (v == null) return '—'
    return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`
  },
  apy: (v) => (v == null ? '—' : `${v.toFixed(2)}%`),
  pp: (v) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}pp`),
  flag: (b) => (b ? '⚑' : ''),
}

/** "biggest day +$58.2M on Sep 17 (87% of the week)" */
function dayPhrase(day, weekUsd) {
  if (!day) return 'no daily detail'
  const base = `biggest day ${fmt.signed(day.usd)} on ${day.date}`
  if (!weekUsd) return base
  // a share only means something when the day and the week point the same way
  // and the day did not overshoot; otherwise say what happened instead
  if (Math.sign(day.usd) !== Math.sign(weekUsd)) return `${base} (against the week's direction)`
  const share = day.usd / weekUsd
  if (share > 1.1) return `${base} (bigger than the week's net — partly reversed)`
  return `${base} (${Math.round(share * 100)}% of the week)`
}

function contributorLine(m) {
  const parts = [`${m.name} ${fmt.signed(m.wow.usd)}` +
    (m.share != null ? ` (${Math.round(m.share * 100)}% of the move)` : '')]
  parts.push(dayPhrase(m.bigDay, m.wow.usd))
  if (m.borrowed?.from != null && m.borrowed?.to != null) {
    parts.push(`borrowed ${fmt.money(m.borrowed.from)} → ${fmt.money(m.borrowed.to)}`)
  }
  if (m.utilization?.from != null && m.utilization?.to != null) {
    parts.push(`util. ${m.utilization.from.toFixed(1)}% → ${m.utilization.to.toFixed(1)}%`)
  }
  // collateral-only reserves pay nothing, so a 0.00% → 0.00% line is noise
  if (m.supplyApy?.from != null && m.supplyApy?.to != null && (m.supplyApy.from || m.supplyApy.to)) {
    parts.push(`APY ${fmt.apy(m.supplyApy.from)} → ${fmt.apy(m.supplyApy.to)}`)
  }
  return parts.join(' · ')
}

function table(head, rows) {
  const line = (cells) => `| ${cells.join(' | ')} |`
  return [line(head), line(head.map(() => '---')), ...rows.map(line)].join('\n')
}

function chainLabel(p) {
  if (!p.chains?.length) return '—'
  if (p.chains[0].whole) return p.chains[0].chain
  const total = p.chains.reduce((a, c) => a + (c.now ?? 0), 0)
  if (total && (p.chains[0].now ?? 0) / total >= 0.995) return p.chains[0].chain
  return p.chains
    .filter((c) => c.now && c.now / total >= 0.05)
    .map((c) => `${c.chain} ${Math.round((c.now / total) * 100)}%`)
    .join(', ')
}

/** The venue total and its change, as the sum of each group's own change. */
function venueTotal(groups) {
  const now = groups.reduce((a, g) => a + (g.now ?? 0), 0)
  const withWow = groups.filter((g) => g.wow)
  const c = withWow.length === groups.length
    ? change(withWow.reduce((a, g) => a + g.wow.to, 0), withWow.reduce((a, g) => a + g.wow.from, 0))
    : null
  return { now, change: c }
}

/**
 * The figures the site shows above a report and in its week list, formatted
 * here so the page prints exactly what the report's tables say. Takes the
 * saved JSON's shape, so it can be rebuilt from a past run without refetching.
 */
function headline({ products, venues, supply, huma, research }) {
  const kpi = (now, c) => ({
    value: fmt.money(now),
    usd: fmt.signed(c?.usd),
    pct: fmt.pct(c?.pct),
    dir: Math.sign(c?.usd ?? 0),
  })
  const vt = venueTotal(venues.groups)
  // liquidity rows are borrow demand, not deposits, so they cannot be a mover
  const movers = [
    ...products.filter((p) => p.wow && p.metric !== 'liquidity').map((p) => ({ label: p.label, usd: p.wow.usd })),
    ...venues.groups.filter((g) => g.wow).map((g) => ({ label: `${g.protocol} on ${g.network}`, usd: g.wow.usd })),
  ].sort((a, b) => b.usd - a.usd)
  const top = (m) => (m ? { label: m.label, usd: fmt.signed(m.usd) } : null)
  return {
    start: addDays(END, -7),
    end: END,
    supply: kpi(supply.all?.now, supply.all?.wow),
    venues: kpi(vt.now, vt.change),
    pst: kpi(huma.product?.now, huma.product?.wow),
    flagged: {
      products: products.filter((p) => p.significant).length,
      groups: venues.groups.filter((g) => g.significant).length,
      passes: research.targets.length,
    },
    topUp: top(movers.find((m) => m.usd > 0)),
    topDown: top([...movers].reverse().find((m) => m.usd < 0)),
  }
}

function render({ productRows, venueData, supplyRows, humaData, checkRows, researchPlan, xData }) {
  const out = []
  out.push(`# Weekly report numbers — ${END}`)
  out.push('')
  out.push(`Window: **${WEEK} → ${END}** (WoW) · 30d from ${MONTH} · ⚑ = significant: ` +
    `|WoW| ≥ ${fmt.money(T.wowUsd)}, or |WoW %| ≥ ${T.wowPct}% on ≥ ${fmt.money(T.minTvlForPct)}`)
  out.push('')

  out.push('## Stablecoin products')
  out.push('')
  out.push(table(
    ['', 'Product', 'Chain', 'TVL', 'WoW $', 'WoW %', '30d %', 'APY', 'APY WoW', 'Trend'],
    productRows.map((p) => [fmt.flag(p.significant), p.metric === 'liquidity' ? `${p.label} ◇` : p.label, chainLabel(p), fmt.money(p.now),
      fmt.signed(p.wow?.usd), fmt.pct(p.wow?.pct), fmt.pct(p.m30?.pct), fmt.apy(p.apy),
      fmt.pp(p.apyWowPp), p.trend]),
  ))
  out.push('')
  out.push('*Protocol-sourced rows (Huma, Ondo, Ethena, Hastra, Cap, Avant, Tori, Yuzu) are protocol-wide TVL, not the ticker alone. ◇ = lending pool: the figure is available liquidity (supplied − borrowed), not deposits, so a fall can mean more borrowing rather than withdrawals.*')
  out.push('')
  out.push('### Flagged products — shape of the week')
  out.push('')
  for (const p of productRows.filter((x) => x.significant)) {
    const liq = p.metric === 'liquidity'
      ? ` — **available liquidity, not deposits** (live: ${fmt.money(p.liveSupplied)} supplied, ${fmt.money(p.liveBorrowed)} borrowed)`
      : ''
    out.push(`- **${p.label}** ${fmt.signed(p.wow.usd)}${liq} — ${dayPhrase(p.bigDay, p.wow.usd)}` +
      (p.apyRange?.from != null && p.apyRange?.to != null
        ? `; APY ${fmt.apy(p.apyRange.from)} → ${fmt.apy(p.apyRange.to)}` : '') +
      `; trend: ${p.trend}`)
  }
  out.push('')

  out.push('## Tracked lending venues, by protocol and chain')
  out.push('')
  // the total's change is the sum of the groups' own like-for-like changes
  const { now: gTotal, change: gc } = venueTotal(venueData.groups)
  out.push(table(
    ['', 'Protocol', 'Chain', 'Markets', 'TVL', 'WoW $', 'WoW %', '30d %', 'Trend'],
    [
      ...venueData.groups.map((g) => [fmt.flag(g.significant), g.protocol, g.network, g.markets,
        fmt.money(g.now), fmt.signed(g.wow?.usd) + (g.wowCoverage ? '‡' : ''), fmt.pct(g.wow?.pct),
        g.m30 ? fmt.pct(g.m30.pct) : 'n/a', g.trend]),
      ['', '**Total**', '', venueData.unique, `**${fmt.money(gTotal)}**`, fmt.signed(gc?.usd),
        fmt.pct(gc?.pct), '', ''],
    ],
  ))
  out.push('')
  out.push(`*Only the ${venueData.unique} markets Huma Radar tracks (${venueData.listings} listings, cross-listed ones counted once) — not protocol-wide TVL. "n/a" 30d: that venue's TVL history starts after ${MONTH} (Aave, Fluid, Jupiter Lend, Kamino and Orca publish no history; the collector began recording them on 2026-08-30). ‡ = like for like, leaving out markets with no value a week ago.*`)
  out.push('')

  out.push('### Where the flagged groups moved')
  out.push('')
  const flagged = venueData.groups.filter((g) => g.significant)
  if (!flagged.length) out.push('_No venue group crossed the thresholds._')
  for (const g of flagged) {
    out.push(`- **${g.protocol} on ${g.network}** ${fmt.signed(g.wow.usd)} (${fmt.pct(g.wow.pct)})`)
    for (const m of g.contributors) out.push(`  - ${contributorLine(m)}`)
  }
  out.push('')
  out.push('*Shares can exceed 100% when other markets in the group moved the opposite way.*')
  out.push('')
  out.push(`### Individual markets moving at least ${fmt.money(T.wowUsd)}`)
  out.push('')
  out.push(venueData.movers.length ? table(
    ['Market', 'Venue', 'Chain', 'TVL', 'WoW $', 'WoW %', 'Biggest day', 'Trend', 'Group flagged?'],
    venueData.movers.map((m) => [`${m.name}${m.kind === 'total' ? ' (total)' : ''}`, m.venue, m.network,
      fmt.money(m.now), fmt.signed(m.wow.usd), fmt.pct(m.wow.pct),
      m.bigDay ? `${fmt.signed(m.bigDay.usd)} on ${m.bigDay.date}` : '—', m.trend,
      m.inFlaggedGroup ? 'yes' : '**no — netted out**']),
  ) : '_None._')
  out.push('')

  out.push('## Stablecoin supply by chain')
  out.push('')
  const a = supplyRows.all
  out.push(table(
    ['#', 'Chain', 'Supply', 'WoW $', 'WoW %', '30d %', 'Top 3 by supply (WoW %)', 'Biggest mover'],
    [
      ['', '**All chains**', `**${fmt.money(a.now)}**`, fmt.signed(a.wow?.usd), fmt.pct(a.wow?.pct), fmt.pct(a.m30?.pct), '', ''],
      ...supplyRows.chains.map((c, i) => [i + 1, c.name, fmt.money(c.now), fmt.signed(c.wow?.usd),
        fmt.pct(c.wow?.pct), fmt.pct(c.m30?.pct),
        c.top ? c.top.map((t) => `${t.symbol} ${fmt.money(t.now)} (${t.frozen ? 'identical†' : fmt.pct(t.wow?.pct)})`).join(' · ') : '—',
        c.driver ? `${c.driver.symbol} ${fmt.signed(c.driver.usd)} · ${Math.round(c.driver.share * 100)}% of gross${c.driver.dominant ? ' **◆**' : ''}` : '—']),
    ],
  ))
  out.push('')
  out.push('*Ranked by WoW $. Chain totals are Huma Radar snapshots; the top-3 and biggest-mover columns are live DefiLlama per-stablecoin figures against its rolling week-ago value. ◆ = one stablecoin made up at least half the gross movement. † = the same balance to the dollar a week apart: either a static supply or not re-read by DefiLlama, so no change is claimed.*')
  out.push('')

  out.push('## Huma')
  out.push('')
  const h = humaData
  const hl = (label, now, c, m30) => [label, fmt.money(now), fmt.signed(c?.usd), fmt.pct(c?.pct), m30 ? fmt.pct(m30.pct) : 'n/a']
  out.push(table(['Metric', 'Value', 'WoW $', 'WoW %', '30d %'], [
    hl('PST TVL (DefiLlama, protocol-wide)', h.product?.now, h.product?.wow, h.product?.m30),
    hl('Huma Related tab TVL (site total)', h.tabTotal.now, h.tabTotal.wow, h.tabTotal.m30),
    ...(h.pstLiquidity ? [hl('Total PST Liquidity (Fluid + JupLend + Orca)', h.pstLiquidity.now, h.pstLiquidity.wow)] : []),
    ...(h.pstJupLend ? [hl('PST supplied on Jupiter Lend', h.pstJupLend.now, h.pstJupLend.wow)] : []),
    ...(h.pstMorpho ? [hl('PST markets on Morpho (loan supplied)', h.pstMorpho.now, h.pstMorpho.wow)] : []),
  ]))
  out.push('')
  out.push('### Where it moved')
  out.push('')
  out.push(table(['Network', 'Huma tab TVL', 'WoW $', 'WoW %'],
    h.networks.map((n) => [n.network, fmt.money(n.now), fmt.signed(n.wow?.usd), fmt.pct(n.wow?.pct)])))
  out.push('')
  out.push('### Against its market')
  out.push('')
  out.push(table(['Chain', 'Stablecoin supply WoW %', 'PST on chain', 'PST WoW $', 'PST WoW %', 'Huma tab WoW $', 'PST growth outside tracked venues', 'Faster than market?'],
    h.vsMarket.map((v) => [v.chain, fmt.pct(v.supplyWowPct), fmt.money(v.pstNow), fmt.signed(v.pstWowUsd),
      fmt.pct(v.pstWowPct), fmt.signed(v.tabWowUsd),
      v.pstWowUsd != null && v.tabWowUsd != null ? fmt.signed(v.pstWowUsd - v.tabWowUsd) : '—',
      v.pstWowPct == null || v.supplyWowPct == null ? '—' : v.pstWowPct > v.supplyWowPct ? 'yes' : 'no'])))
  out.push('')
  out.push('*PST on chain is DefiLlama supply; Huma tab is the venues Huma Radar tracks on that chain. Their difference is PST growth held somewhere the tab does not list — wallets, or venues not yet tracked. The two measure different things (PST supplied vs. dollars lent against it), so treat the difference as indicative.*')
  out.push('')
  out.push('### Markets')
  out.push('')
  out.push(table(['Market', 'Venue', 'Chain', 'TVL', 'WoW $', 'WoW %', 'Borrow APY', 'Borrow WoW', 'Util.', 'In total'],
    h.rows.map((r) => [`${r.name}${r.kind === 'total' ? ' (total)' : ''}`, r.venue, r.network, fmt.money(r.now),
      fmt.signed(r.wow?.usd), fmt.pct(r.wow?.pct), fmt.apy(r.borrowApy), fmt.pp(r.borrowApyWowPp),
      r.utilization == null ? '—' : `${r.utilization.toFixed(1)}%`, r.inTotal ? '✓' : '—'])))
  out.push('')

  out.push('## Research plan')
  out.push('')
  const xFor = (name) => xData?.accounts.find((a) => a.name === name)
  const xLine = (a) => !a ? '_none configured_' : a.error ? `@${a.handle} — not read (${a.error}), use web search`
    : `@${a.username ?? a.handle} — ${a.posts.length} posts in \`${END}.x.md\``
  out.push(xData
    ? `One pass per source. X posts for the week are in \`reports/data/${END}.x.md\` — read them before searching.`
    : 'One pass per source. X was not read this run — use web search for X-only news.')
  out.push('')
  for (const t of researchPlan.targets) {
    out.push(`- **${t.name}** — ${t.items.join('; ')}`)
    out.push(`  - blog: ${t.blog ?? '_none configured — web search only_'} · X: ${xData ? xLine(xFor(t.name)) : (t.x ?? '_none configured_')}`)
  }
  for (const a of xData?.accounts.filter((a) => a.why === 'always read') ?? []) {
    out.push(`- **${a.name}** — read every week · X: ${xLine(a)}`)
  }
  if (researchPlan.unclaimed.length) {
    out.push(`- **No source configured:** ${researchPlan.unclaimed.join(', ')} — web search only`)
  }
  out.push('')

  out.push('## Self-checks')
  out.push('')
  for (const c of checkRows) {
    const tag = c.ok ? 'PASS' : c.level === 'warn' ? '**WARN**' : '**FAIL**'
    out.push(`- ${tag} — ${c.name}: ${c.detail}`)
  }
  if (notes.length) {
    out.push('')
    out.push('## Data notes')
    out.push('')
    for (const n of notes) out.push(`- ${n}`)
  }
  out.push('')
  return out.join('\n')
}

// ---------------------------------------------------------------- run

const headlinePath = resolve(REPORTS, `data/${END}.headline.json`)

if (args['x-only']) {
  const saved = JSON.parse(readFileSync(resolve(REPORTS, `data/${END}.json`), 'utf8'))
  const x = await fetchXPosts({
    accounts: xAccounts(saved.research.targets),
    window: xWindow(),
    token: readXToken(resolve(REPORTS, 'x-token.local')),
    limits: CONFIG.x,
    cachePath: resolve(REPORTS, `data/${END}.x.json`),
    usersPath: resolve(REPORTS, 'data/x-users.json'),
    refresh: Boolean(args['refresh-x']),
  })
  writeX(x)
  for (const a of x.accounts) {
    console.log(`  @${a.username ?? a.handle} (${a.why}): ${a.error ? `not read — ${a.error}` : `${a.posts.length} posts${a.cached ? ', cached' : ''}`}`)
  }
  for (const n of x.notes) console.log(`  note: ${n}`)
  console.log(`X: read ${x.postsRead} posts this run (est. $${x.estCostUsd.toFixed(2)}) -> reports/data/${END}.x.md`)
  process.exit(0)
}

if (args['headline-only']) {
  const saved = JSON.parse(readFileSync(resolve(REPORTS, `data/${END}.json`), 'utf8'))
  writeFileSync(headlinePath, JSON.stringify(headline(saved), null, 1) + '\n')
  console.log(`-> reports/data/${END}.headline.json (from the saved ${END}.json)`)
  process.exit(0)
}

const productRows = await products()
const venueData = venues()
const supplyRows = await supply()
const humaData = huma(productRows, supplyRows, venueData)
const researchPlan = research(productRows, venueData)
const xData = await readX(researchPlan.targets)
writeX(xData)
const checkRows = checks({ productRows, venueData, supplyRows, humaData, xData })

mkdirSync(resolve(REPORTS, 'data'), { recursive: true })
const { unique_, ...venueOut } = venueData
writeFileSync(resolve(REPORTS, `data/${END}.json`), JSON.stringify({
  end: END, week: WEEK, month: MONTH,
  generatedAt: new Date().toISOString(),
  thresholds: T,
  products: productRows,
  venues: venueOut,
  supply: supplyRows,
  huma: humaData,
  research: researchPlan,
  checks: checkRows,
  notes,
}, null, 1) + '\n')
writeFileSync(resolve(REPORTS, `data/${END}.tables.md`),
  render({ productRows, venueData, supplyRows, humaData, checkRows, researchPlan, xData }))
writeFileSync(headlinePath, JSON.stringify(headline({
  products: productRows, venues: venueOut, supply: supplyRows, huma: humaData, research: researchPlan,
}), null, 1) + '\n')

const failed = checkRows.filter((c) => !c.ok && c.level === 'fail')
console.log(`Window ${WEEK} -> ${END} (30d from ${MONTH})`)
console.log(`Significant: ${productRows.filter((p) => p.significant).length} products, ` +
  `${venueData.groups.filter((g) => g.significant).length} venue groups · ` +
  `${venueData.movers.length} markets at least ${fmt.money(T.wowUsd)} · ${researchPlan.targets.length} research passes`)
for (const c of checkRows) console.log(`  ${c.ok ? 'PASS' : c.level === 'warn' ? 'WARN' : 'FAIL'}  ${c.name} — ${c.detail}`)
for (const n of [...notes, ...(xData?.notes ?? [])]) console.log(`  note: ${n}`)
console.log(`-> reports/data/${END}.json, .tables.md, .headline.json`)
if (failed.length) process.exitCode = 1
