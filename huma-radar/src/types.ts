/**
 * Real networks, plus curated overlays. The overlay ids are not chains: each
 * gathers one asset family's venues from several protocols across several
 * networks, and a venue may be listed both under its own chain and an overlay.
 * Overlays are declared in scripts/tracked.mjs as OVERLAYS, and each id there
 * must match one here.
 */
export type ChainId =
  | 'ethereum' | 'plasma' | 'monad' | 'base'
  | 'arbitrum' | 'mantle' | 'robinhood' | 'tempo' | 'arc'
  | 'huma' | 'maple' | 'ethena' | 're' | 'usdai'

/**
 * Where a tab sits in the sidebar.
 *
 * `overview` — read before any single venue: what supply exists, what the
 *   issuers pay on it, and Huma itself, which is what this dashboard is for.
 * `network`  — a real chain, listing every venue deployed on it.
 * `project`  — an asset-family overlay, gathering one issuer's venues from
 *   several protocols across several networks.
 */
export type ChainGroup = 'overview' | 'network' | 'project'

export interface Chain {
  id: ChainId
  name: string
  short: string
  /** brand colour used for dots, badges and chart accents */
  color: string
  /** false = no collector wired up yet */
  live: boolean
  group: ChainGroup
}

/**
 * `Combined` is not a venue: it labels a row summed from others, so the filter
 * strip can separate those from the venues they add up.
 */
export type Protocol =
  | 'Aave v3' | 'Aave v4' | 'Morpho' | 'Fluid' | 'JupLend' | 'Kamino' | 'Orca' | 'Combined'

/**
 * `reserve` — an Aave pool reserve, one asset supplied and borrowed.
 * `vault`   — a curated vault; depositors earn, there is no borrow side.
 * `market`  — an isolated collateral/loan pair with a borrow side: a Morpho
 *             Blue market, a Fluid borrow vault or a Jupiter Lend vault.
 * `pool`    — an AMM liquidity pool, both sides of a pair; the only yield is
 *             trading fees and nothing is borrowed.
 */
export type MarketKind = 'reserve' | 'vault' | 'market' | 'pool'

/**
 * One daily snapshot, exactly as scripts/collect.mjs writes it.
 *
 * `tvl` is total supplied for an Aave reserve and total assets for a Morpho
 * vault; `apy` is supply APY / net APY respectively. Borrow fields are null for
 * vaults and for supply-only Aave collateral.
 *
 * Aave has no historical endpoint for supplied/borrowed totals, so on
 * backfilled days its `tvl` is null while `apy` is populated. Morpho publishes
 * both, so its backfilled days are complete.
 */
export interface Snapshot {
  /** ISO date, YYYY-MM-DD, UTC */
  date: string
  tvl: number | null
  borrowed: number | null
  available: number | null
  apy: number | null
  borrowApy: number | null
  /** borrowed / supplied, as a percent */
  utilization: number | null
}

export interface Market {
  id: string
  chain: ChainId
  chainId: number
  protocol: Protocol
  kind: MarketKind
  /** display name — asset symbol for reserves, vault name for vaults */
  name: string
  /** underlying asset symbol */
  symbol: string
  /** market or vault version label, e.g. "AaveV3Ethereum" / "Morpho V2" */
  venue: string
  venueAddress: string
  assetName: string
  assetAddress: string
  borrowable: boolean
  /** kind 'market' only — what is put up as collateral, e.g. "PST" */
  collateralSymbol?: string
  /** kind 'market' only — what is borrowed against it, e.g. "USDC" */
  loanSymbol?: string
  /** kind 'market' only — max loan-to-value, percent */
  lltv?: number
  /**
   * True when this venue reports a simple annual rate rather than a compounded
   * one. Fluid and Jupiter Lend both do; the table marks those cells so an APR
   * is never read as an APY.
   */
  ratesAreApr?: boolean
  /**
   * True for a liquidity-layer total: everything supplied into a protocol for
   * one token, which *contains* that protocol's individual vaults rather than
   * sitting beside them. Shown in the table either way, but left out of the
   * header totals wherever those vaults are on screen too — see
   * supersededRollups() in lib/derive.ts.
   */
  rollup?: boolean
  /**
   * True for a row that belongs on its tab but is not what that tab totals —
   * the USDC lent against PST in Kamino's Huma market is real money, but it is
   * not PST. Shown in the table, marked "not in total", and left out of the
   * header figures. Distinct from `rollup`, which is about double-counting.
   */
  notInTotal?: boolean
  url?: string
  apyBackfilledAt?: string
  backfilledAt?: string
  /** oldest-to-newest */
  history: Snapshot[]
}

export interface SnapshotStore {
  sources: string[]
  generatedAt: string | null
  markets: Record<string, Market>
}

/** A change over a window, or nulls when history is too short. */
export interface Change {
  /** relative change, percent */
  pct: number | null
  /** absolute change in the metric's own unit */
  abs: number | null
}

export interface Deltas {
  tvl7d: Change
  tvl30d: Change
  apy7d: Change
  apy30d: Change
  borrowApy7d: Change
  borrowApy30d: Change
}

/** Latest non-null reading for each metric, plus derived changes. */
export interface MarketRow extends Market {
  tvl: number | null
  borrowed: number | null
  available: number | null
  apy: number | null
  borrowApy: number | null
  utilization: number | null
  deltas: Deltas
}

export type SortKey =
  | 'name' | 'tvl' | 'borrowed' | 'available' | 'utilization' | 'apy' | 'borrowApy'
  | 'tvl7d' | 'tvl30d' | 'apy7d' | 'apy30d' | 'borrowApy7d' | 'borrowApy30d'

export type DeltaMode = 'pct' | 'pp'
export type Range = 7 | 30 | 90 | 365
export type ProtocolFilter = 'all' | Protocol
export type KindFilter = 'all' | 'borrow' | 'supply'

/**
 * One day of stablecoin circulating supply, exactly as
 * scripts/sources/stablecoins.mjs writes it. `total` sums every peg type,
 * already converted to USD.
 */
export interface StablePoint {
  /** ISO date, YYYY-MM-DD, UTC */
  date: string
  total: number
}

export interface StableChain {
  id: string
  name: string
  /** chain name DefiLlama's stablecoin API expects; 'all' is the network total */
  slug: string
  url: string
  /** oldest-to-newest */
  history: StablePoint[]
}

export interface StableStore {
  source: string
  generatedAt: string | null
  chains: Record<string, StableChain>
}

/** A tracked chain's latest supply, plus its weekly and monthly change. */
export interface StableRow extends StableChain {
  /** brand colour used for the sparkline and chart accent */
  color: string
  total: number | null
  change7d: Change
  change30d: Change
}

export type StableSortKey = 'name' | 'total' | 'change7d' | 'change30d'

/**
 * One day of a stablecoin product's TVL and yield, as
 * scripts/sources/stableprotocols.mjs writes it. The two fields are filled
 * independently: a protocol-sourced row has TVL from its first day but no yield
 * until its pools appear in DefiLlama's yields index.
 */
export interface StableProtocolPoint {
  /** ISO date, YYYY-MM-DD, UTC */
  date: string
  tvl: number | null
  /** APY, percent */
  apy: number | null
}

export interface StableProtocol {
  id: string
  /** issuing protocol, e.g. "Maple" */
  name: string
  /** the stablecoin itself, e.g. "syrupUSDC" */
  ticker: string
  /**
   * `pool`     — a DefiLlama yields pool: TVL and APY for this one product.
   * `protocol` — a DefiLlama protocol: TVL is protocol-wide and the yield is
   *              the median across that project's pools for this ticker.
   */
  kind: 'pool' | 'protocol'
  /** where the figures come from, spelled out for the row's subline */
  venue: string | null
  url: string
  /** oldest-to-newest */
  history: StableProtocolPoint[]
}

export interface StableProtocolStore {
  source: string
  generatedAt: string | null
  protocols: Record<string, StableProtocol>
}

/** A product's latest TVL and yield, plus the changes over 7 and 30 days. */
export interface StableProtocolRow extends StableProtocol {
  /** brand colour used for the sparkline and chart accent */
  color: string
  tvl: number | null
  apy: number | null
  apy7d: Change
  apy30d: Change
  tvl7d: Change
  tvl30d: Change
}

export type StableProtocolSortKey =
  | 'name' | 'ticker' | 'apy' | 'apy7d' | 'apy30d' | 'tvl' | 'tvl7d' | 'tvl30d'

/**
 * What the sidebar selects. The stablecoin tabs and the weekly report are not
 * networks — each reads its own data and measures something the chain tabs do
 * not — so they sit beside the chain ids rather than among them.
 */
export type ViewId = 'stables' | 'protocols' | 'reports' | ChainId

/** A headline figure exactly as the report script formatted it. */
export interface ReportKpi {
  value: string
  usd: string
  pct: string
  /** sign of the change: 1, -1 or 0 */
  dir: number
}

/**
 * reports/data/<date>.headline.json — the few figures shown above a report and
 * in the week list, written by scripts/report.mjs so the page never computes
 * or reformats a number the report itself states.
 */
export interface ReportHeadline {
  start: string
  end: string
  supply: ReportKpi
  venues: ReportKpi
  pst: ReportKpi
  flagged: { products: number; groups: number; passes: number }
  topUp: { label: string; usd: string } | null
  topDown: { label: string; usd: string } | null
}

export interface ReportMeta {
  /** snapshot date the report ends on, YYYY-MM-DD */
  end: string
  /** snapshot it is compared against, seven days earlier */
  start: string
  /** the markdown, fetched only when the week is opened */
  load: () => Promise<string>
  headline: ReportHeadline | null
}
