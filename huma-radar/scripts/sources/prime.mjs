/**
 * Huma Prime source — the positions of the wallets listed in PRIME
 * (scripts/tracked.mjs), read from each protocol's own public API:
 *
 *   Solana    Jupiter Lend  https://lite-api.jup.ag/lend/v1/borrow/positions?users=
 *             Kamino        https://api.kamino.finance/kamino-market/<m>/users/<w>/obligations
 *             wallet        Solana RPC token accounts, priced by Jupiter's price API
 *   Ethereum  Morpho        https://api.morpho.org/graphql  (marketPositions by user)
 *             Fluid         https://api.fluid.instadapp.io/v2/1/users/<w>/nfts
 *             wallet        Blockscout balances; PST priced at Fluid's PST price
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
import { HUMA, PRIME } from '../tracked.mjs'
import { stringifyStore } from '../lib/gql.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const STORE = resolve(HERE, '../../src/data/prime.json')

const HISTORY_DAYS = 400
const DUST = 1000

const SOLANA_RPC = 'https://api.mainnet-beta.solana.com'
const SOL_MINT = 'So11111111111111111111111111111111111111112'
const TOKEN_PROGRAMS = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb']

const round = (v) => Math.round(v)
const units = (raw, decimals) => Number(raw) / 10 ** Number(decimals)

async function getJson(url, opts = {}, attempt = 1) {
  try {
    const res = await fetch(url, {
      ...opts,
      headers: { accept: 'application/json', 'content-type': 'application/json', ...(opts.headers ?? {}) },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    if (attempt >= 3) throw new Error(`${new URL(url).host}: ${err.message}`)
    await new Promise((r) => setTimeout(r, 1000 * attempt))
    return getJson(url, opts, attempt + 1)
  }
}

/** The Huma tab's own names for the venues, so both tabs say the same thing. */
const JUP_NAMES = new Map(HUMA.juplend.filter((v) => v.name).map((v) => [Number(v.id), v.name]))
const FLUID_NAMES = new Map(HUMA.fluid.filter((v) => v.name).map((v) => [Number(v.id), v.name]))
const MORPHO_NAMES = new Map(HUMA.morphoMarkets.map((m) => [m.marketId.toLowerCase(), m.name]))

// ---------------------------------------------------------------- Solana

async function jupiterPositions(wallet) {
  const list = await getJson(`https://lite-api.jup.ag/lend/v1/borrow/positions?users=${wallet}`)
  return list.map((p) => {
    const st = p.vault.supplyToken
    const bt = p.vault.borrowToken
    return {
      protocol: 'JupLend',
      market: JUP_NAMES.get(Number(p.vaultId)) ?? `JupLend ${st.symbol} / ${bt.symbol}`,
      venue: `Jupiter Lend #${p.vaultId}`,
      collateral: st.symbol,
      supplied: units(p.supply, st.decimals) * Number(st.price),
      borrowed: units(p.borrow, bt.decimals) * Number(bt.price),
    }
  })
}

async function kaminoPositions(wallet) {
  const out = []
  for (const market of PRIME.kaminoMarkets) {
    const list = await getJson(`https://api.kamino.finance/kamino-market/${market}/users/${wallet}/obligations`)
    for (const o of list) {
      const s = o.refreshedStats ?? {}
      out.push({
        protocol: 'Kamino',
        market: 'Kamino PST',
        venue: 'Kamino Lend',
        collateral: 'PST',
        supplied: Number(s.userTotalDeposit ?? 0),
        borrowed: Number(s.userTotalBorrow ?? 0),
      })
    }
  }
  return out
}

async function solanaWallet(wallet) {
  const rpc = (method, params) =>
    getJson(SOLANA_RPC, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
      .then((j) => {
        if (j.error) throw new Error(`Solana RPC: ${j.error.message}`)
        return j.result
      })

  const lamports = (await rpc('getBalance', [wallet])).value
  const held = new Map([[SOL_MINT, lamports / 1e9]])
  for (const programId of TOKEN_PROGRAMS) {
    const res = await rpc('getTokenAccountsByOwner', [wallet, { programId }, { encoding: 'jsonParsed' }])
    for (const a of res.value) {
      const info = a.account.data.parsed.info
      const amount = Number(info.tokenAmount.uiAmount ?? 0)
      if (amount > 0) held.set(info.mint, (held.get(info.mint) ?? 0) + amount)
    }
  }

  // Jupiter prices tradable tokens only, so position NFTs and spam count as zero
  const ids = [...held.keys()]
  const prices = {}
  for (let i = 0; i < ids.length; i += 50) {
    Object.assign(prices, await getJson(`https://lite-api.jup.ag/price/v3?ids=${ids.slice(i, i + 50).join(',')}`))
  }
  let value = 0
  for (const [mint, amount] of held) value += amount * Number(prices[mint]?.usdPrice ?? 0)
  return value
}

// ---------------------------------------------------------------- Ethereum

const MORPHO_QUERY = `query P($u: [String!]) {
  marketPositions(first: 100, where: { userAddress_in: $u, chainId_in: [1] }) {
    items {
      market { marketId loanAsset { symbol } collateralAsset { symbol } }
      state { collateralUsd borrowAssetsUsd }
    }
  }
}`

async function morphoPositions(wallet) {
  const j = await getJson('https://api.morpho.org/graphql', {
    method: 'POST',
    body: JSON.stringify({ query: MORPHO_QUERY, variables: { u: [wallet] } }),
  })
  if (j.errors?.length) throw new Error(`Morpho API: ${j.errors[0].message}`)
  return j.data.marketPositions.items.map((p) => ({
    protocol: 'Morpho',
    market:
      MORPHO_NAMES.get(p.market.marketId.toLowerCase()) ??
      `Morpho ${p.market.collateralAsset?.symbol} / ${p.market.loanAsset.symbol}`,
    venue: 'Morpho Blue',
    collateral: p.market.collateralAsset?.symbol ?? '',
    supplied: Number(p.state.collateralUsd ?? 0),
    borrowed: Number(p.state.borrowAssetsUsd ?? 0),
  }))
}

/** Fluid's per-wallet positions; also hands back its PST price for the wallet balance. */
async function fluidPositions(wallet) {
  const list = await getJson(`https://api.fluid.instadapp.io/v2/1/users/${wallet}/nfts`)
  let pstPrice = null
  const positions = list.map((p) => {
    const st = p.vault.supplyToken.token0
    const bt = p.vault.borrowToken.token0
    if (st.address.toLowerCase() === PRIME.pst.ethereum) pstPrice = Number(st.price)
    return {
      protocol: 'Fluid',
      market: FLUID_NAMES.get(Number(p.vault.id)) ?? `Fluid ${st.symbol} / ${bt.symbol}`,
      venue: `Fluid #${p.vault.id}`,
      collateral: st.symbol,
      supplied: units(p.supply, st.decimals) * Number(st.price),
      borrowed: units(p.borrow, bt.decimals) * Number(bt.price),
    }
  })
  return { positions, pstPrice }
}

async function ethereumWallet(wallet, pstPrice) {
  const base = `https://eth.blockscout.com/api/v2/addresses/${wallet}`
  const addr = await getJson(base)
  let value = units(addr.coin_balance ?? 0, 18) * Number(addr.exchange_rate ?? 0)
  const tokens = await getJson(`${base}/token-balances`)
  for (const t of tokens) {
    if (t.token?.type !== 'ERC-20') continue
    const amount = units(t.value, t.token.decimals ?? 18)
    // Blockscout has no price for PST; tokens it can't price (airdropped spam) count as zero
    const price =
      t.token.address_hash?.toLowerCase() === PRIME.pst.ethereum ? pstPrice : Number(t.token.exchange_rate ?? 0)
    value += amount * (price ?? 0)
  }
  return value
}

// ---------------------------------------------------------------- store

async function readWallet(w) {
  if (w.chain === 'solana') {
    const positions = [...(await jupiterPositions(w.address)), ...(await kaminoPositions(w.address))]
    return { positions, wallet: await solanaWallet(w.address) }
  }
  if (w.chain === 'ethereum') {
    const morpho = await morphoPositions(w.address)
    const fluid = await fluidPositions(w.address)
    if (fluid.pstPrice == null && fluid.positions.length === 0) {
      // no Fluid position to price PST by: fall back to Jupiter's PST price
      const p = await getJson(`https://lite-api.jup.ag/price/v3?ids=${PRIME.pst.solana}`)
      fluid.pstPrice = Number(p[PRIME.pst.solana]?.usdPrice ?? 0)
    }
    return { positions: [...morpho, ...fluid.positions], wallet: await ethereumWallet(w.address, fluid.pstPrice) }
  }
  throw new Error(`unknown chain ${w.chain}`)
}

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
      read = await readWallet(w)
    } catch (err) {
      log(`  Prime  ${w.label.padEnd(18)} !! ${err.message} — no point for today`)
      continue
    }

    const positions = read.positions
      .filter((p) => p.supplied >= DUST || p.borrowed >= DUST)
      .map((p) => ({ ...p, supplied: round(p.supplied), borrowed: round(p.borrowed) }))
      .sort((a, b) => b.supplied - a.supplied)
    const supplied = positions.reduce((a, p) => a + p.supplied, 0)
    const borrowed = positions.reduce((a, p) => a + p.borrowed, 0)
    const wallet = round(read.wallet)
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
