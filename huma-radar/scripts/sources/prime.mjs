/**
 * Huma Prime source — the positions of the wallets listed in PRIME
 * (scripts/tracked.mjs), read through scripts/lib/positions.mjs from each
 * protocol's own public API: Jupiter Lend and Kamino on Solana, Morpho and
 * Fluid on Ethereum, plus what sits idle in each wallet.
 *
 * For each wallet and day it stores the PST supplied as collateral (exposure),
 * the debt against it, what sits idle in the wallet, and their net — the
 * figure Jupiter's portfolio page and DeBank show as net worth. None of these
 * APIs serves history, so the series builds from the first run.
 *
 * A wallet whose sources fail keeps its stored history and gets no point for
 * the day: a partial read would understate it. Positions under $1,000 are
 * dust and left out.
 *
 * Written to its own store, src/data/prime.json.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRIME } from '../tracked.mjs'
import { stringifyStore } from '../lib/gql.mjs'
import { readWallet } from '../lib/positions.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const STORE = resolve(HERE, '../../src/data/prime.json')

const HISTORY_DAYS = 400
const DUST = 1000

const round = (v) => Math.round(v)

function loadStore() {
  try {
    return JSON.parse(readFileSync(STORE, 'utf8'))
  } catch {
    return { source: 'jupiter-lend, kamino, morpho, fluid, solana-rpc, blockscout', generatedAt: null, wallets: {} }
  }
}

export async function collectPrime({ today, log }) {
  const store = loadStore()
  store.wallets ??= {}
  let written = 0

  for (const w of PRIME.wallets) {
    let read
    try {
      read = await readWallet(w, log)
    } catch (err) {
      log(`  Prime  ${w.label.padEnd(18)} !! ${err.message} — no point for today`)
      continue
    }

    const positions = read.positions
      .filter((p) => p.supplied >= DUST || p.borrowed >= DUST)
      .map(({ pst: _pst, ...p }) => ({ ...p, supplied: round(p.supplied), borrowed: round(p.borrowed) }))
      .sort((a, b) => b.supplied - a.supplied)
    const supplied = positions.reduce((a, p) => a + p.supplied, 0)
    const borrowed = positions.reduce((a, p) => a + p.borrowed, 0)
    const wallet = round(read.walletValue)
    const point = { date: today, supplied, borrowed, wallet, net: supplied - borrowed + wallet, positions }

    const entry = (store.wallets[w.id] ??= { history: [] })
    Object.assign(entry, { id: w.id, label: w.label, chain: w.chain, address: w.address, url: w.url })
    entry.history = [...entry.history.filter((h) => h.date !== today), point]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-HISTORY_DAYS)
    written++

    log(
      `  Prime  ${w.label.padEnd(18)} exposure $${(supplied / 1e6).toFixed(2)}M · debt $${(borrowed / 1e6).toFixed(2)}M` +
        ` · wallet $${(wallet / 1e6).toFixed(2)}M · net $${(point.net / 1e6).toFixed(2)}M · ${positions.length} positions`,
    )
  }

  // a wallet dropped from the list goes; one that failed today stays
  const wanted = new Set(PRIME.wallets.map((w) => w.id))
  for (const id of Object.keys(store.wallets)) if (!wanted.has(id)) delete store.wallets[id]

  if (!written) {
    log('  Prime  !! every wallet failed, keeping the existing store')
    return { wallets: 0 }
  }

  store.generatedAt = new Date().toISOString()
  mkdirSync(dirname(STORE), { recursive: true })
  writeFileSync(STORE, stringifyStore(store))
  return { wallets: written }
}
