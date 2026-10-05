/**
 * Tenure source — PST locked for 3 and 6 months, from the two places a lockup
 * can be chosen:
 *
 *   Huma Prime    exact. The Prime vault program (prm1azd…) keeps each lockup
 *                 option's assets in its VaultState: `lockup_states`, one entry
 *                 per LockupConfig (0, 90 or 180 days), in USDC.
 *   Huma dApp     estimated. The Huma 2.0 program keeps no lockup state, so the
 *   (Classic and  locked deposits come from scripts/lib/humalocks.mjs: a deposit
 *    Maxi)        made with a 3- or 6-month commitment counts until its lockup
 *                 ends, or for as long as it auto-renews, valued at its mode
 *                 token's latest price.
 *
 * It also writes when that PST unlocks, month by month. Prime's dates are its
 * DepositRecords' own `lockup_expires_at` — exact — split by whether a deposit
 * auto-renews (it rolls over instead of unlocking). A record doesn't say which
 * lockup it is in, and an extended or renewed one keeps its first deposit
 * date, so Prime's schedule is by unlock date only, not by 3 or 6 months. The
 * dApp's dates are deposit time + 90 or 180 days.
 *
 * Neither program serves history, so the daily series builds from the first
 * run. Written to src/data/tenure.json.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stringifyStore } from '../lib/gql.mjs'
import { DAYS, b58, saveLocks, scanHumaLocks } from '../lib/humalocks.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const STORE = resolve(HERE, '../../src/data/tenure.json')

const PRIME_PROGRAM = 'prm1azdDGzyqP76s3Hv2nuG3uLnBgR5u2d7pANwmmzC'
const RPC = 'https://api.mainnet-beta.solana.com'
const HISTORY_DAYS = 400

/** Anchor account discriminators, from the Prime program's on-chain IDL. */
const DISC = {
  LockupConfig: [242, 18, 94, 200, 184, 66, 129, 215],
  VaultState: [228, 196, 82, 165, 98, 210, 235, 152],
  DepositRecord: [83, 232, 10, 31, 251, 49, 189, 167],
}

const round = (v) => Math.round(v)

async function programAccounts(discriminator) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'getProgramAccounts',
      params: [PRIME_PROGRAM, { encoding: 'base64', filters: [{ memcmp: { offset: 0, bytes: b58(Buffer.from(discriminator)) } }] }],
    }),
  })
  const j = await res.json()
  if (j.error) throw new Error(`Solana RPC: ${j.error.message}`)
  return j.result.map((a) => ({ key: a.pubkey, data: Buffer.from(a.account.data[0], 'base64') }))
}

/**
 * Prime's assets and share supply by lockup length in days, e.g.
 * { assets: { 0: …, 90: …, 180: … }, supply: { … } }, USD and shares.
 */
async function primeLockups() {
  const days = new Map()
  for (const a of await programAccounts(DISC.LockupConfig)) {
    // bump u8 · nft_collection pubkey · lockup_duration_secs u64
    days.set(a.key, Math.round(Number(a.data.readBigUInt64LE(41)) / 86400))
  }
  const out = {}
  const supply = {}
  for (const { data: d } of await programAccounts(DISC.VaultState)) {
    // bump, status, RedemptionQueue (4 u64 + gating 16+40 + 40), two u64 reserves
    let o = 10 + 32 + 56 + 40 + 16
    const n = d.readUInt32LE(o); o += 4
    for (let i = 0; i < n; i++, o += 176) {
      const key = b58(d.subarray(o, o + 32))
      const assets = Number(d.readBigUInt64LE(o + 32)) / 1e6 // USDC, 6 decimals
      const shares = Number(d.readBigUInt64LE(o + 48)) / 1e6
      const len = days.get(key)
      if (len === undefined) throw new Error(`Prime lockup ${key} has no LockupConfig`)
      out[len] = (out[len] ?? 0) + assets
      supply[len] = (supply[len] ?? 0) + shares
    }
  }
  if (!Object.keys(out).length) throw new Error('no Prime vault state found')
  return { assets: out, supply }
}

const monthOf = (secs) => new Date(secs * 1000).toISOString().slice(0, 7)

/**
 * When locked PST unlocks, by month. Prime's locked deposits are valued at
 * the locked options' blended share price — a record doesn't name its option,
 * and the two prices differ by well under 1%.
 */
async function unlockSchedule(prime, cache, now) {
  const months = new Map()
  const at = (m) => {
    if (!months.has(m)) months.set(m, { month: m, primeUnlock: 0, primeRenew: 0, dapp3: 0, dapp6: 0 })
    return months.get(m)
  }

  const lockedAssets = (prime.assets[90] ?? 0) + (prime.assets[180] ?? 0)
  const lockedSupply = (prime.supply[90] ?? 0) + (prime.supply[180] ?? 0)
  const price = lockedSupply ? lockedAssets / lockedSupply : 0
  for (const { data: d } of await programAccounts(DISC.DepositRecord)) {
    // bump u8 · shares u64 · lockup_auto_renewal bool · deposited_at u64 · lockup_expires_at u64
    const shares = Number(d.readBigUInt64LE(9)) / 1e6
    const renew = d[17] === 1
    const deposited = Number(d.readBigUInt64LE(18))
    const expires = Number(d.readBigUInt64LE(26))
    if (!shares || expires <= now || expires - deposited < 30 * 86400) continue // no-lockup or already free
    const row = at(monthOf(expires))
    row[renew ? 'primeRenew' : 'primeUnlock'] += shares * price
  }

  for (const d of cache.deposits) {
    const len = DAYS[d.commitment]
    if (!len || d.renew) continue
    const ends = d.time + len * 86400
    if (ends <= now) continue
    const value = d.shares * (cache.prices?.[d.mode]?.price ?? d.assets / d.shares)
    at(monthOf(ends))[len === 90 ? 'dapp3' : 'dapp6'] += value
  }

  const rows = [...months.values()].sort((a, b) => a.month.localeCompare(b.month))
  for (const r of rows) for (const k of ['primeUnlock', 'primeRenew', 'dapp3', 'dapp6']) r[k] = round(r[k])
  return rows
}

/** Huma dApp deposits still inside their lockup at `now`, by length, at today's token prices. */
function dappLockups(cache, now) {
  const out = { 90: 0, 180: 0 }
  const wallets = { 90: new Set(), 180: new Set() }
  let renewing = 0
  for (const d of cache.deposits) {
    const len = DAYS[d.commitment]
    if (!len) continue
    if (!d.renew && d.time + len * 86400 <= now) continue
    const price = cache.prices?.[d.mode]?.price ?? d.assets / d.shares
    const value = d.shares * price
    out[len] += value
    wallets[len].add(d.depositor)
    if (d.renew) renewing += value
  }
  return { out, wallets: { 90: wallets[90].size, 180: wallets[180].size }, renewing }
}

/** Expired, non-renewing lockups only weigh the cache down; a week's grace keeps the edge visible. */
function prune(cache, now) {
  cache.deposits = cache.deposits.filter((d) => d.renew || d.time + (DAYS[d.commitment] + 7) * 86400 > now)
}

function loadStore() {
  try {
    return JSON.parse(readFileSync(STORE, 'utf8'))
  } catch {
    return { source: 'huma-prime vault state, huma-2.0 deposit events', generatedAt: null, history: [] }
  }
}

export async function collectTenure({ today, log }) {
  const store = loadStore()

  let primeState
  try {
    primeState = await primeLockups()
  } catch (err) {
    log(`  Tenure Prime !! ${err.message} — no point for today`)
    return { days: 0 }
  }

  let cache
  try {
    cache = await scanHumaLocks({ log })
  } catch (err) {
    log(`  Tenure dApp !! ${err.message} — no point for today`)
    return { days: 0 }
  }
  if (!cache.oldest) {
    log('  Tenure dApp !! no locked-deposit history yet — run scripts/backfill-huma-locks.mjs once')
    return { days: 0 }
  }

  const now = Math.floor(Date.now() / 1000)
  const prime = primeState.assets
  const dapp = dappLockups(cache, now)
  let schedule = null
  try {
    schedule = await unlockSchedule(primeState, cache, now)
  } catch (err) {
    log(`  Tenure unlocks !! ${err.message} — keeping the last schedule`)
  }
  prune(cache, now)
  saveLocks(cache)

  const point = {
    date: today,
    prime: { none: round(prime[0] ?? 0), m3: round(prime[90] ?? 0), m6: round(prime[180] ?? 0) },
    dapp: {
      m3: round(dapp.out[90]),
      m6: round(dapp.out[180]),
      wallets3: dapp.wallets[90],
      wallets6: dapp.wallets[180],
      renewing: round(dapp.renewing),
    },
  }
  store.history = [...store.history.filter((h) => h.date !== today), point]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-HISTORY_DAYS)
  store.dappSince = new Date(cache.oldest.time * 1000).toISOString().slice(0, 10)
  if (schedule) store.unlocks = { asOf: today, months: schedule }
  store.generatedAt = new Date().toISOString()
  mkdirSync(dirname(STORE), { recursive: true })
  writeFileSync(STORE, stringifyStore(store))

  const m = (v) => `$${(v / 1e6).toFixed(2)}M`
  log(
    `  Tenure Prime 3mo ${m(point.prime.m3)} · 6mo ${m(point.prime.m6)} · none ${m(point.prime.none)}` +
      ` | dApp 3mo ${m(point.dapp.m3)} (${point.dapp.wallets3} wallets) · 6mo ${m(point.dapp.m6)} (${point.dapp.wallets6})`,
  )
  return { days: 1 }
}
