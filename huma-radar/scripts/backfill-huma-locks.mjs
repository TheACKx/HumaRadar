#!/usr/bin/env node
/**
 * One-time (resumable) read of Huma Classic's locked deposits, back N days:
 *
 *   node scripts/backfill-huma-locks.mjs --days=185
 *
 * Afterwards the daily collector keeps src/data/huma-locks.json current on its own.
 */
import { RPC_LABEL, scanHumaLocks } from './lib/humalocks.mjs'

const days = Number(process.argv.find((a) => a.startsWith('--days='))?.split('=')[1] ?? 185)
console.log(`Reading through ${RPC_LABEL}`)
const t0 = Date.now()
const cache = await scanHumaLocks({ log: (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`), backfillDays: days })
console.log(`\nDone in ${((Date.now() - t0) / 60000).toFixed(1)} min — ${cache.deposits.length} locked deposits since ${new Date(cache.oldest.time * 1000).toISOString().slice(0, 10)}`)
console.log('commitments seen:', JSON.stringify(cache.seen))
