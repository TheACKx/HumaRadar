/**
 * Huma Classic lockups, read from the deposits themselves.
 *
 * The Huma 2.0 program (HumaXep…) keeps no lockup state: a deposit's lockup is
 * an argument of the `deposit` instruction, emitted in LiquidityDepositedEvent
 * as `commitment` ("NO_COMMITMENT", "INITIAL_COMMITMENT_THREE_MONTHS",
 * "INITIAL_COMMITMENT_SIX_MONTHS") plus `commitment_auto_renewal`. So this
 * scans the program's transactions, decodes those events and keeps every
 * locked deposit in a cache, src/data/huma-locks.json — not imported by the
 * app, only committed so each daily run reads just the new transactions.
 *
 * What it cannot see: a lockup extended later in the dApp (there is no
 * instruction for it, so it is recorded off chain), and an auto-renewing
 * lockup made before the cache's first day. The tab says so.
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stringifyStore } from './gql.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const LOCKS_CACHE = resolve(HERE, '../../src/data/huma-locks.json')

export const HUMA_PROGRAM = 'HumaXepHnjaRCpjYTokxY4UtaJcmx41prQ8cxGmFC5fn'
/**
 * A Helius key, when there is one: env HELIUS_API_KEY, else the git-ignored
 * scripts/helius-key.local. Never logged — the key travels in the URL.
 */
function heliusKey() {
  if (process.env.HELIUS_API_KEY) return process.env.HELIUS_API_KEY.trim()
  try {
    return readFileSync(resolve(HERE, '../helius-key.local'), 'utf8').trim() || null
  } catch {
    return null
  }
}
const HELIUS = heliusKey()

// With a Helius key, everything goes to Helius: full history, about ten calls
// a second on the free plan. Without one, two free endpoints share the work.
// The official node has the whole history but allows about four
// getTransaction calls a second; PublicNode is fast but keeps only the last
// day or so of transactions and can't page signatures from a recent `before`.
// So signatures come from the official node, and a transaction from PublicNode
// when it is recent, else from the official node at its pace.
const OFFICIAL_RPC = HELIUS ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS}` : 'https://api.mainnet-beta.solana.com'
const RECENT_RPC = HELIUS ? null : (process.env.SOLANA_RPC ?? 'https://solana-rpc.publicnode.com')
const RECENT_SECS = 20 * 3600
/** pause before each call to the paced node: transactions are small, signature pages heavy */
const OFFICIAL_GAP_MS = HELIUS
  ? { getTransaction: 110, getSignaturesForAddress: 150 }
  : { getTransaction: 260, getSignaturesForAddress: 1200 }
export const RPC_LABEL = HELIUS ? 'Helius' : 'public Solana nodes'

export const DAYS = { INITIAL_COMMITMENT_THREE_MONTHS: 90, INITIAL_COMMITMENT_SIX_MONTHS: 180 }

const ALPH = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
export function b58(buf) {
  let n = BigInt('0x' + (Buffer.from(buf).toString('hex') || '0'))
  let s = ''
  while (n > 0n) { s = ALPH[Number(n % 58n)] + s; n /= 58n }
  for (const b of buf) { if (b === 0) s = '1' + s; else break }
  return s
}

const DEPOSITED = createHash('sha256').update('event:LiquidityDepositedEvent').digest().subarray(0, 8)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let officialTurn = Promise.resolve()
/** Spaces calls to the official node so a long scan stays under its rate limit. */
function officialSlot(method) {
  const turn = officialTurn.then(() => sleep(OFFICIAL_GAP_MS[method] ?? 500))
  officialTurn = turn
  return turn
}

export async function rpc(method, params, { url = OFFICIAL_RPC, attempt = 1 } = {}) {
  try {
    if (url === OFFICIAL_RPC) await officialSlot(method)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    })
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`)
    const j = await res.json()
    if (j.error) {
      // the public node rate-limits with a JSON-RPC error too
      if (/rate|limit|429|too many/i.test(j.error.message ?? '')) throw new Error(j.error.message)
      const e = new Error(`${method}: ${j.error.message}`)
      e.fatal = true
      throw e
    }
    return j.result
  } catch (err) {
    if (err.fatal || attempt >= 12) throw err
    await sleep(Math.min(60000, 2000 * 2 ** (attempt - 1)))
    return rpc(method, params, { url, attempt: attempt + 1 })
  }
}

/** A transaction, from wherever it can be had; null only if neither node has it. */
async function getTransaction(sig) {
  const params = [sig.signature, { maxSupportedTransactionVersion: 1, encoding: 'json', commitment: 'finalized' }]
  if (RECENT_RPC && Date.now() / 1000 - sig.blockTime < RECENT_SECS) {
    const tx = await rpc('getTransaction', params, { url: RECENT_RPC }).catch(() => null)
    if (tx) return tx
  }
  return rpc('getTransaction', params)
}

/** Every LiquidityDepositedEvent in a transaction's logs. */
function depositEvents(tx) {
  const out = []
  for (const line of tx?.meta?.logMessages ?? []) {
    if (!line.startsWith('Program data: ')) continue
    const d = Buffer.from(line.slice(14), 'base64')
    if (d.length < 92 || !d.subarray(0, 8).equals(DEPOSITED)) continue
    let o = 8
    const mode = b58(d.subarray(o, o + 32)); o += 32
    const depositor = b58(d.subarray(o, o + 32)); o += 32
    const assets = Number(d.readBigUInt64LE(o)); o += 8
    const shares = Number(d.readBigUInt64LE(o)); o += 8
    const len = d.readUInt32LE(o); o += 4
    const commitment = d.subarray(o, o + len).toString(); o += len
    const renew = d[o] === 1
    out.push({ mode, depositor, assets: assets / 1e6, shares: shares / 1e6, commitment, renew })
  }
  return out
}

export function loadLocks() {
  try {
    return JSON.parse(readFileSync(LOCKS_CACHE, 'utf8'))
  } catch {
    return { source: 'huma-2.0 LiquidityDepositedEvent', newest: null, oldest: null, seen: {}, prices: {}, deposits: [] }
  }
}

export function saveLocks(cache) {
  mkdirSync(dirname(LOCKS_CACHE), { recursive: true })
  writeFileSync(LOCKS_CACHE, stringifyStore(cache).replaceAll('{"sig":', '\n{"sig":'))
}

/** Reads each signature's transaction, a few at a time, and records its locked deposits. */
async function readTransactions(cache, sigs, log, label) {
  const ok = sigs.filter((s) => !s.err)
  let done = 0
  let next = 0
  const known = new Set(cache.deposits.map((d) => d.sig))
  const worker = async () => {
    while (next < ok.length) {
      const s = ok[next++]
      const tx = await getTransaction(s)
      if (!tx) {
        // a gap would undercount silently, so it is counted and logged
        cache.missing = (cache.missing ?? 0) + 1
        log(`  Locks  !! transaction ${s.signature.slice(0, 12)}… not found on either node`)
      }
      for (const e of depositEvents(tx)) {
        cache.seen[e.commitment] = (cache.seen[e.commitment] ?? 0) + 1
        // every deposit, locked or not, prices its mode's token: assets per share
        const last = cache.prices[e.mode]
        if (e.shares > 0 && (!last || s.blockTime >= last.time)) {
          cache.prices[e.mode] = { price: e.assets / e.shares, time: s.blockTime }
        }
        // the program takes any string here: only the dApp's two lockup values
        // lock anything ("NO_COMMITMENT", and "Classic" or "" from other
        // integrations, do not)
        if (!DAYS[e.commitment] || known.has(s.signature)) continue
        cache.deposits.push({ sig: s.signature, time: s.blockTime, ...e })
      }
      done++
      if (done % 500 === 0) log(`  Locks  ${label}: ${done}/${ok.length} transactions read`)
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
}

/** Signatures between `until` (exclusive, newer side) and the walk's start, newest first. */
async function signatures({ before, until, cutoff }) {
  const out = []
  let cursor = before
  for (;;) {
    const page = await rpc('getSignaturesForAddress', [HUMA_PROGRAM, {
      limit: 1000, ...(cursor ? { before: cursor } : {}), ...(until ? { until } : {}), commitment: 'finalized',
    }])
    if (!page.length) break
    for (const s of page) {
      if (cutoff && s.blockTime < cutoff) return out
      out.push(s)
    }
    cursor = page[page.length - 1].signature
    if (page.length < 1000) break
  }
  return out
}

/**
 * Brings the cache up to date: every transaction since the newest one read
 * and, with `backfillDays`, back to that many days ago. Saves as it goes so a
 * long backfill can be stopped and resumed.
 */
export async function scanHumaLocks({ log, backfillDays = 0 }) {
  const cache = loadLocks()
  cache.prices ??= {}

  // forward: what happened since the last run — or, on the first run, the
  // whole backfill window, read oldest first so a stopped run resumes cleanly
  const fresh = await signatures({
    until: cache.newest?.signature,
    cutoff: cache.newest ? undefined : Math.floor(Date.now() / 1000) - Math.max(1, backfillDays) * 86400,
  })
  if (fresh.length) {
    log(`  Locks  ${fresh.length} new Huma transactions`)
    // oldest first in chunks, so a crash leaves the cache consistent
    const chunks = []
    for (let i = fresh.length; i > 0; i -= 1000) chunks.push(fresh.slice(Math.max(0, i - 1000), i))
    for (const chunk of chunks) {
      await readTransactions(cache, chunk, log, 'new')
      cache.newest = { signature: chunk[0].signature, time: chunk[0].blockTime }
      cache.oldest ??= { signature: chunk[chunk.length - 1].signature, time: chunk[chunk.length - 1].blockTime }
      saveLocks(cache)
    }
  }

  // backward: the first run's history
  if (backfillDays && cache.oldest) {
    const cutoff = Math.floor(Date.now() / 1000) - backfillDays * 86400
    while (cache.oldest.time > cutoff) {
      const older = await signatures({ before: cache.oldest.signature, cutoff })
      if (!older.length) break
      for (let i = 0; i < older.length; i += 1000) {
        const chunk = older.slice(i, i + 1000)
        await readTransactions(cache, chunk, log, `back to ${new Date(chunk[chunk.length - 1].blockTime * 1000).toISOString().slice(0, 10)}`)
        const last = chunk[chunk.length - 1]
        cache.oldest = { signature: last.signature, time: last.blockTime }
        saveLocks(cache)
      }
    }
  }

  cache.deposits.sort((a, b) => a.time - b.time)
  return cache
}
