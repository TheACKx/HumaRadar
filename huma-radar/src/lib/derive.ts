import type { Change, Deltas, Market, MarketRow, Snapshot, StablePoint } from '../types'

type Metric = 'tvl' | 'borrowed' | 'available' | 'apy' | 'borrowApy' | 'utilization'

const NO_CHANGE: Change = { pct: null, abs: null }

/** Metrics denominated in dollars, where a near-zero baseline is not a baseline. */
const MONEY: Metric[] = ['tvl', 'borrowed', 'available']

/**
 * A market seeded with a few dollars days ago will show five- or six-figure
 * percentages once it fills up — arithmetically right, but it says nothing
 * about the market and swamps every real move in the column. Below this the
 * absolute change is still reported and the percent reads as unavailable.
 */
const BASELINE_FLOOR_USD = 10_000

/** Newest non-null reading of a metric. */
export function latest(history: Snapshot[], metric: Metric): number | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const v = history[i][metric]
    if (v !== null && Number.isFinite(v)) return v
  }
  return null
}

/** Index of the newest day carrying this metric. */
function newestIndex(history: Snapshot[], metric: Metric): number {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i][metric] !== null) return i
  }
  return -1
}

/**
 * Reading exactly `daysAgo` days before the newest day that has this metric.
 * Null when that day is missing or empty — the normal case for Aave's
 * supplied/borrowed totals until the collector has run for a week.
 */
function valueBack(history: Snapshot[], metric: Metric, daysAgo: number): number | null {
  const end = newestIndex(history, metric)
  if (end === -1) return null

  const target = new Date(`${history[end].date}T00:00:00Z`)
  target.setUTCDate(target.getUTCDate() - daysAgo)
  const wanted = target.toISOString().slice(0, 10)

  const hit = history.find((h) => h.date === wanted)
  const v = hit ? hit[metric] : null
  return v !== null && Number.isFinite(v as number) ? (v as number) : null
}

function change(history: Snapshot[], metric: Metric, daysAgo: number): Change {
  const now = latest(history, metric)
  const then = valueBack(history, metric, daysAgo)
  if (now === null || then === null) return NO_CHANGE

  const tooSmall = MONEY.includes(metric) && Math.abs(then) < BASELINE_FLOOR_USD
  return {
    abs: now - then,
    pct: then === 0 || tooSmall ? null : ((now - then) / Math.abs(then)) * 100,
  }
}

export function computeDeltas(history: Snapshot[]): Deltas {
  return {
    tvl7d: change(history, 'tvl', 7),
    tvl30d: change(history, 'tvl', 30),
    apy7d: change(history, 'apy', 7),
    apy30d: change(history, 'apy', 30),
    borrowApy7d: change(history, 'borrowApy', 7),
    borrowApy30d: change(history, 'borrowApy', 30),
  }
}

export function withDeltas(m: Market): MarketRow {
  return {
    ...m,
    tvl: latest(m.history, 'tvl'),
    borrowed: latest(m.history, 'borrowed'),
    available: latest(m.history, 'available'),
    apy: latest(m.history, 'apy'),
    borrowApy: latest(m.history, 'borrowApy'),
    utilization: latest(m.history, 'utilization'),
    deltas: computeDeltas(m.history),
  }
}

/**
 * Roll-up rows whose money is already counted by other rows on screen.
 *
 * A liquidity-layer row reports everything supplied into a protocol for one
 * token, so it contains that protocol's individual vaults. Where those vaults
 * are in the same selection, counting both double-counts — so the roll-up is
 * left out of the totals and kept in the table as a reference row.
 *
 * Where the vaults are *not* on screen, the roll-up is the only record of that
 * money and is counted normally. Re Related would otherwise lose 60% of its
 * TVL, and Ethena Related $259M.
 */
export function supersededRollups(rows: MarketRow[]): Set<string> {
  const hasOwnVenues = new Set(rows.filter((r) => !r.rollup).map((r) => r.protocol))
  return new Set(
    rows.filter((r) => r.rollup && hasOwnVenues.has(r.protocol)).map((r) => r.id),
  )
}

/**
 * Every row shown in the table but held out of the header totals.
 *
 * Two reasons, and they are not the same. A superseded roll-up would count
 * money the rows beneath it already account for. A row flagged `notInTotal` is
 * simply not what its tab totals — Kamino's Huma-market USDC reserve is the
 * money lent *against* PST, not PST itself.
 */
export function excludedFromTotals(rows: MarketRow[]): Set<string> {
  const out = supersededRollups(rows)
  for (const r of rows) if (r.notInTotal) out.add(r.id)
  return out
}

/** Chain-level totals for the header stat cards. */
export function aggregate(all: MarketRow[]) {
  const superseded = excludedFromTotals(all)
  // every figure below is over the counted set; the table still shows them all
  const rows = all.filter((r) => !superseded.has(r.id))
  const sum = (f: (r: MarketRow) => number | null) => rows.reduce((a, r) => a + (f(r) ?? 0), 0)

  const tvl = sum((r) => r.tvl)
  const borrowed = sum((r) => r.borrowed)

  // TVL-weighted so a tiny market at 20% cannot distort the headline
  const weighted = (apy: (r: MarketRow) => number | null, list = rows) => {
    const usable = list.filter((r) => apy(r) !== null && r.tvl !== null)
    const denom = usable.reduce((a, r) => a + (r.tvl as number), 0)
    if (denom === 0) return null
    return usable.reduce((a, r) => a + (apy(r) as number) * (r.tvl as number), 0) / denom
  }

  const borrowables = rows.filter((r) => r.borrowable)
  const vaults = rows.filter((r) => r.kind === 'vault')
  const reserves = rows.filter((r) => r.kind === 'reserve')
  const markets = rows.filter((r) => r.kind === 'market')
  const pools = rows.filter((r) => r.kind === 'pool')

  return {
    tvl,
    borrowed,
    utilization: tvl === 0 ? null : (borrowed / tvl) * 100,
    apy: weighted((r) => r.apy),
    vaultApy: vaults.length ? weighted((r) => r.apy, vaults) : null,
    borrowApy: borrowables.length ? weighted((r) => r.borrowApy, borrowables) : null,
    count: rows.length,
    vaultCount: vaults.length,
    reserveCount: reserves.length,
    marketCount: markets.length,
    poolCount: pools.length,
    borrowCount: borrowables.length,
    /** roll-up rows shown in the table but held out of these totals */
    excludedCount: superseded.size,
    excludedTvl: all
      .filter((r) => superseded.has(r.id))
      .reduce((a, r) => a + (r.tvl ?? 0), 0),
    tvl7d: aggregateChange(rows, 'tvl', 7),
    tvl30d: aggregateChange(rows, 'tvl', 30),
    /** summed TVL per day, for the header sparkline */
    series: totalSeries(rows, 30),
    apySeries: apyTotalSeries(rows, 30),
  }
}

/**
 * Chain-level change, computed only over markets that have both endpoints —
 * otherwise a market whose history starts mid-window would read as growth.
 *
 * Reports how many markets the number actually covers, because Aave has no
 * historical totals: a chain mixing Aave and Morpho would otherwise show a
 * Morpho-only move labelled as if the whole TVL had shifted.
 */
export interface AggChange {
  pct: number | null
  /** markets that contributed */
  covered: number
  /** markets in the selection */
  total: number
  /** USD covered by the change vs. the whole selection */
  coveredTvl: number
}

function aggregateChange(rows: MarketRow[], metric: Metric, daysAgo: number): AggChange {
  let now = 0
  let then = 0
  let covered = 0
  for (const r of rows) {
    const a = latest(r.history, metric)
    const b = valueBack(r.history, metric, daysAgo)
    if (a === null || b === null) continue
    now += a
    then += b
    covered++
  }
  return {
    pct: !covered || then < BASELINE_FLOOR_USD ? null : ((now - then) / then) * 100,
    covered,
    total: rows.length,
    coveredTvl: now,
  }
}

/** Days where every contributing market has a value — avoids phantom dips. */
function totalSeries(rows: MarketRow[], days: number) {
  const withData = rows.filter((r) => r.history.some((h) => h.tvl !== null))
  if (!withData.length) return []
  const dates = commonDates(withData, 'tvl', days)
  return dates.map((date) => ({
    date,
    value: withData.reduce((a, r) => a + (find(r, date)?.tvl ?? 0), 0),
  }))
}

function apyTotalSeries(rows: MarketRow[], days: number) {
  const withData = rows.filter((r) => r.history.some((h) => h.apy !== null))
  if (!withData.length) return []
  const dates = commonDates(withData, 'apy', days)
  return dates.map((date) => {
    const pts = withData.map((r) => find(r, date)).filter((p) => p?.apy != null)
    if (!pts.length) return { date, value: 0 }
    return { date, value: pts.reduce((a, p) => a + (p!.apy as number), 0) / pts.length }
  })
}

function find(r: MarketRow, date: string) {
  return r.history.find((h) => h.date === date)
}

function commonDates(rows: MarketRow[], metric: Metric, days: number): string[] {
  const sets = rows.map((r) => new Set(r.history.filter((h) => h[metric] !== null).map((h) => h.date)))
  const all = [...new Set(sets.flatMap((s) => [...s]))].sort()
  return all.filter((d) => sets.every((s) => s.has(d))).slice(-days)
}

/**
 * Change in any dated series over a window, measured back from the newest day
 * that carries the metric — the two stablecoin tabs' weekly and monthly moves.
 *
 * The rules match the market metrics above: the earlier day has to be present
 * exactly, and with `moneyFloor` a baseline under BASELINE_FLOOR_USD reports
 * the absolute change with no percent. DefiLlama publishes unbroken daily
 * series, so a null here means the row is younger than the window rather than
 * that a day went missing.
 */
export function datedChange<T extends { date: string }>(
  history: T[],
  value: (p: T) => number | null,
  daysAgo: number,
  opts: { moneyFloor?: boolean } = {},
): Change {
  let end = -1
  for (let i = history.length - 1; i >= 0; i--) {
    const v = value(history[i])
    if (v !== null && Number.isFinite(v)) {
      end = i
      break
    }
  }
  if (end === -1) return NO_CHANGE

  const target = new Date(`${history[end].date}T00:00:00Z`)
  target.setUTCDate(target.getUTCDate() - daysAgo)
  const wanted = target.toISOString().slice(0, 10)

  const hit = history.find((h) => h.date === wanted)
  const then = hit ? value(hit) : null
  if (then === null || !Number.isFinite(then)) return NO_CHANGE

  const now = value(history[end]) as number
  const tooSmall = opts.moneyFloor === true && Math.abs(then) < BASELINE_FLOOR_USD
  return {
    abs: now - then,
    pct: then === 0 || tooSmall ? null : ((now - then) / Math.abs(then)) * 100,
  }
}

/** Newest non-null reading of a dated series. */
export function latestOf<T>(history: T[], value: (p: T) => number | null): number | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const v = value(history[i])
    if (v !== null && Number.isFinite(v)) return v
  }
  return null
}

/** The stablecoin supply overlook's weekly and monthly moves. */
export function seriesChange(history: StablePoint[], daysAgo: number): Change {
  return datedChange(history, (p) => p.total, daysAgo, { moneyFloor: true })
}
