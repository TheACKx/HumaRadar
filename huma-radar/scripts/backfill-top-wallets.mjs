#!/usr/bin/env node
/**
 * One-time history for the Top Wallets list, where the sources keep one:
 *
 *   node scripts/backfill-top-wallets.mjs --days=90
 *
 *   positions  only when every PST position is on Morpho or Kamino, whose APIs
 *              serve a position's daily collateral and debt (Morpho's
 *              historicalState, Kamino's obligation metrics history). Jupiter
 *              Lend and Fluid serve current positions only, so a wallet using
 *              them starts from its first daily collection instead.
 *   held       Solana: the PST token accounts' own transactions give the
 *              balance after each change. Ethereum: the address's PST
 *              transfers on Blockscout, walked back from today's balance. Both
 *              valued at DefiLlama's daily PST price.
 *
 * Each address follows its own `count`, else the entry's.
 *
 * Fills only days the daily collector hasn't written, and marks them
 * `backfilled`. Safe to rerun.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRIME, TOP_WALLETS } from './tracked.mjs'
import { stringifyStore } from './lib/gql.mjs'
import { getJson, readWallet } from './lib/positions.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const STORE = resolve(HERE, '../src/data/topwallets.json')
const RPC = 'https://api.mainnet-beta.solana.com'

const days = Number(process.argv.find((a) => a.startsWith('--days='))?.split('=')[1] ?? 90)
const now = Math.floor(Date.now() / 1000)
const start = now - days * 86400
const dateOf = (secs) => new Date(secs * 1000).toISOString().slice(0, 10)
const round = (v) => Math.round(v)
const rpc = (method, params) =>
  getJson(RPC, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then((j) => {
    if (j.error) throw new Error(`Solana RPC: ${j.error.message}`)
    return j.result
  })

/** Every date in the window, oldest first, today excluded (the collector owns today). */
const dates = []
for (let t = start; t < now - 86400 / 2; t += 86400) dates.push(dateOf(t))
const today = dateOf(now)

/** PST's daily price from DefiLlama, carried forward over gaps. */
async function pstPrices() {
  const j = await getJson(`https://coins.llama.fi/chart/solana:${PRIME.pst.solana}?start=${start - 86400}&span=${days + 2}&period=1d`)
  const byDate = new Map((Object.values(j.coins)[0]?.prices ?? []).map((p) => [dateOf(p.timestamp), p.price]))
  const out = new Map()
  let last = null
  for (const d of dates) {
    last = byDate.get(d) ?? last
    out.set(d, last)
  }
  return out
}

/** Morpho PST markets' collateral and debt per day for one address, USD. */
async function morphoHistory(address) {
  const opts = `{ startTimestamp: ${start}, endTimestamp: ${now}, interval: DAY }`
  const query = `{ marketPositions(first: 100, where: { userAddress_in: ["${address}"], chainId_in: [1] }) { items {
    market { collateralAsset { symbol } }
    historicalState { collateralUsd(options: ${opts}) { x y } borrowAssetsUsd(options: ${opts}) { x y } } } } }`
  const j = await getJson('https://api.morpho.org/graphql', { method: 'POST', body: JSON.stringify({ query }) })
  if (j.errors?.length) throw new Error(`Morpho API: ${j.errors[0].message}`)
  const supplied = new Map()
  const borrowed = new Map()
  for (const it of j.data.marketPositions.items) {
    if (!/^PST$/i.test(it.market.collateralAsset?.symbol ?? '')) continue
    for (const p of it.historicalState.collateralUsd ?? []) supplied.set(dateOf(p.x), (supplied.get(dateOf(p.x)) ?? 0) + Number(p.y ?? 0))
    for (const p of it.historicalState.borrowAssetsUsd ?? []) borrowed.set(dateOf(p.x), (borrowed.get(dateOf(p.x)) ?? 0) + Number(p.y ?? 0))
  }
  return { supplied, borrowed }
}

/** Kamino obligations' deposits and debt per day for one wallet, USD — the Huma market's only collateral is PST. */
async function kaminoHistory(wallet) {
  const supplied = new Map()
  const borrowed = new Map()
  const from = new Date(start * 1000).toISOString()
  const to = new Date(now * 1000).toISOString()
  for (const market of PRIME.kaminoMarkets) {
    const obligations = await getJson(`https://api.kamino.finance/kamino-market/${market}/users/${wallet}/obligations`)
    for (const o of obligations) {
      const j = await getJson(`https://api.kamino.finance/v2/kamino-market/${market}/obligations/${o.obligationAddress}/metrics/history?env=mainnet-beta&start=${from}&end=${to}`)
      for (const h of j.history ?? []) {
        const d = h.timestamp.slice(0, 10)
        supplied.set(d, (supplied.get(d) ?? 0) + Number(h.refreshedStats?.userTotalDeposit ?? 0))
        borrowed.set(d, (borrowed.get(d) ?? 0) + Number(h.refreshedStats?.userTotalBorrow ?? 0))
      }
    }
  }
  return { supplied, borrowed }
}

/** A Solana wallet's PST balance at the end of each day, from its PST accounts' transactions. */
async function solanaPstHistory(owner) {
  const accounts = (await rpc('getTokenAccountsByOwner', [owner, { mint: PRIME.pst.solana }, { encoding: 'jsonParsed' }])).value
  const total = new Map(dates.map((d) => [d, 0]))
  for (const acc of accounts) {
    let balance = Number(acc.account.data.parsed.info.tokenAmount.uiAmount ?? 0) // now
    const sigs = (await rpc('getSignaturesForAddress', [acc.pubkey, { limit: 1000 }])).filter((s) => !s.err)
    // walk back from today: before each transaction the balance was its pre-balance
    const changes = []
    for (const s of sigs) {
      if (s.blockTime < start) break
      const tx = await rpc('getTransaction', [s.signature, { maxSupportedTransactionVersion: 1, encoding: 'json' }])
      const keys = [
        ...tx.transaction.message.accountKeys,
        ...(tx.meta.loadedAddresses?.writable ?? []),
        ...(tx.meta.loadedAddresses?.readonly ?? []),
      ]
      const i = keys.indexOf(acc.pubkey)
      const pre = tx.meta.preTokenBalances.find((b) => b.accountIndex === i)
      changes.push({ time: s.blockTime, before: Number(pre?.uiTokenAmount.uiAmount ?? 0) })
    }
    // newest first: for each day, the balance at its end
    let ci = 0
    for (let k = dates.length - 1; k >= 0; k--) {
      const endOfDay = Date.parse(`${dates[k]}T23:59:59Z`) / 1000
      while (ci < changes.length && changes[ci].time > endOfDay) balance = changes[ci++].before
      total.set(dates[k], total.get(dates[k]) + balance)
    }
  }
  return total
}

/** An Ethereum address's PST balance at the end of each day, from its PST transfers on Blockscout. */
async function ethereumPstHistory(address) {
  const base = `https://eth.blockscout.com/api/v2/addresses/${address}`
  const me = address.toLowerCase()
  const tokens = await getJson(`${base}/token-balances`)
  const now = tokens.find((t) => t.token?.address_hash?.toLowerCase() === PRIME.pst.ethereum)
  let balance = now ? Number(now.value) / 10 ** Number(now.token.decimals ?? 18) : 0

  // newest first, back to the window's start
  const transfers = []
  let params = ''
  for (let page = 0; page < 50; page++) {
    const j = await getJson(`${base}/token-transfers?type=ERC-20&token=${PRIME.pst.ethereum}${params}`)
    let done = false
    for (const t of j.items ?? []) {
      const time = Date.parse(t.timestamp) / 1000
      if (time < start) { done = true; break }
      const value = Number(t.total?.value ?? 0) / 10 ** Number(t.total?.decimals ?? 18)
      const sign = (t.to?.hash?.toLowerCase() === me ? 1 : 0) - (t.from?.hash?.toLowerCase() === me ? 1 : 0)
      if (sign) transfers.push({ time, delta: sign * value })
    }
    if (done || !j.next_page_params) break
    params = '&' + new URLSearchParams(j.next_page_params).toString()
  }

  const out = new Map()
  let ti = 0
  for (let k = dates.length - 1; k >= 0; k--) {
    const endOfDay = Date.parse(`${dates[k]}T23:59:59Z`) / 1000
    // undo every transfer after this day's end
    while (ti < transfers.length && transfers[ti].time > endOfDay) balance -= transfers[ti++].delta
    out.set(dates[k], Math.max(0, balance))
  }
  return out
}

const store = JSON.parse(readFileSync(STORE, 'utf8'))
const prices = await pstPrices()

for (const t of TOP_WALLETS) {
  const entry = store.wallets[t.id]
  if (!entry) { console.log(`${t.name}: not collected yet — run the collector first`); continue }

  const supplied = new Map(dates.map((d) => [d, 0]))
  const borrowed = new Map(dates.map((d) => [d, 0]))
  const held = new Map(dates.map((d) => [d, 0]))
  let ok = true

  for (const a of t.addresses) {
    const count = a.count ?? t.count
    if (count.positions) {
      const current = await readWallet(a)
      const other = current.positions.filter((p) => p.pst && !['Morpho', 'Kamino'].includes(p.protocol) && p.supplied >= 1000)
      if (other.length) {
        console.log(`${t.name}: PST positions on ${[...new Set(other.map((p) => p.protocol))].join(', ')} keep no history — starts from daily collection`)
        ok = false
        break
      }
      if (a.chain === 'solana') {
        const h = await kaminoHistory(a.address)
        for (const d of dates) {
          supplied.set(d, supplied.get(d) + (h.supplied.get(d) ?? 0))
          borrowed.set(d, borrowed.get(d) + (h.borrowed.get(d) ?? 0))
        }
      }
      if (a.chain === 'ethereum') {
        const h = await morphoHistory(a.address)
        for (const d of dates) {
          supplied.set(d, supplied.get(d) + (h.supplied.get(d) ?? 0))
          borrowed.set(d, borrowed.get(d) + (h.borrowed.get(d) ?? 0))
        }
      }
    }
    if (count.held) {
      const h = a.chain === 'solana' ? await solanaPstHistory(a.address) : await ethereumPstHistory(a.address)
      for (const d of dates) held.set(d, held.get(d) + h.get(d) * (prices.get(d) ?? 0))
    }
  }
  if (!ok) continue

  const have = new Set(entry.history.map((h) => h.date))
  let added = 0
  for (const d of dates) {
    if (have.has(d) || d === today) continue
    const exposure = supplied.get(d) + held.get(d)
    if (exposure < 1000) continue // before the wallet held any PST (dust aside)
    entry.history.push({
      date: d,
      exposure: round(exposure),
      supplied: round(supplied.get(d)),
      borrowed: round(borrowed.get(d)),
      held: round(held.get(d)),
      positions: [],
      backfilled: true,
    })
    added++
  }
  entry.history.sort((a, b) => a.date.localeCompare(b.date))
  console.log(`${t.name}: ${added} days added (${entry.history[0].date} → ${entry.history[entry.history.length - 1].date})`)
}

writeFileSync(STORE, stringifyStore(store))
