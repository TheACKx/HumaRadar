import { ArrowUpDown, ChevronDown, ChevronUp, ExternalLink, LineChart, Search, SlidersHorizontal } from 'lucide-react'
import { formatPct, formatUsd } from '../lib/format'
import type { Change, DeltaMode, MarketRow, Protocol, ProtocolFilter, SortKey } from '../types'
import { CHAIN_MAP } from '../data/chains'
import { PROTOCOL_ORDER, venueLabel } from '../data/markets'
import { AssetMark, Delta, KindBadge, Sparkline, UtilBar } from './Primitives'

interface ToolbarProps {
  protocolFilter: ProtocolFilter
  onProtocolFilter: (p: ProtocolFilter) => void
  query: string
  onQuery: (q: string) => void
  deltaMode: DeltaMode
  onDeltaMode: (m: DeltaMode) => void
  counts: { all: number; byProtocol: Map<Protocol, number> }
}


export function TableToolbar({
  protocolFilter, onProtocolFilter, query, onQuery, deltaMode, onDeltaMode, counts,
}: ToolbarProps) {
  const tabs: { id: ProtocolFilter; label: string; n: number }[] = [
    { id: 'all', label: 'All', n: counts.all },
    // a protocol absent from this chain is left out entirely rather than
    // shown as a dead zero
    ...PROTOCOL_ORDER.filter((p) => counts.byProtocol.has(p)).map((p) => ({
      id: p as ProtocolFilter,
      label: p,
      n: counts.byProtocol.get(p) as number,
    })),
  ]
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1 rounded-xl border border-hairline bg-panel/60 p-1 backdrop-blur">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onProtocolFilter(t.id)}
            className={`seg flex items-center gap-1.5 px-3 py-1.5 ${
              protocolFilter === t.id ? 'seg-on' : ''
            }`}
          >
            {t.label}
            <span
              className={`num rounded px-1 text-[10px] ${
                protocolFilter === t.id ? 'bg-plum-500/25 text-plum-200' : 'bg-raised text-dim'
              }`}
            >
              {t.n}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search market, vault or asset…"
            className="w-[240px] rounded-xl border border-hairline bg-panel/60 py-2 pl-9 pr-3 text-[13px] text-plum-100 placeholder:text-dim
                       backdrop-blur transition-colors focus:border-plum-600/70 focus:outline-none focus:ring-2 focus:ring-plum-600/25"
          />
        </div>

        <div
          className="flex items-center gap-1 rounded-xl border border-hairline bg-panel/60 p-1 backdrop-blur"
          title="Express APY changes as percentage points or as a relative percent"
        >
          <SlidersHorizontal size={13} className="ml-1.5 text-dim" />
          <button onClick={() => onDeltaMode('pp')} className={`seg ${deltaMode === 'pp' ? 'seg-on' : ''}`}>
            APY Δ pp
          </button>
          <button onClick={() => onDeltaMode('pct')} className={`seg ${deltaMode === 'pct' ? 'seg-on' : ''}`}>
            %
          </button>
        </div>
      </div>
    </div>
  )
}

interface TableProps {
  rows: MarketRow[]
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  onSort: (k: SortKey) => void
  deltaMode: DeltaMode
  onOpenChart: (row: MarketRow) => void
  activeId?: string | null
  /** roll-up rows shown here but held out of the header totals */
  excludedIds?: Set<string>
}

/**
 * A rate, marked when its venue reports a simple annual rate. Fluid and Jupiter
 * Lend both publish APR; showing it unlabelled beside Aave's and Morpho's
 * compounded APYs would quietly compare two different things.
 */
function RateCell({ value, isApr, protocol }: { value: number | null; isApr?: boolean; protocol: string }) {
  // nothing to qualify when there is no rate — an "APR" tag on an em dash
  // reads as a missing value that is somehow still a simple rate
  if (!isApr || value === null) return <>{formatPct(value)}</>
  return (
    <span title={`${protocol} publishes a simple annual rate (APR), not a compounded APY`}>
      {formatPct(value)}
      <span className="ml-0.5 align-super text-[8.5px] font-bold text-dim">APR</span>
    </span>
  )
}

/** Render a Change through the current pp/% preference. */
function ApyDelta({ change, mode }: { change: Change; mode: DeltaMode }) {
  return mode === 'pp'
    ? <Delta value={change.abs} suffix="pp" />
    : <Delta value={change.pct} suffix="%" />
}

export function MarketTable({
  rows, sortKey, sortDir, onSort, deltaMode, onOpenChart, activeId, excludedIds,
}: TableProps) {
  if (rows.length === 0) return <EmptyState />

  // vault-only views have no borrow side worth a whole column group
  const showBorrow = rows.some((r) => r.borrowable)
  // only Morpho publishes idle liquidity; Fluid and Jupiter do not
  const showAvailable = rows.some((r) => r.available !== null)

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-left"
          style={{ minWidth: showBorrow ? (showAvailable ? 1440 : 1320) : 940 }}
        >
          <thead>
            <tr className="border-b border-hairline/50 bg-raised/20">
              <th colSpan={2} />
              <th
                colSpan={6}
                className="border-l border-hairline/40 py-1.5 text-center text-[9.5px] font-bold uppercase tracking-[0.18em] text-plum-400/70"
              >
                TVL &amp; yield
              </th>
              {showBorrow && (
                <th
                  colSpan={showAvailable ? 6 : 5}
                  className="border-l border-hairline/40 py-1.5 text-center text-[9.5px] font-bold uppercase tracking-[0.18em] text-amber-400/70"
                >
                  Borrow side
                </th>
              )}
              <th />
            </tr>
            <tr className="border-b border-hairline/70 bg-raised/30">
              <Th className="w-11 pl-5 text-center">#</Th>
              <Th sortKey="name" active={sortKey} dir={sortDir} onSort={onSort}>Market</Th>

              <Th align="right" divider sortKey="tvl" active={sortKey} dir={sortDir} onSort={onSort}
                title="Aave: total supplied · Morpho: vault TVL">
                TVL
              </Th>
              <Th align="right" sortKey="tvl7d" active={sortKey} dir={sortDir} onSort={onSort}>7D</Th>
              <Th align="right" sortKey="tvl30d" active={sortKey} dir={sortDir} onSort={onSort}>30D</Th>
              <Th align="right" sortKey="apy" active={sortKey} dir={sortDir} onSort={onSort}
                title="Aave: supply APY · Morpho: net APY">
                APY
              </Th>
              <Th align="right" sortKey="apy7d" active={sortKey} dir={sortDir} onSort={onSort}>7D</Th>
              <Th align="right" sortKey="apy30d" active={sortKey} dir={sortDir} onSort={onSort}>30D</Th>

              {showBorrow && (
                <>
                  <Th align="right" divider sortKey="borrowed" active={sortKey} dir={sortDir} onSort={onSort}>
                    Borrowed
                  </Th>
                  {showAvailable && (
                    <Th align="right" sortKey="available" active={sortKey} dir={sortDir} onSort={onSort}
                      title="Supplied liquidity not currently borrowed">
                      Available
                    </Th>
                  )}
                  <Th align="right" sortKey="borrowApy" active={sortKey} dir={sortDir} onSort={onSort}>
                    Borrow APY
                  </Th>
                  <Th align="right" sortKey="borrowApy7d" active={sortKey} dir={sortDir} onSort={onSort}>7D</Th>
                  <Th align="right" sortKey="borrowApy30d" active={sortKey} dir={sortDir} onSort={onSort}>30D</Th>
                  <Th align="center" sortKey="utilization" active={sortKey} dir={sortDir} onSort={onSort} className="w-24">
                    Util
                  </Th>
                </>
              )}

              <Th align="right" className="w-[130px] pr-5">Chart</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const accent = CHAIN_MAP[r.chain].color
              const active = activeId === r.id
              const excluded = excludedIds?.has(r.id) ?? false
              return (
                <tr
                  key={r.id}
                  className={
                    'group border-b border-hairline/40 transition-colors last:border-0 ' +
                    (active ? 'bg-plum-600/12' : 'hover:bg-plum-950/25')
                  }
                >
                  <td className="num py-3 pl-5 text-center text-[11px] text-dim">{i + 1}</td>

                  <td className="max-w-[340px] py-3 pr-4">
                    <div className="flex items-center gap-3">
                      <AssetMark
                        symbol={r.kind === 'market' ? r.collateralSymbol ?? r.symbol : r.symbol}
                        chain={r.chain}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13.5px] font-semibold text-white" title={r.name}>
                            {r.name}
                          </span>
                          <KindBadge kind={r.kind} borrowable={r.borrowable} rollup={r.rollup} />
                          {r.url && (
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              onClick={(e) => e.stopPropagation()}
                              className="shrink-0 text-dim opacity-0 transition-opacity hover:text-plum-300 group-hover:opacity-100"
                              title="Open in the protocol app"
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-dim">
                          <span className="truncate">
                            {r.protocol} ·{' '}
                            {r.kind === 'vault'
                              ? r.symbol
                              : r.kind === 'market' || r.kind === 'pool'
                                ? r.venue
                                : venueLabel(r.venue)}
                          </span>
                          {r.lltv != null && (
                            <span
                              className="num shrink-0 rounded border border-hairline px-1 text-[9.5px] font-semibold"
                              title="Maximum loan-to-value before liquidation"
                            >
                              {r.lltv.toFixed(0)}% LTV
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="num border-l border-hairline/40 py-3 pl-4 pr-4 text-right text-[13.5px] font-semibold text-white">
                    {formatUsd(r.tvl)}
                    {excluded && (
                      // its own line, and never broken across two — "in total"
                      // on a line of its own would read as the opposite
                      <span
                        className="block whitespace-nowrap text-[9px] font-bold uppercase tracking-wide text-dim"
                        title={
                          r.rollup
                            ? "A total that already contains rows listed elsewhere on this tab, so it is left out of the header's Total TVL rather than counted twice"
                            : "Kept out of the header's totals on purpose: this row belongs on the tab but is not what the tab totals"
                        }
                      >
                        not in total
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right"><Delta value={r.deltas.tvl7d.pct} /></td>
                  <td className="py-3 pr-4 text-right"><Delta value={r.deltas.tvl30d.pct} /></td>
                  <td className="num py-3 pr-4 text-right text-[13.5px] font-semibold text-plum-200">
                    <RateCell value={r.apy} isApr={r.ratesAreApr} protocol={r.protocol} />
                  </td>
                  <td className="py-3 pr-4 text-right"><ApyDelta change={r.deltas.apy7d} mode={deltaMode} /></td>
                  <td className="py-3 pr-4 text-right"><ApyDelta change={r.deltas.apy30d} mode={deltaMode} /></td>

                  {showBorrow && (
                    <>
                      <td className="num border-l border-hairline/40 py-3 pl-4 pr-4 text-right text-[13.5px] font-semibold text-white">
                        {r.borrowable ? formatUsd(r.borrowed) : <span className="text-dim">—</span>}
                      </td>
                      {showAvailable && (
                        <td className="num py-3 pr-4 text-right text-[13.5px] text-plum-200">
                          {r.available !== null ? formatUsd(r.available) : <span className="text-dim">—</span>}
                        </td>
                      )}
                      <td className="num py-3 pr-4 text-right text-[13.5px] font-semibold text-amber-300">
                        {r.borrowable ? (
                          <RateCell value={r.borrowApy} isApr={r.ratesAreApr} protocol={r.protocol} />
                        ) : (
                          <span className="text-dim">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right"><ApyDelta change={r.deltas.borrowApy7d} mode={deltaMode} /></td>
                      <td className="py-3 pr-4 text-right"><ApyDelta change={r.deltas.borrowApy30d} mode={deltaMode} /></td>
                      <td className="py-3 pr-4"><UtilBar value={r.borrowable ? r.utilization : null} /></td>
                    </>
                  )}

                  <td className="py-3 pr-5 text-right">
                    <div className="flex items-center justify-end gap-2.5">
                      <Sparkline data={headlineSpark(r)} color={accent} width={52} height={22} />
                      <button
                        onClick={() => onOpenChart(r)}
                        className={
                          'btn whitespace-nowrap !px-2.5 !py-1.5 !text-[12px] ' +
                          (active ? 'btn-primary' : 'opacity-70 group-hover:opacity-100')
                        }
                        title="Show TVL and APY history"
                      >
                        <LineChart size={13} />
                        Graph
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** 30-day headline-APY sparkline: borrow rate where borrowable, else the vault/supply APY. */
function headlineSpark(r: MarketRow): number[] {
  const key = r.borrowable ? 'borrowApy' : 'apy'
  return r.history.slice(-30).map((h) => h[key]).filter((v): v is number => v !== null)
}

function Th({
  children, align = 'left', className = '', sortKey, active, dir, onSort, divider, title,
}: {
  children?: React.ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
  sortKey?: SortKey
  active?: SortKey
  dir?: 'asc' | 'desc'
  onSort?: (k: SortKey) => void
  divider?: boolean
  title?: string
}) {
  const isActive = sortKey && active === sortKey
  const alignCls = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
  const content = (
    <span className={`inline-flex items-center gap-1 ${alignCls}`}>
      <span>{children}</span>
      {sortKey &&
        (isActive ? (
          dir === 'desc'
            ? <ChevronDown size={12} className="text-plum-400" />
            : <ChevronUp size={12} className="text-plum-400" />
        ) : (
          <ArrowUpDown size={11} className="opacity-0 transition-opacity group-hover/th:opacity-60" />
        ))}
    </span>
  )
  return (
    <th
      title={title}
      className={`group/th whitespace-nowrap py-2.5 pr-4 text-[10.5px] font-bold uppercase tracking-[0.11em] ${
        isActive ? 'text-plum-300' : 'text-dim'
      } ${divider ? 'border-l border-hairline/40 pl-4' : ''} ${className}`}
      style={{ textAlign: align }}
    >
      {sortKey && onSort ? (
        <button onClick={() => onSort(sortKey)} className="transition-colors hover:text-plum-200">
          {content}
        </button>
      ) : (
        content
      )}
    </th>
  )
}

function EmptyState() {
  return (
    <div className="card grid place-items-center px-6 py-20 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl border border-hairline bg-raised/50 text-plum-500">
        <Search size={22} />
      </div>
      <div className="mt-4 text-[15px] font-semibold text-plum-100">No markets match this view</div>
      <div className="mt-1 max-w-sm text-[12.5px] text-dim">
        This network has no collector wired up yet, or your filters are too narrow. Try clearing the
        search or switching tabs.
      </div>
    </div>
  )
}
