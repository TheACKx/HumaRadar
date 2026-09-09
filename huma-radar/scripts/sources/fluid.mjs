/**
 * Fluid source — https://api.fluid.instadapp.io/v2/<chainId>/vaults/<id>
 *
 * Fluid borrow vaults pair a collateral token with a debt token, so "supplied"
 * here is collateral value, not lendable liquidity. Two shapes exist:
 *
 *   type 1 — one collateral token, one debt token. Amounts are plain token
 *            units; the vault-level rate is `borrowRate.vault.rate`.
 *   type 4 — smart collateral and smart debt, both backed by a DEX pair.
 *            `totalSupply` / `totalBorrow` are 18-decimal *shares*; each side's
 *            token amounts come from `token0PerShare` / `token1PerShare`.
 *            The borrow rate blends both legs by debt weight, less the trading
 *            yield the DEX pair earns back.
 *
 * Rates arrive as basis points of APR — Fluid's own UI labels them APR — and
 * are stored as such. There is no historical endpoint, so these series build
 * from the first collector run, exactly like Aave's supplied/borrowed totals.
 */

import { upsert } from '../lib/gql.mjs'
import { HUMA, OVERLAYS } from '../tracked.mjs'

const API = 'https://api.fluid.instadapp.io/v2'
/**
 * The liquidity layer lives on a different host and path shape from the vaults
 * — no `/v2` — and reports one row per token: everything supplied into Fluid
 * for that asset, across every vault drawing on it. This is what the protocol's
 * own /stats/liquidity page reads.
 */
const LIQUIDITY_API = 'https://api.fluid.io'

/** Basis points to percent. */
const bps = (v) => (v == null ? null : Number(v) / 100)
const units = (raw, decimals) => Number(raw) / 10 ** decimals
const priced = (raw, token) => units(raw, token.decimals) * Number(token.price)
const round = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v))
const isReal = (t) => t && t.symbol && Number(t.decimals) >= 0

async function fetchVault(chainId, id) {
  const res = await fetch(`${API}/${chainId}/vaults/${id}`, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Fluid API: HTTP ${res.status} for vault ${id}`)
  return res.json()
}

/** Collapse a Fluid vault of either shape into the fields a snapshot needs. */
function normalise(v) {
  const st = v.supplyToken
  const bt = v.borrowToken
  const smart = String(v.type) === '4'

  if (!smart) {
    const supplied = priced(v.totalSupply, st.token0)
    const borrowed = priced(v.totalBorrow, bt.token0)
    return {
      collateralSymbol: st.token0.symbol,
      loanSymbol: bt.token0.symbol,
      assetName: bt.token0.name,
      assetAddress: bt.token0.address,
      supplied,
      borrowed,
      // a collateral token can still pay a staking yield even when the vault
      // itself credits nothing to depositors
      supplyApr: bps(v.supplyRate?.vault?.rate) || bps(st.token0.stakingApr) || null,
      borrowApr: bps(v.borrowRate?.vault?.rate),
    }
  }

  // shares carry 18 decimals; per-share amounts carry each token's own
  const shares = (raw) => Number(raw) / 1e18
  const sSh = shares(v.totalSupply)
  const bSh = shares(v.totalBorrow)

  const leg = (sh, perShare, token) =>
    isReal(token) ? sh * units(perShare, token.decimals) * Number(token.price) : 0

  const s0 = leg(sSh, v.supplyDexData.token0PerShare, st.token0)
  const s1 = leg(sSh, v.supplyDexData.token1PerShare, st.token1)
  const b0 = leg(bSh, v.borrowDexData.token0PerShare, bt.token0)
  const b1 = leg(bSh, v.borrowDexData.token1PerShare, bt.token1)

  const borrowed = b0 + b1
  const weighted = (r0, r1) =>
    borrowed === 0 ? null : ((bps(r0) ?? 0) * b0 + (bps(r1) ?? 0) * b1) / borrowed

  // trading fees accrue to the debt position, so they cut the cost of borrowing
  const blended = weighted(v.borrowRate.liquidity.token0, v.borrowRate.liquidity.token1)
  const borrowApr = blended === null ? null : blended - (bps(v.borrowRate.dex?.trading) ?? 0)

  const supplied = s0 + s1
  const supplyRate = (token, rate) => bps(rate) || bps(token?.stakingApr) || 0
  const supplyApr =
    supplied === 0
      ? null
      : (supplyRate(st.token0, v.supplyRate.liquidity.token0) * s0 +
         supplyRate(st.token1, v.supplyRate.liquidity.token1) * s1) / supplied

  const pair = (a, b) => [a, b].filter(Boolean).join('-')
  return {
    collateralSymbol: pair(st.token0?.symbol, isReal(st.token1) ? st.token1.symbol : null),
    loanSymbol: pair(bt.token0?.symbol, isReal(bt.token1) ? bt.token1.symbol : null),
    assetName: `${bt.token0.name} / ${bt.token1?.name ?? ''}`.replace(/ \/ $/, ''),
    assetAddress: bt.token0.address,
    supplied,
    borrowed,
    supplyApr,
    borrowApr,
  }
}

export async function collectFluid({ store, today, log }) {
  let snapshots = 0

  for (const want of HUMA.fluid) {
    let raw
    try {
      raw = await fetchVault(want.chainId, want.id)
    } catch (err) {
      log(`  Fluid  vault ${String(want.id).padEnd(6)} !! ${err.message}`)
      continue
    }

    const n = normalise(raw)
    const name = `${n.collateralSymbol} / ${n.loanSymbol}`
    const id = `fluid-${want.chainId}-${want.id}`
    const entry = (store.markets[id] ??= { id, history: [] })

    Object.assign(entry, {
      id,
      chain: 'huma',
      chainId: want.chainId,
      protocol: 'Fluid',
      kind: 'market',
      name,
      symbol: n.loanSymbol,
      venue: `Fluid #${want.id}`,
      venueAddress: raw.address,
      assetName: n.assetName,
      assetAddress: n.assetAddress,
      borrowable: true,
      collateralSymbol: n.collateralSymbol,
      loanSymbol: n.loanSymbol,
      lltv: raw.collateralFactor != null ? Number(raw.collateralFactor) / 100 : undefined,
      ratesAreApr: true,
      url: want.url,
    })

    upsert(entry.history, {
      date: today,
      tvl: round(n.supplied),
      borrowed: round(n.borrowed),
      available: null,
      apy: n.supplyApr,
      borrowApy: n.borrowApr,
      utilization: n.supplied ? (n.borrowed / n.supplied) * 100 : null,
    })
    snapshots++
    log(`  Fluid  #${String(want.id).padEnd(5)} ${name.padEnd(24)} borrow ${(n.borrowApr ?? 0).toFixed(2)}% APR`)
  }

  snapshots += await collectLiquidityTokens({ store, today, log })

  return { snapshots, backfills: 0 }
}

const tokenCache = new Map()

async function liquidityTokens(chainId, log) {
  if (tokenCache.has(chainId)) return tokenCache.get(chainId)
  try {
    const res = await fetch(`${LIQUIDITY_API}/${chainId}/liquidity/tokens`, {
      headers: { accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    const list = Array.isArray(json) ? json : (json.data ?? [])
    tokenCache.set(chainId, list)
    return list
  } catch (err) {
    log(`  Fluid  liquidity chain ${chainId} !! ${err.message}`)
    tokenCache.set(chainId, null)
    return null
  }
}

/** Total supplied into the liquidity layer for one token. */
async function collectLiquidityTokens({ store, today, log }) {
  let snapshots = 0
  const wants = OVERLAYS.flatMap((o) => (o.fluidTokens ?? []).map((t) => [o, t]))

  for (const [overlay, want] of wants) {
    const list = await liquidityTokens(want.chainId, log)
    if (!list) continue

    const t = list.find((x) => x.symbol === want.symbol)
    if (!t) {
      log(`  Fluid  ${overlay.label.padEnd(7)} ${want.name.padEnd(10)} !! token not on the liquidity layer`)
      continue
    }

    const supplied = priced(t.totalSupply, t)
    const borrowed = priced(t.totalBorrow, t)
    const anyBorrowed = borrowed > 0

    const id = `fluid-token-${want.chainId}-${want.symbol.toLowerCase()}`
    const entry = (store.markets[id] ??= { id, history: [] })

    Object.assign(entry, {
      id,
      chain: overlay.id,
      chainId: want.chainId,
      protocol: 'Fluid',
      kind: 'reserve',
      name: want.name ?? t.symbol,
      symbol: t.symbol,
      venue: 'Fluid liquidity layer',
      venueAddress: t.address,
      assetName: t.name,
      assetAddress: t.address,
      borrowable: anyBorrowed,
      ratesAreApr: true,
      // contains this protocol's own vaults rather than sitting beside them
      rollup: true,
      url: want.url,
    })

    upsert(entry.history, {
      date: today,
      tvl: round(supplied),
      borrowed: anyBorrowed ? round(borrowed) : null,
      available: anyBorrowed ? round(supplied - borrowed) : null,
      apy: bps(t.supplyRate),
      borrowApy: anyBorrowed ? bps(t.borrowRate) : null,
      utilization: anyBorrowed && supplied ? (borrowed / supplied) * 100 : null,
    })
    snapshots++
    log(`  Fluid  ${overlay.label.padEnd(7)} ${(want.name ?? t.symbol).padEnd(10)} supplied $${(supplied / 1e6).toFixed(2)}M`)
  }

  return snapshots
}
