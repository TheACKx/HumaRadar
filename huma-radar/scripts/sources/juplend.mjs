/**
 * Jupiter Lend source — https://api.solana.fluid.io/v2/<deployment>/borrowing/vaults
 *
 * Jupiter Lend runs on Fluid's Solana deployment, so a vault carries the same
 * nested rate object as a Fluid vault on Ethereum. This is the endpoint jup.ag
 * itself reads. The flat list at lite-api.jup.ag/lend/v1/borrow/vaults is
 * simpler but stops at the plain vaults and never lists the smart ones.
 *
 * Four shapes, by `type`:
 *
 *   1 — one collateral token, one debt token; amounts in each token's own units
 *   2 — smart collateral: the collateral is a DEX pair, the debt one token
 *   3 — smart debt: the collateral is one token, the debt a DEX pair
 *   4 — both sides smart. None tracked yet; handled for free.
 *
 * On a smart side `totalSupply` / `totalBorrow` are share counts, and each
 * token's amount comes from the pair's `token0PerShare` / `token1PerShare`.
 *
 * Rates are stored as the APY jup.ag prints, not the simple rate the program
 * holds: Jupiter compounds continuously, so 7.50% reads there as 7.79%. Each
 * leg is compounded before the legs are blended by value, and the DEX pair's
 * trading yield is added on the collateral side — it accrues to the depositor —
 * and subtracted on the debt side, where it cuts the cost of borrowing. That
 * reproduces jup.ag exactly: vault #61 borrow 7.79%, #91 net debt 5.98%, #93
 * net collateral 5.22%. A collateral token's own staking rate passes through
 * uncompounded, as jup.ag also shows it: PST reads 8% there, not 8.33%.
 *
 * Per-token supply totals come from the same deployment's liquidity layer,
 * which is what jup.ag's /statistics/liquidity pages read. That is a truer
 * source than summing the vaults: it also covers a token sitting on the
 * liquidity layer without yet backing a borrow vault, which a vault roll-up
 * cannot see at all. Where both are visible they agree — PST's 66,893,033 on
 * the layer is the five tracked vaults' collateral to the unit.
 *
 * No historical endpoint, so the series builds from the first collector run.
 */

import { upsert } from '../lib/gql.mjs'
import { OVERLAYS, SOLANA_CHAIN_ID } from '../tracked.mjs'

const API = 'https://api.solana.fluid.io'

/** Jupiter Lend runs more than one deployment; `main` is the default one. */
const vaultsUrl = (market) => `${API}/v2/${market ?? 'main'}/borrowing/vaults`
const liquidityUrl = (market) => `${API}/v1/${market ?? 'main'}/liquidity/tokens`

const listCache = new Map()
const liquidityCache = new Map()

async function fetchList(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return Array.isArray(json) ? json : (json.data ?? [])
}

async function vaultList(market, log) {
  const key = market ?? 'main'
  if (listCache.has(key)) return listCache.get(key)
  try {
    const list = await fetchList(vaultsUrl(market))
    listCache.set(key, list)
    return list
  } catch (err) {
    log(`  Jupiter ${key.padEnd(17)} !! vault list unavailable: ${err.message}`)
    listCache.set(key, null)
    return null
  }
}

async function liquidityTokens(market, log) {
  const key = market ?? 'main'
  if (liquidityCache.has(key)) return liquidityCache.get(key)
  try {
    const list = await fetchList(liquidityUrl(market))
    liquidityCache.set(key, list)
    return list
  } catch (err) {
    log(`  Jupiter liquidity ${key.padEnd(8)} !! ${err.message}`)
    liquidityCache.set(key, null)
    return null
  }
}

/** Basis points of the simple annual rate the program stores, as percent. */
const bps = (v) => (v == null ? null : Number(v) / 100)

/** The APY jup.ag prints for a simple annual rate: 7.50% -> 7.7884%. */
const compound = (pct) => (pct == null ? null : Math.expm1(pct / 100) * 100)

/** A stored basis-point rate straight to the APY it is displayed as. */
const rateApy = (v) => compound(bps(v))

const units = (raw, decimals) => Number(raw) / 10 ** decimals
const priced = (raw, token) => units(raw, token.decimals) * Number(token.price)
const round = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v))
const isReal = (t) => t && t.symbol && Number(t.decimals) >= 0
const pair = (a, b, sep = '-') => [a, b].filter(Boolean).join(sep)

/**
 * Fluid's Solana DEX carries 9 implied decimals on a share count and 18 on the
 * per-share token amounts, so the product is whole tokens whatever decimals
 * the token itself has. Checked against the liquidity layer, which reports the
 * same 66,893,033 PST that the tracked vaults' collateral adds up to.
 */
const legTokens = (sharesRaw, perShareRaw) =>
  (Number(sharesRaw) / 1e9) * (Number(perShareRaw) / 1e18)

/** A side holding one token, priced in its own base units. */
function plainSide(tokens, raw, rates, { staking }) {
  const t = tokens.token0
  // the vault can credit nothing while the token itself still pays a yield
  const own = rateApy(rates.vault?.rate)
  return {
    symbol: t.symbol,
    assetName: t.name,
    assetAddress: t.address,
    value: priced(raw, t),
    apy: own || (staking ? bps(t.stakingApr) || null : null),
  }
}

/**
 * A side backed by a DEX pair. Each leg is compounded before being blended by
 * its share of the side's value; `sign` is +1 on the collateral side, where the
 * pair's trading yield accrues to the depositor, and -1 on the debt side, where
 * it cuts the cost of borrowing.
 */
function smartSide(tokens, shares, dex, rates, sign) {
  const t0 = tokens.token0
  const t1 = isReal(tokens.token1) ? tokens.token1 : null

  const v0 = legTokens(shares, dex.token0PerShare) * Number(t0.price)
  const v1 = t1 ? legTokens(shares, dex.token1PerShare) * Number(t1.price) : 0
  const value = v0 + v1

  // a leg the liquidity layer pays nothing on can still earn the token's own
  // staking yield
  const legApy = (token, rate) => rateApy(rate) || bps(token?.stakingApr) || 0
  const legs =
    value === 0
      ? null
      : (legApy(t0, rates.liquidity?.token0) * v0 + legApy(t1, rates.liquidity?.token1) * v1) / value
  const trading = rateApy(rates.dex?.trading) ?? 0

  return {
    symbol: pair(t0.symbol, t1?.symbol),
    assetName: pair(t0.name, t1?.name, ' / '),
    assetAddress: t0.address,
    value,
    apy: legs === null ? null : legs + sign * trading,
  }
}

/** Collapse a vault of any of the four shapes into the fields a snapshot needs. */
function normalise(v) {
  const supply = v.supplyDexData
    ? smartSide(v.supplyToken, v.totalSupply, v.supplyDexData, v.supplyRate, +1)
    : plainSide(v.supplyToken, v.totalSupply, v.supplyRate, { staking: true })

  const borrow = v.borrowDexData
    ? smartSide(v.borrowToken, v.totalBorrow, v.borrowDexData, v.borrowRate, -1)
    : plainSide(v.borrowToken, v.totalBorrow, v.borrowRate, { staking: false })

  return {
    collateralSymbol: supply.symbol,
    loanSymbol: borrow.symbol,
    assetName: borrow.assetName,
    assetAddress: borrow.assetAddress,
    supplied: supply.value,
    borrowed: borrow.value,
    supplyApy: supply.apy,
    borrowApy: borrow.apy,
  }
}

export async function collectJupLend({ store, today, log }) {
  let snapshots = 0

  const wants = OVERLAYS.flatMap((o) => (o.juplend ?? []).map((j) => [o, j]))

  for (const [overlay, want] of wants) {
    const all = await vaultList(want.market, log)
    if (!all) continue

    const raw = all.find((x) => Number(x.id) === want.id)
    if (!raw) {
      log(`  Jupiter #${String(want.id).padEnd(5)} !! not in ${want.market ?? 'main'} vault list`)
      continue
    }

    const n = normalise(raw)
    const name = `${n.collateralSymbol} / ${n.loanSymbol}`
    const id = `juplend-${want.market ? `${want.market}-` : ''}${want.id}`
    const entry = (store.markets[id] ??= { id, history: [] })

    Object.assign(entry, {
      id,
      chain: overlay.id,
      chainId: SOLANA_CHAIN_ID,
      protocol: 'JupLend',
      kind: 'market',
      name,
      symbol: n.loanSymbol,
      venue: `Jupiter Lend #${want.id}`,
      venueAddress: raw.address,
      assetName: n.assetName,
      assetAddress: n.assetAddress,
      borrowable: true,
      collateralSymbol: n.collateralSymbol,
      loanSymbol: n.loanSymbol,
      lltv: raw.collateralFactor != null ? Number(raw.collateralFactor) / 10 : undefined,
      url: want.url,
    })
    // rates were stored as APR until these were switched to the APY jup.ag
    // shows; drop the flag rather than leave it contradicting the numbers
    delete entry.ratesAreApr

    upsert(entry.history, {
      date: today,
      tvl: round(n.supplied),
      borrowed: round(n.borrowed),
      available: null,
      apy: n.supplyApy,
      borrowApy: n.borrowApy,
      utilization: n.supplied ? (n.borrowed / n.supplied) * 100 : null,
    })
    snapshots++
    log(
      `  Jupiter #${String(want.id).padEnd(5)} ${name.padEnd(24)}` +
        ` supplied $${(n.supplied / 1e6).toFixed(2)}M · borrow ${(n.borrowApy ?? 0).toFixed(2)}% APY`,
    )
  }

  snapshots += await collectTokenTotals({ store, today, log })

  return { snapshots, backfills: 0 }
}

/** Total supplied into the liquidity layer for one token. */
async function collectTokenTotals({ store, today, log }) {
  let snapshots = 0
  const wants = OVERLAYS.flatMap((o) => (o.juplendTokens ?? []).map((t) => [o, t]))

  for (const [overlay, want] of wants) {
    const list = await liquidityTokens(want.market, log)
    if (!list) continue

    const t = list.find((x) => x.address === want.mint)
    if (!t) {
      log(`  Jupiter ${want.name.padEnd(18)} !! not on the ${want.market ?? 'main'} liquidity layer`)
      continue
    }

    const supplied = priced(t.totalSupply, t)
    const borrowed = priced(t.totalBorrow, t)
    const anyBorrowed = borrowed > 0

    const id = `juplend-token-${want.mint.slice(0, 10).toLowerCase()}`
    const entry = (store.markets[id] ??= { id, history: [] })

    Object.assign(entry, {
      id,
      chain: overlay.id,
      chainId: SOLANA_CHAIN_ID,
      protocol: 'JupLend',
      kind: 'reserve',
      name: want.name ?? t.symbol,
      symbol: t.symbol,
      venue: ['Jupiter Lend', want.market, 'liquidity layer'].filter(Boolean).join(' · '),
      venueAddress: want.mint,
      assetName: t.name,
      assetAddress: want.mint,
      borrowable: anyBorrowed,
      // contains this protocol's own vaults rather than sitting beside them
      rollup: true,
      url: want.url,
    })
    delete entry.ratesAreApr

    upsert(entry.history, {
      date: today,
      tvl: round(supplied),
      borrowed: anyBorrowed ? round(borrowed) : null,
      available: anyBorrowed ? round(supplied - borrowed) : null,
      apy: rateApy(t.supplyRate),
      borrowApy: anyBorrowed ? rateApy(t.borrowRate) : null,
      utilization: anyBorrowed && supplied ? (borrowed / supplied) * 100 : null,
    })
    snapshots++
    log(`  Jupiter ${overlay.label.padEnd(7)} ${(want.name ?? t.symbol).padEnd(10)} supplied $${(supplied / 1e6).toFixed(2)}M`)
  }

  return snapshots
}
