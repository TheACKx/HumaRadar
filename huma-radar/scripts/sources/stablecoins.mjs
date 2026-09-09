/**
 * Stablecoin supply source — https://stablecoins.llama.fi/stablecoincharts/<chain>
 *
 * DefiLlama publishes the whole daily history of stablecoin circulating supply,
 * per chain and for the network as a whole, so this source does not accumulate
 * the way the lending ones do: each run replaces the stored series with what
 * the API returns, trimmed to the last HISTORY_DAYS days. There is nothing to
 * backfill and nothing to upsert.
 *
 * A day's figure sums every peg type in `totalCirculatingUSD` — the dollar
 * pegs plus the euro, yen, ruble and the rest, each already converted to USD.
 * That is the headline "Total Market Cap" the DefiLlama pages show; reading
 * `peggedUSD` alone would quietly drop the non-USD stablecoins, about $1.6B
 * network-wide.
 *
 * Written to its own store, src/data/stablecoins.json, because a chain's supply
 * is one number per day with no borrow or yield side to model.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STABLECOINS } from '../tracked.mjs'
import { stringifyStore } from '../lib/gql.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const STORE = resolve(HERE, '../../src/data/stablecoins.json')

const API = 'https://stablecoins.llama.fi/stablecoincharts'

/** Enough for the drawer's 1Y range with room to spare, without bloating the bundle. */
const HISTORY_DAYS = 400

const dayOf = (unixSeconds) => new Date(Number(unixSeconds) * 1000).toISOString().slice(0, 10)

async function fetchChart(slug, attempt = 1) {
  try {
    const res = await fetch(`${API}/${encodeURIComponent(slug)}`, {
      headers: { accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    if (attempt >= 4) throw new Error(`DefiLlama stablecoins: ${err.message}`)
    const wait = 500 * 2 ** attempt
    console.warn(`    retry ${attempt} in ${wait}ms (${err.message})`)
    await new Promise((r) => setTimeout(r, wait))
    return fetchChart(slug, attempt + 1)
  }
}

/** Sum of every peg type on one day, in USD. */
function totalUsd(point) {
  const pegs = point?.totalCirculatingUSD
  if (!pegs) return null
  let sum = 0
  for (const v of Object.values(pegs)) {
    const n = Number(v)
    if (Number.isFinite(n)) sum += n
  }
  return Math.round(sum)
}

/** The store as it stands, so a chain that fails today keeps yesterday's series. */
function loadStore() {
  try {
    return JSON.parse(readFileSync(STORE, 'utf8'))
  } catch {
    return { source: 'defillama-stablecoins', generatedAt: null, chains: {} }
  }
}

export async function collectStablecoins({ log }) {
  const store = loadStore()
  store.chains ??= {}
  let chains = 0
  let days = 0

  for (const want of STABLECOINS) {
    let raw
    try {
      raw = await fetchChart(want.slug)
    } catch (err) {
      log(`  Stables ${want.name.padEnd(16)} !! ${err.message}`)
      continue
    }

    const history = raw
      .map((p) => ({ date: dayOf(p.date), total: totalUsd(p) }))
      .filter((p) => p.total !== null && p.total > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-HISTORY_DAYS)

    if (!history.length) {
      log(`  Stables ${want.name.padEnd(16)} !! no usable days returned`)
      continue
    }

    store.chains[want.id] = {
      id: want.id,
      name: want.name,
      slug: want.slug,
      url: want.url,
      history,
    }
    chains++
    days += history.length

    const latest = history[history.length - 1]
    log(
      `  Stables ${want.name.padEnd(16)} $${(latest.total / 1e9).toFixed(3)}B` +
        ` · ${String(history.length).padStart(3)} days through ${latest.date}`,
    )
  }

  if (!Object.keys(store.chains).length) {
    // never blank the store on a bad network day — the previous file still
    // renders a dated view, an empty one renders nothing at all
    log('  Stables !! every chain failed, keeping the existing store')
    return { chains: 0, days: 0 }
  }

  store.generatedAt = new Date().toISOString()
  mkdirSync(dirname(STORE), { recursive: true })
  writeFileSync(STORE, stringifyStore(store))

  return { chains: Object.keys(store.chains).length, days }
}

/** Present so a partial failure can report what the store already held. */
export function loadStablecoinStore() {
  try {
    return JSON.parse(readFileSync(STORE, 'utf8'))
  } catch {
    return { source: 'defillama-stablecoins', generatedAt: null, chains: {} }
  }
}
