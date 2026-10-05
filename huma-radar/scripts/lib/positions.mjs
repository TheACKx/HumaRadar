/**
 * One wallet's lending positions and idle balances, read from each protocol's
 * own public API — shared by the Prime wallets (sources/prime.mjs) and the Top
 * Wallets list (sources/topwallets.mjs):
 *
 *   Solana    Jupiter Lend  https://lite-api.jup.ag/lend/v1/borrow/positions?users=
 *             Kamino        https://api.kamino.finance/kamino-market/<m>/users/<w>/obligations
 *             wallet        Solana RPC token accounts, priced by Jupiter's price API
 *   Ethereum  Morpho        https://api.morpho.org/graphql  (marketPositions by user)
 *             Fluid         https://api.fluid.instadapp.io/v2/1/users/<w>/nfts
 *             wallet        Blockscout balances; PST priced at Fluid's or Jupiter's PST price
 *
 * Every position says whether its collateral is PST (or a PST pair), so a
 * caller can count PST exposure without naming markets. Fluid's smart debt
 * and smart collateral come in pool shares, valued at the pool's per-share
 * token amounts.
 */

import { HUMA, PRIME } from '../tracked.mjs'

const SOLANA_RPC = 'https://api.mainnet-beta.solana.com'
const SOL_MINT = 'So11111111111111111111111111111111111111112'
const TOKEN_PROGRAMS = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb']
const ZERO = '0x0000000000000000000000000000000000000000'

const units = (raw, decimals) => Number(raw) / 10 ** Number(decimals)
const isPstSymbol = (s) => /(^|[^a-z])PST([^a-z]|$)/i.test(s ?? '') && !/mPST/.test(s ?? '')

export async function getJson(url, opts = {}, attempt = 1) {
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

/** The Huma tab's own names for the venues, so every tab says the same thing. */
const JUP_NAMES = new Map(HUMA.juplend.filter((v) => v.name).map((v) => [Number(v.id), v.name]))
const FLUID_NAMES = new Map(HUMA.fluid.filter((v) => v.name).map((v) => [Number(v.id), v.name]))
const MORPHO_NAMES = new Map(HUMA.morphoMarkets.map((m) => [m.marketId.toLowerCase(), m.name]))

let pstPriceCache = null
/** PST's price from Jupiter, once per run. */
export async function pstPrice() {
  if (pstPriceCache == null) {
    const p = await getJson(`https://lite-api.jup.ag/price/v3?ids=${PRIME.pst.solana}`)
    pstPriceCache = Number(p[PRIME.pst.solana]?.usdPrice ?? 0)
  }
  return pstPriceCache
}

// ---------------------------------------------------------------- Solana

/** A Jupiter Lend token's USD value, or null for one the API gives no price for (a DEX pair). */
const jupValue = (raw, t) => (t?.price != null && t.decimals != null ? units(raw, t.decimals) * Number(t.price) : null)

async function jupiterPositions(wallet, log) {
  const list = await getJson(`https://lite-api.jup.ag/lend/v1/borrow/positions?users=${wallet}`)
  const out = []
  for (const p of list) {
    if (Number(p.supply) === 0 && Number(p.borrow) === 0) continue
    const st = p.vault.supplyToken
    const bt = p.vault.borrowToken
    const supplied = jupValue(p.supply, st)
    const borrowed = Number(p.borrow) === 0 ? 0 : jupValue(p.borrow, bt)
    if (supplied == null || borrowed == null) {
      log?.(`    Jupiter #${p.vaultId} ${st?.symbol ?? '?'} / ${bt?.symbol ?? '?'}: no price for a pair token — left out`)
      continue
    }
    out.push({
      protocol: 'JupLend',
      market: JUP_NAMES.get(Number(p.vaultId)) ?? `JupLend ${st.symbol} / ${bt.symbol}`,
      venue: `Jupiter Lend #${p.vaultId}`,
      collateral: st.symbol,
      pst: isPstSymbol(st.symbol),
      supplied,
      borrowed,
    })
  }
  return out
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
        // the Huma market's only collateral is PST
        pst: true,
        supplied: Number(s.userTotalDeposit ?? 0),
        borrowed: Number(s.userTotalBorrow ?? 0),
      })
    }
  }
  return out
}

/** Everything a Solana wallet holds, priced by Jupiter; tokens it can't price count as zero. */
async function solanaHoldings(wallet) {
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

  const ids = [...held.keys()]
  const prices = {}
  for (let i = 0; i < ids.length; i += 50) {
    Object.assign(prices, await getJson(`https://lite-api.jup.ag/price/v3?ids=${ids.slice(i, i + 50).join(',')}`))
  }
  let value = 0
  for (const [mint, amount] of held) value += amount * Number(prices[mint]?.usdPrice ?? 0)
  const pstAmount = held.get(PRIME.pst.solana) ?? 0
  return { value, pst: { amount: pstAmount, usd: pstAmount * Number(prices[PRIME.pst.solana]?.usdPrice ?? 0) } }
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
  return j.data.marketPositions.items
    .filter((p) => Number(p.state.collateralUsd ?? 0) > 0 || Number(p.state.borrowAssetsUsd ?? 0) > 0)
    .map((p) => ({
      protocol: 'Morpho',
      market:
        MORPHO_NAMES.get(p.market.marketId.toLowerCase()) ??
        `Morpho ${p.market.collateralAsset?.symbol} / ${p.market.loanAsset.symbol}`,
      venue: 'Morpho Blue',
      collateral: p.market.collateralAsset?.symbol ?? '',
      pst: isPstSymbol(p.market.collateralAsset?.symbol),
      supplied: Number(p.state.collateralUsd ?? 0),
      borrowed: Number(p.state.borrowAssetsUsd ?? 0),
    }))
}

/**
 * A Fluid side's USD value. A plain token is an amount; a smart side (a DEX
 * pair, token1 set) is pool shares (18 decimals), each worth the pool's
 * per-share amounts of both tokens.
 */
function fluidValue(raw, side, dex) {
  const t0 = side.token0
  const t1 = side.token1
  if (!t1 || !t1.address || t1.address === ZERO) return units(raw, t0.decimals) * Number(t0.price)
  const shares = units(raw, 18)
  return shares * (units(dex.token0PerShare, t0.decimals) * Number(t0.price) + units(dex.token1PerShare, t1.decimals) * Number(t1.price))
}

/** Fluid's per-wallet positions; also hands back its PST price for the wallet balance. */
async function fluidPositions(wallet) {
  const list = await getJson(`https://api.fluid.instadapp.io/v2/1/users/${wallet}/nfts`)
  let price = null
  const positions = []
  for (const p of list) {
    if (Number(p.supply) === 0 && Number(p.borrow) === 0) continue
    const v = p.vault
    const st = v.supplyToken
    const bt = v.borrowToken
    if (st.token0.address.toLowerCase() === PRIME.pst.ethereum) price = Number(st.token0.price)
    const pair = (side) => [side.token0?.symbol, side.token1?.address && side.token1.address !== ZERO ? side.token1.symbol : null]
      .filter(Boolean).join('-')
    positions.push({
      protocol: 'Fluid',
      market: FLUID_NAMES.get(Number(v.id)) ?? `Fluid ${pair(st)} / ${pair(bt)}`,
      venue: `Fluid #${v.id}`,
      collateral: pair(st),
      pst: isPstSymbol(st.token0.symbol) || isPstSymbol(st.token1?.symbol),
      supplied: fluidValue(p.supply, st, v.supplyDexData ?? {}),
      borrowed: fluidValue(p.borrow, bt, v.borrowDexData ?? {}),
    })
  }
  return { positions, price }
}

async function ethereumHoldings(wallet, price) {
  const base = `https://eth.blockscout.com/api/v2/addresses/${wallet}`
  const addr = await getJson(base)
  let value = units(addr.coin_balance ?? 0, 18) * Number(addr.exchange_rate ?? 0)
  let pstAmount = 0
  const tokens = await getJson(`${base}/token-balances`)
  for (const t of tokens) {
    if (t.token?.type !== 'ERC-20') continue
    const amount = units(t.value, t.token.decimals ?? 18)
    const isPst = t.token.address_hash?.toLowerCase() === PRIME.pst.ethereum
    if (isPst) pstAmount += amount
    // Blockscout has no price for PST; tokens it can't price (airdropped spam) count as zero
    value += amount * (isPst ? price : Number(t.token.exchange_rate ?? 0))
  }
  return { value, pst: { amount: pstAmount, usd: pstAmount * price } }
}

// ---------------------------------------------------------------- one wallet

/**
 * A wallet's positions and holdings: `positions` (all of them, each marked
 * `pst`), `walletValue` (every idle token, USD) and `pst` (idle PST alone).
 */
export async function readWallet({ chain, address }, log) {
  if (chain === 'solana') {
    const positions = [...(await jupiterPositions(address, log)), ...(await kaminoPositions(address))]
    const h = await solanaHoldings(address)
    return { positions, walletValue: h.value, pst: h.pst }
  }
  if (chain === 'ethereum') {
    const morpho = await morphoPositions(address)
    const fluid = await fluidPositions(address)
    const price = fluid.price ?? (await pstPrice())
    const h = await ethereumHoldings(address, price)
    return { positions: [...morpho, ...fluid.positions], walletValue: h.value, pst: h.pst }
  }
  throw new Error(`unknown chain ${chain}`)
}
