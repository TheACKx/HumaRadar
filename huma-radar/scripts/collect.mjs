#!/usr/bin/env node
/**
 * Daily collector for Huma Radar.
 *
 * Appends one snapshot per tracked market for today (UTC) and merges it into
 * src/data/snapshots.json. Re-running the same day overwrites that day rather
 * than duplicating it, so the script is safe to run repeatedly.
 *
 * On a market's first sight it also backfills whatever history its source
 * publishes — Morpho gives daily TVL and APY back to vault creation, Aave gives
 * daily APY only.
 *
 * The two stablecoin tabs ride along in the same run. Each keeps its own store —
 * src/data/stablecoins.json and src/data/stableprotocols.json — and replaces
 * rather than appends, since DefiLlama serves their whole history.
 *
 *   npm run collect
 *   npm run collect -- --no-backfill
 *   npm run collect -- --only=morpho
 *   npm run collect -- --only=stablecoins
 *   npm run collect -- --only=stableprotocols
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stringifyStore } from './lib/gql.mjs'
import { collectAave } from './sources/aave.mjs'
import { collectAaveV4 } from './sources/aavev4.mjs'
import { collectMorpho } from './sources/morpho.mjs'
import { collectFluid } from './sources/fluid.mjs'
import { collectJupLend } from './sources/juplend.mjs'
import { collectKamino } from './sources/kamino.mjs'
import { collectOrca } from './sources/orca.mjs'
import { collectComposites } from './sources/composites.mjs'
import { collectStablecoins } from './sources/stablecoins.mjs'
import { collectStableProtocols } from './sources/stableprotocols.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const STORE = resolve(HERE, '../src/data/snapshots.json')

const argv = process.argv.slice(2)
const backfill = !argv.includes('--no-backfill')
const only = argv.find((a) => a.startsWith('--only='))?.split('=')[1]

const today = new Date().toISOString().slice(0, 10)

/**
 * Days of daily history kept per market, matching the two stablecoin stores.
 * The drawer's longest range is 1Y, so past this the rows are only weight —
 * and this file ships to every visitor inside the bundle.
 */
const HISTORY_DAYS = 400
const log = (msg) => console.log(msg)

const SOURCES = [
  { id: 'aave', run: collectAave },
  { id: 'aavev4', run: collectAaveV4 },
  { id: 'morpho', run: collectMorpho },
  { id: 'fluid', run: collectFluid },
  { id: 'juplend', run: collectJupLend },
  { id: 'kamino', run: collectKamino },
  { id: 'orca', run: collectOrca },
]

function loadStore() {
  try {
    return JSON.parse(readFileSync(STORE, 'utf8'))
  } catch {
    return { sources: [], generatedAt: null, markets: {} }
  }
}

async function main() {
  const store = loadStore()
  store.markets ??= {}

  let snapshots = 0
  let backfills = 0

  for (const source of SOURCES) {
    if (only && only !== source.id) continue
    const res = await source.run({ store, today, backfill, log })
    snapshots += res.snapshots
    backfills += res.backfills
  }

  // sums rows the loop above wrote, so it has to run after all of them
  if (!only || only === 'composites') {
    const res = collectComposites({ store, today, log })
    snapshots += res.snapshots
  }

  // each keeps its own store, so they sit outside the loop above
  let stables = { chains: 0, days: 0 }
  if (!only || only === 'stablecoins') {
    stables = await collectStablecoins({ log })
  }

  let stableProtocols = { protocols: 0, days: 0 }
  if (!only || only === 'stableprotocols') {
    stableProtocols = await collectStableProtocols({ log })
  }

  store.generatedAt = new Date().toISOString()
  store.sources = [
    'aave-v3-api', 'aave-v4-api', 'morpho-api', 'fluid-api', 'jupiter-lend-api', 'kamino-api', 'orca-api',
  ]

  // keep the store from growing without bound
  for (const m of Object.values(store.markets)) {
    if (m.history.length > HISTORY_DAYS) m.history = m.history.slice(-HISTORY_DAYS)
  }

  mkdirSync(dirname(STORE), { recursive: true })
  writeFileSync(STORE, stringifyStore(store))

  const markets = Object.values(store.markets)
  const rows = markets.reduce((a, m) => a + m.history.length, 0)
  console.log(
    `\nWrote ${markets.length} markets · ${rows} daily rows · ` +
      `${snapshots} snapshots for ${today}` +
      (backfills ? ` · ${backfills} backfilled` : ''),
  )
  console.log(`-> ${STORE}`)

  if (stables.chains) {
    console.log(`Wrote ${stables.chains} stablecoin chains · ${stables.days} daily rows`)
    console.log(`-> ${resolve(HERE, '../src/data/stablecoins.json')}`)
  }

  if (stableProtocols.protocols) {
    console.log(
      `Wrote ${stableProtocols.protocols} stablecoin protocols · ${stableProtocols.days} daily rows`,
    )
    console.log(`-> ${resolve(HERE, '../src/data/stableprotocols.json')}`)
  }
}

main().catch((err) => {
  console.error('\nCollector failed:', err.message)
  process.exit(1)
})
