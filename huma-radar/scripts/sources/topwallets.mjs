/**
 * Top Wallets source — the PST holders listed in TOP_WALLETS
 * (scripts/tracked.mjs), each read through scripts/lib/positions.mjs across
 * all its wallets.
 *
 * Total PST Exposure is what `count` names, address by address (an address's
 * own, else the entry's): the USD value of PST supplied as collateral in its
 * PST markets, PST held in the wallet, or both.
 * The debt against those PST positions is kept beside it. Positions in other
 * collateral (a PRIME or sUSDai loop in the same wallet) are not PST exposure
 * and are left out. None of the APIs serves history, so the series builds from
 * the first run.
 *
 * An entry whose wallets fail to read keeps its history and gets no point for
 * the day. Written to its own store, src/data/topwallets.json.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TOP_WALLETS } from '../tracked.mjs'
import { stringifyStore } from '../lib/gql.mjs'
import { readWallet } from '../lib/positions.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const STORE = resolve(HERE, '../../src/data/topwallets.json')

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

export async function collectTopWallets({ today, log }) {
  const store = loadStore()
  store.wallets ??= {}
  let written = 0

  for (const t of TOP_WALLETS) {
    // each address counts what its own `count` names, or the entry's
    const wallets = []
    const positions = []
    try {
      for (const a of t.addresses) {
        const count = a.count ?? t.count
        const r = await readWallet(a, log)
        const mine = r.positions
          .filter((p) => p.pst && (p.supplied >= DUST || p.borrowed >= DUST))
          .map(({ pst: _pst, ...p }) => ({ ...p, chain: a.chain, address: a.address, supplied: round(p.supplied), borrowed: round(p.borrowed) }))
        const supplied = mine.reduce((x, p) => x + p.supplied, 0)
        const borrowed = mine.reduce((x, p) => x + p.borrowed, 0)
        const held = round(r.pst.usd)
        wallets.push({
          address: a.address,
          label: a.label ?? null,
          chain: a.chain,
          exposure: (count.positions ? supplied : 0) + (count.held ? held : 0),
          supplied: count.positions ? supplied : 0,
          borrowed: count.positions ? borrowed : 0,
          held,
        })
        if (count.positions) positions.push(...mine)
      }
    } catch (err) {
      log(`  Top    ${t.name.padEnd(16)} !! ${err.message} — no point for today`)
      continue
    }

    positions.sort((a, b) => b.supplied - a.supplied)
    const sum = (k) => wallets.reduce((x, w) => x + w[k], 0)
    const point = {
      date: today,
      exposure: sum('exposure'),
      supplied: sum('supplied'),
      borrowed: sum('borrowed'),
      held: sum('held'),
      positions,
      // one row per address, for an entry with more than one
      ...(wallets.length > 1 ? { wallets } : {}),
    }

    const entry = (store.wallets[t.id] ??= { history: [] })
    Object.assign(entry, { id: t.id, name: t.name, strategy: t.strategy, count: t.count, addresses: t.addresses })
    entry.history = [...entry.history.filter((h) => h.date !== today), point]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-HISTORY_DAYS)
    written++

    log(
      `  Top    ${t.name.padEnd(16)} exposure $${(point.exposure / 1e6).toFixed(2)}M · debt $${(point.borrowed / 1e6).toFixed(2)}M` +
        ` · held $${(point.held / 1e6).toFixed(2)}M · ${point.positions.length} PST positions`,
    )
  }

  // an entry dropped from the list goes; one that failed today stays
  const wanted = new Set(TOP_WALLETS.map((t) => t.id))
  for (const id of Object.keys(store.wallets)) if (!wanted.has(id)) delete store.wallets[id]

  if (!written) {
    log('  Top    !! every wallet failed, keeping the existing store')
    return { wallets: 0 }
  }

  store.generatedAt = new Date().toISOString()
  mkdirSync(dirname(STORE), { recursive: true })
  writeFileSync(STORE, stringifyStore(store))
  return { wallets: written }
}
