import { useMemo, useState } from 'react'
import { Coins, Landmark, Radar } from 'lucide-react'
import { CHAIN_MAP, NETWORKS, PROJECTS } from './data/chains'
import { GENERATED_AT, LATEST_DATE, MARKETS, PROTOCOL_ORDER } from './data/markets'
import { STABLE_CHAINS, STABLE_GENERATED_AT, STABLE_LATEST_DATE } from './data/stablecoins'
import {
  STABLE_PROTOCOLS, STABLE_PROTOCOLS_GENERATED_AT, STABLE_PROTOCOLS_LATEST_DATE,
} from './data/stableprotocols'
import { aggregate, excludedFromTotals, withDeltas } from './lib/derive'
import { formatDateLong, relativeTime } from './lib/format'
import type {
  Chain, ChainId, DeltaMode, MarketRow, Protocol, ProtocolFilter, SortKey, StableProtocolRow,
  StableRow, ViewId,
} from './types'
import { Sidebar } from './components/Sidebar'
import { StatCards } from './components/StatCards'
import { MarketTable, TableToolbar } from './components/MarketTable'
import { ChartDrawer } from './components/ChartDrawer'
import { StablecoinPanel } from './components/StablecoinPanel'
import { StableChartDrawer } from './components/StableChartDrawer'
import { StableProtocolPanel } from './components/StableProtocolPanel'
import { StableProtocolDrawer } from './components/StableProtocolDrawer'
import { ChainDot, Logo } from './components/Primitives'

const ALL_ROWS: MarketRow[] = MARKETS.map(withDeltas)

const CHAIN_BLURB: Record<ChainId, string> = {
  ethereum: 'Aave v3 Core reserves and curated Morpho vaults.',
  base: 'Aave v3 USDC lending plus Morpho USDC vaults.',
  arbitrum: 'Aave v3 — native USDC and USDT0 markets.',
  mantle: 'Aave v3 — USDT0 as the anchor stablecoin market.',
  plasma: 'Aave v3 on a stablecoin-first chain — USDT0 / USDe / GHO.',
  monad: 'Aave v3 reserves and Morpho vaults on a young deployment.',
  tempo: 'Morpho vaults on Tempo.',
  robinhood: 'Morpho vaults on Robinhood Chain.',
  huma: 'PST borrow venues and Huma-curated vaults, across Morpho, Fluid and Jupiter Lend.',
  maple: 'Where Maple syrup tokens are supplied, across Aave, Morpho, Kamino and Jupiter Lend.',
  ethena: 'Where USDe and staked sUSDe are supplied, across Aave, Morpho, Kamino and Jupiter Lend.',
  re: 'Where Re Protocol reUSD is supplied, across Morpho, Fluid, Kamino and Jupiter Lend.',
  usdai: 'Where staked sUSDai is supplied, across Fluid and Morpho on Arbitrum.',
}

/** Separates the mobile rail groups, standing in for a section label. */
function Rule() {
  return <span className="mx-0.5 h-5 w-px shrink-0 self-center bg-hairline" />
}

export default function App() {
  const [view, setView] = useState<ViewId>('stables')
  // the last network looked at, kept so the chain memos below never see an
  // overview tab
  const [chain, setChain] = useState<ChainId>('ethereum')
  const [protocolFilter, setProtocolFilter] = useState<ProtocolFilter>('all')
  const [query, setQuery] = useState('')
  const [deltaMode, setDeltaMode] = useState<DeltaMode>('pp')
  const [sortKey, setSortKey] = useState<SortKey>('tvl')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [active, setActive] = useState<MarketRow | null>(null)
  const [activeStable, setActiveStable] = useState<StableRow | null>(null)
  const [activeProtocol, setActiveProtocol] = useState<StableProtocolRow | null>(null)

  const chainRows = useMemo(() => ALL_ROWS.filter((r) => r.chain === chain), [chain])

  // the overlay mixes four protocols, so the tabs follow the data
  const counts = useMemo(() => {
    const byProtocol = new Map<Protocol, number>()
    for (const r of chainRows) byProtocol.set(r.protocol, (byProtocol.get(r.protocol) ?? 0) + 1)
    return { all: chainRows.length, byProtocol }
  }, [chainRows])

  const filtered = useMemo(
    () => (protocolFilter === 'all' ? chainRows : chainRows.filter((r) => r.protocol === protocolFilter)),
    [chainRows, protocolFilter],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const searched = filtered.filter((r) => {
      if (!q) return true
      return (
        r.name.toLowerCase().includes(q) ||
        r.symbol.toLowerCase().includes(q) ||
        r.assetName.toLowerCase().includes(q) ||
        r.venue.toLowerCase().includes(q)
      )
    })

    const value = (r: MarketRow): number | string | null => {
      switch (sortKey) {
        case 'name': return r.name.toLowerCase()
        case 'tvl': return r.tvl
        case 'borrowed': return r.borrowed
        case 'available': return r.available
        case 'utilization': return r.utilization
        case 'apy': return r.apy
        case 'borrowApy': return r.borrowApy
        case 'tvl7d': return r.deltas.tvl7d.pct
        case 'tvl30d': return r.deltas.tvl30d.pct
        case 'apy7d': return deltaMode === 'pp' ? r.deltas.apy7d.abs : r.deltas.apy7d.pct
        case 'apy30d': return deltaMode === 'pp' ? r.deltas.apy30d.abs : r.deltas.apy30d.pct
        case 'borrowApy7d': return deltaMode === 'pp' ? r.deltas.borrowApy7d.abs : r.deltas.borrowApy7d.pct
        case 'borrowApy30d': return deltaMode === 'pp' ? r.deltas.borrowApy30d.abs : r.deltas.borrowApy30d.pct
      }
    }

    return [...searched].sort((a, b) => {
      const va = value(a)
      const vb = value(b)
      // markets without enough history always sink to the bottom
      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, query, sortKey, sortDir, deltaMode])

  const agg = useMemo(() => aggregate(filtered), [filtered])
  // marked in the table, held out of the header totals
  const excludedIds = useMemo(() => excludedFromTotals(filtered), [filtered])

  const onSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir(k === 'name' ? 'asc' : 'desc')
    }
  }

  const selectView = (v: ViewId) => {
    setView(v)
    if (v !== 'stables' && v !== 'protocols') {
      setChain(v)
      setProtocolFilter('all')
    }
  }

  const meta = CHAIN_MAP[chain]
  const onStables = view === 'stables'
  const onProtocols = view === 'protocols'
  const onOverview = onStables || onProtocols

  // the mobile rail mirrors the sidebar order: overview, then networks, then
  // projects, separated by rules since a scrolling row has no room for labels
  const chainChip = (c: Chain) => (
    <button
      key={c.id}
      onClick={() => selectView(c.id)}
      className={`chip shrink-0 !px-3 !py-1.5 ${
        !onOverview && c.id === chain ? '!border-plum-500/50 !bg-plum-600/20 !text-plum-100' : ''
      }`}
    >
      <ChainDot chain={c.id} size={6} />
      {c.name}
    </button>
  )

  return (
    <div className="flex h-full">
      <div className="hidden lg:block">
        <Sidebar
          selected={view}
          onSelect={selectView}
          allRows={ALL_ROWS}
          lastSync={relativeTime(GENERATED_AT)}
        />
      </div>

      <main className="grid-lines min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1600px] px-5 py-6 lg:px-8">
          {/* mobile brand + view rail */}
          <div className="mb-5 lg:hidden">
            <div className="flex items-center gap-2.5">
              <Logo size={28} />
              <span className="text-[15px] font-extrabold tracking-tight text-white">
                Huma <span className="text-plum-400">Radar</span>
              </span>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => selectView('stables')}
                className={`chip shrink-0 !px-3 !py-1.5 ${
                  onStables ? '!border-plum-500/50 !bg-plum-600/20 !text-plum-100' : ''
                }`}
              >
                <Coins size={11} />
                Stablecoins
              </button>
              <button
                onClick={() => selectView('protocols')}
                className={`chip shrink-0 !px-3 !py-1.5 ${
                  onProtocols ? '!border-plum-500/50 !bg-plum-600/20 !text-plum-100' : ''
                }`}
              >
                <Landmark size={11} />
                Protocols
              </button>
              {chainChip(CHAIN_MAP.huma)}
              <Rule />
              {NETWORKS.map(chainChip)}
              <Rule />
              {PROJECTS.map(chainChip)}
            </div>
          </div>

          {onStables ? (
            <>
              <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl border border-plum-500/20 bg-plum-500/10 text-plum-300">
                    <Coins size={17} />
                  </span>
                  <div>
                    <h1 className="text-[22px] font-extrabold leading-none tracking-tight text-white">
                      Stablecoin Supply Overlook
                    </h1>
                    <p className="mt-1.5 text-[12.5px] text-muted">
                      Circulating stablecoin market cap, network-wide and per chain — the supply the
                      lending tabs draw from.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="chip" title={STABLE_GENERATED_AT ?? undefined}>
                    <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-gain" />
                    Snapshot {STABLE_LATEST_DATE ? formatDateLong(STABLE_LATEST_DATE) : '—'}
                  </span>
                  <span className="chip">DefiLlama</span>
                </div>
              </header>

              <StablecoinPanel onOpenChart={setActiveStable} activeId={activeStable?.id} />

              <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 pb-4 text-[11px] text-dim">
                <span>
                  Market cap is stablecoins issued and circulating on a chain, whether or not they
                  are deposited anywhere — not the same measure as the TVL on the network tabs. Each
                  day sums every peg, the euro and yen ones included, converted to USD.
                </span>
                <span className="num">
                  {STABLE_CHAINS.length} chains · collected {relativeTime(STABLE_GENERATED_AT)}
                </span>
              </footer>
            </>
          ) : onProtocols ? (
            <>
              <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl border border-plum-500/20 bg-plum-500/10 text-plum-300">
                    <Landmark size={17} />
                  </span>
                  <div>
                    <h1 className="text-[22px] font-extrabold leading-none tracking-tight text-white">
                      Stablecoin Protocols: TVL &amp; Yield
                    </h1>
                    <p className="mt-1.5 text-[12.5px] text-muted">
                      What each issuer pays on its own coin, and how much sits behind it — the
                      product itself, not what a lending venue pays to hold it.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="chip" title={STABLE_PROTOCOLS_GENERATED_AT ?? undefined}>
                    <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-gain" />
                    Snapshot{' '}
                    {STABLE_PROTOCOLS_LATEST_DATE ? formatDateLong(STABLE_PROTOCOLS_LATEST_DATE) : '—'}
                  </span>
                  <span className="chip">DefiLlama</span>
                </div>
              </header>

              <StableProtocolPanel onOpenChart={setActiveProtocol} activeId={activeProtocol?.id} />

              <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 pb-4 text-[11px] text-dim">
                <span>
                  A row quoting a DefiLlama pool reports that product’s own TVL and APY. A row
                  quoting a protocol page reports protocol-wide TVL — everything the issuer mints,
                  not the ticker alone — and the median APY across its pools for that ticker,
                  which is the figure those pages show.
                </span>
                <span className="num">
                  {STABLE_PROTOCOLS.length} products · collected{' '}
                  {relativeTime(STABLE_PROTOCOLS_GENERATED_AT)}
                </span>
              </footer>
            </>
          ) : (
            <>
              <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <span
                    className="grid h-9 w-9 place-items-center rounded-xl border"
                    style={{ borderColor: `${meta.color}33`, background: `${meta.color}14`, color: meta.color }}
                  >
                    <Radar size={17} />
                  </span>
                  <div>
                    <h1 className="text-[22px] font-extrabold leading-none tracking-tight text-white">
                      {meta.name}
                    </h1>
                    <p className="mt-1.5 text-[12.5px] text-muted">{CHAIN_BLURB[chain]}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="chip" title={GENERATED_AT ?? undefined}>
                    <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-gain" />
                    Snapshot {LATEST_DATE ? formatDateLong(LATEST_DATE) : '—'}
                  </span>
                  <span className="chip">
                    {PROTOCOL_ORDER.filter((p) => counts.byProtocol.has(p)).join(' · ') || '—'}
                  </span>
                </div>
              </header>

              <StatCards agg={agg} accent={meta.color} />

              <div className="mt-6 space-y-3">
                <TableToolbar
                  protocolFilter={protocolFilter}
                  onProtocolFilter={setProtocolFilter}
                  query={query}
                  onQuery={setQuery}
                  deltaMode={deltaMode}
                  onDeltaMode={setDeltaMode}
                  counts={counts}
                />

                <MarketTable
                  rows={visible}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  deltaMode={deltaMode}
                  onOpenChart={setActive}
                  activeId={active?.id}
                  excludedIds={excludedIds}
                />
              </div>

              <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 pb-4 text-[11px] text-dim">
                <span>
                  Morpho publishes daily TVL and APY history, so its changes are exact. Aave publishes
                  APY history only — its supplied / borrowed 7D and 30D read “—” until enough days
                  accumulate.
                </span>
                <span className="num">
                  Showing {visible.length} of {chainRows.length} markets on {meta.name}
                </span>
              </footer>
            </>
          )}
        </div>
      </main>

      <ChartDrawer row={active} onClose={() => setActive(null)} />
      <StableChartDrawer row={activeStable} onClose={() => setActiveStable(null)} />
      <StableProtocolDrawer row={activeProtocol} onClose={() => setActiveProtocol(null)} />
    </div>
  )
}
