/**
 * Curators source — https://api.llama.fi/protocol/<slug>
 *
 * A risk curator's DefiLlama TVL is the assets in the vaults it manages, summed
 * across chains. DefiLlama serves the whole daily history, so like the
 * stablecoin source this replaces the stored series each run, trimmed to the
 * last HISTORY_DAYS days — enough for the tab's 1Y change.
 *
 * The protocol endpoint's `tvl` series carries one point per day at 00:00 UTC
 * plus a current reading for today, so the last point of each date is kept.
 * A curator that fails, or comes back empty, keeps its stored series: a bad
 * DefiLlama day once wiped two products' history on the stablecoin tab.
 *
 * Written to its own store, src/data/curators.json.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CURATORS } from '../tracked.mjs'
import { stringifyStore } from '../lib/gql.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const STORE = resolve(HERE, '../../src/data/curators.json')

const API = 'https://api.llama.fi/protocol'

/** A year for the 1Y change, with room to spare, without bloating the bundle. */
const HISTORY_DAYS = 400

const dayOf = (unixSeconds) => new Date(Number(unixSeconds) * 1000).toISOString().slice(0, 10)

async function fetchProtocol(slug, attempt = 1) {
  try {
    const res = await fetch(`${API}/${encodeURIComponent(slug)}`, {
      headers: { accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    if (attempt >= 4) throw new Error(`DefiLlama protocol: ${err.message}`)
    const wait = 500 * 2 ** attempt
    console.warn(`    retry ${attempt} in ${wait}ms (${err.message})`)
    await new Promise((r) => setTimeout(r, wait))
    return fetchProtocol(slug, attempt + 1)
  }
}

function loadStore() {
  try {
    return JSON.parse(readFileSync(STORE, 'utf8'))
  } catch {
    return { source: 'defillama-protocols', generatedAt: null, curators: {} }
  }
}

export async function collectCurators({ log }) {
  const store = loadStore()
  store.curators ??= {}
  let days = 0

  for (const want of CURATORS) {
    let raw
    try {
      raw = await fetchProtocol(want.slug)
    } catch (err) {
      log(`  Curator ${want.name.padEnd(22)} !! ${err.message} — keeping the stored series`)
      continue
    }

    // one value per date, the day's last reading winning
    const byDate = new Map()
    for (const p of raw?.tvl ?? []) {
      const v = Number(p.totalLiquidityUSD)
      if (Number.isFinite(v) && v > 0) byDate.set(dayOf(p.date), Math.round(v))
    }
    const history = [...byDate]
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-HISTORY_DAYS)

    if (!history.length) {
      log(`  Curator ${want.name.padEnd(22)} !! no TVL returned — keeping the stored series`)
      continue
    }

    store.curators[want.id] = {
      id: want.id,
      name: want.name,
      slug: want.slug,
      url: `https://defillama.com/protocol/${want.slug}`,
      history,
    }
    days += history.length

    const latest = history[history.length - 1]
    log(
      `  Curator ${want.name.padEnd(22)} $${(latest.total / 1e6).toFixed(1)}M` +
        ` · ${String(history.length).padStart(3)} days through ${latest.date}`,
    )
  }

  // a curator dropped from the list goes; one that failed today stays
  const wanted = new Set(CURATORS.map((c) => c.id))
  for (const id of Object.keys(store.curators)) if (!wanted.has(id)) delete store.curators[id]

  if (!days) {
    // nothing refreshed: leave the file, and its timestamp, as they were
    log('  Curators !! every curator failed, keeping the existing store')
    return { curators: 0, days: 0 }
  }

  store.generatedAt = new Date().toISOString()
  mkdirSync(dirname(STORE), { recursive: true })
  writeFileSync(STORE, stringifyStore(store))

  return { curators: Object.keys(store.curators).length, days }
}
