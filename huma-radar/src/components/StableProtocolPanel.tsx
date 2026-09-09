import { useMemo, useState } from 'react'
import {
  ArrowUpDown, ChevronDown, ChevronUp, ExternalLink, LineChart, Landmark, SlidersHorizontal,
} from 'lucide-react'
import { STABLE_PROTOCOLS } from '../data/stableprotocols'
import { formatPct, formatUsd } from '../lib/format'
import type { Change, DeltaMode, StableProtocolRow, StableProtocolSortKey } from '../types'
import { Delta, Sparkline } from './Primitives'

/**
 * TVL and yield for the stablecoin products themselves — what each protocol
 * pays on its own coin, rather than what a lending venue pays to hold it.
 */
export function StableProtocolPanel({
  onOpenChart, activeId,
}: { onOpenChart: (row: StableProtocolRow) => void; activeId?: string | null }) {
  const [sortKey, setSortKey] = useState<StableProtocolSortKey>('tvl')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [deltaMode, setDeltaMode] = useState<DeltaMode>('pp')

  const onSort = (k: StableProtocolSortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir(k === 'name' || k === 'ticker' ? 'asc' : 'desc')
    }
  }

  const rows = useMemo(() => {
    const value = (r: StableProtocolRow): number | string | null => {
      switch (sortKey) {
        case 'name': return r.name.toLowerCase()
        case 'ticker': return r.ticker.toLowerCase()
        case 'apy': return r.apy
        case 'tvl': return r.tvl
        case 'tvl7d': return r.tvl7d.pct
        case 'tvl30d': return r.tvl30d.pct
        case 'apy7d': return deltaMode === 'pp' ? r.apy7d.abs : r.apy7d.pct
        case 'apy30d': return deltaMode === 'pp' ? r.apy30d.abs : r.apy30d.pct
      }
    }
    return [...STABLE_PROTOCOLS].sort((a, b) => {
      const va = value(a)
      const vb = value(b)
      // a product without the metric, or too young for the window, sinks
      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [sortKey, sortDir, deltaMode])

  const summary = useMemo(() => {
    const tvl = STABLE_PROTOCOLS.reduce((a, r) => a + (r.tvl ?? 0), 0)
    const yields = STABLE_PROTOCOLS.map((r) => r.apy).filter((v): v is number => v !== null)
    // TVL-weighted would let Sky and Ethena speak for the whole set; the median
    // says what a typical product on this list pays
    const sorted = [...yields].sort((a, b) => a - b)
    const mid = sorted.length >> 1
    const median = !sorted.length
      ? null
      : sorted.length % 2
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2
    return { tvl, median, withYield: yields.length }
  }, [])

  if (!STABLE_PROTOCOLS.length) return <EmptyState />

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline/70 px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-plum-100">
            <Landmark size={14} className="text-plum-400" />
            {STABLE_PROTOCOLS.length} stablecoin products
          </h2>
          <span className="num text-[11px] text-dim">
            {formatUsd(summary.tvl)} combined TVL · median {formatPct(summary.median)} across{' '}
            {summary.withYield} with a published yield
          </span>
        </div>

        <div
          className="flex items-center gap-1 rounded-xl border border-hairline bg-panel/60 p-1 backdrop-blur"
          title="Express yield changes as percentage points or as a relative percent"
        >
          <SlidersHorizontal size={13} className="ml-1.5 text-dim" />
          <button onClick={() => setDeltaMode('pp')} className={`seg ${deltaMode === 'pp' ? 'seg-on' : ''}`}>
            Yield Δ pp
          </button>
          <button onClick={() => setDeltaMode('pct')} className={`seg ${deltaMode === 'pct' ? 'seg-on' : ''}`}>
            %
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left" style={{ minWidth: 1140 }}>
          <thead>
            <tr className="border-b border-hairline/50 bg-raised/20">
              <th colSpan={3} />
              <th
                colSpan={3}
                className="border-l border-hairline/40 py-1.5 text-center text-[9.5px] font-bold uppercase tracking-[0.18em] text-plum-400/70"
              >
                Yield
              </th>
              <th
                colSpan={3}
                className="border-l border-hairline/40 py-1.5 text-center text-[9.5px] font-bold uppercase tracking-[0.18em] text-amber-400/70"
              >
                TVL
              </th>
              <th />
            </tr>
            <tr className="border-b border-hairline/70 bg-raised/30">
              <Th className="w-11 pl-5 text-center">#</Th>
              <Th sortKey="name" active={sortKey} dir={sortDir} onSort={onSort}>Protocol</Th>
              <Th sortKey="ticker" active={sortKey} dir={sortDir} onSort={onSort}>Ticker</Th>

              <Th align="right" divider sortKey="apy" active={sortKey} dir={sortDir} onSort={onSort}
                title="Current APY as DefiLlama publishes it">
                Yield
              </Th>
              <Th align="right" sortKey="apy7d" active={sortKey} dir={sortDir} onSort={onSort}>7D</Th>
              <Th align="right" sortKey="apy30d" active={sortKey} dir={sortDir} onSort={onSort}>30D</Th>

              <Th align="right" divider sortKey="tvl" active={sortKey} dir={sortDir} onSort={onSort}>
                TVL
              </Th>
              <Th align="right" sortKey="tvl7d" active={sortKey} dir={sortDir} onSort={onSort}>7D</Th>
              <Th align="right" sortKey="tvl30d" active={sortKey} dir={sortDir} onSort={onSort}>30D</Th>

              <Th align="right" className="w-[130px] pr-5">Chart</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const active = activeId === r.id
              return (
                <tr
                  key={r.id}
                  className={
                    'group border-b border-hairline/40 transition-colors last:border-0 ' +
                    (active ? 'bg-plum-600/12' : 'hover:bg-plum-950/25')
                  }
                >
                  <td className="num py-3 pl-5 text-center text-[11px] text-dim">{i + 1}</td>

                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: r.color, boxShadow: `0 0 10px ${r.color}80` }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13.5px] font-semibold text-white">{r.name}</span>
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="shrink-0 text-dim opacity-0 transition-opacity hover:text-plum-300 group-hover:opacity-100"
                            title="Open the DefiLlama page"
                          >
                            <ExternalLink size={12} />
                          </a>
                        </div>
                        <div className="truncate text-[11px] text-dim" title={r.venue ?? undefined}>
                          {r.venue ?? '—'}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 pr-4">
                    <span
                      className="num inline-flex items-center rounded-md border px-2 py-0.5 text-[11.5px] font-semibold"
                      style={{ color: r.color, borderColor: `${r.color}33`, background: `${r.color}12` }}
                    >
                      {r.ticker}
                    </span>
                  </td>

                  <td className="num border-l border-hairline/40 py-3 pl-4 pr-4 text-right text-[13.5px] font-semibold text-plum-200">
                    {r.apy === null ? <NoYield kind={r.kind} name={r.name} /> : formatPct(r.apy)}
                  </td>
                  <td className="py-3 pr-4 text-right"><ApyDelta change={r.apy7d} mode={deltaMode} /></td>
                  <td className="py-3 pr-4 text-right"><ApyDelta change={r.apy30d} mode={deltaMode} /></td>

                  <td className="num border-l border-hairline/40 py-3 pl-4 pr-4 text-right text-[13.5px] font-semibold text-white">
                    {formatUsd(r.tvl)}
                    {r.kind === 'protocol' && (
                      <span
                        className="block whitespace-nowrap text-[9px] font-bold uppercase tracking-wide text-dim"
                        title="This row quotes a DefiLlama protocol page, whose TVL covers everything the protocol issues — not the ticker alone"
                      >
                        protocol-wide
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right"><Delta value={r.tvl7d.pct} /></td>
                  <td className="py-3 pr-4 text-right"><Delta value={r.tvl30d.pct} /></td>

                  <td className="py-3 pr-5 text-right">
                    <div className="flex items-center justify-end gap-2.5">
                      <Sparkline data={headlineSpark(r)} color={r.color} width={52} height={22} />
                      <button
                        onClick={() => onOpenChart(r)}
                        className={
                          'btn whitespace-nowrap !px-2.5 !py-1.5 !text-[12px] ' +
                          (active ? 'btn-primary' : 'opacity-70 group-hover:opacity-100')
                        }
                        title="Show TVL and yield history"
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

/** 30 days of yield where there is one, else TVL — whichever the row is about. */
function headlineSpark(r: StableProtocolRow): number[] {
  const key = r.apy !== null ? 'apy' : 'tvl'
  return r.history.slice(-30).map((h) => h[key]).filter((v): v is number => v !== null)
}

/** Render a Change through the current pp/% preference. */
function ApyDelta({ change, mode }: { change: Change; mode: DeltaMode }) {
  return mode === 'pp'
    ? <Delta value={change.abs} suffix="pp" />
    : <Delta value={change.pct} suffix="%" />
}

/**
 * DefiLlama indexes some protocols' TVL without listing a yield pool for them,
 * so the rate is genuinely absent rather than zero.
 */
function NoYield({ kind, name }: { kind: 'pool' | 'protocol'; name: string }) {
  return (
    <span
      className="text-dim"
      title={
        kind === 'protocol'
          ? `DefiLlama indexes ${name}'s TVL but publishes no yield pool for it, so there is no rate to show`
          : 'No rate published for this pool yet'
      }
    >
      —
    </span>
  )
}

function Th({
  children, align = 'left', className = '', sortKey, active, dir, onSort, divider, title,
}: {
  children?: React.ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
  sortKey?: StableProtocolSortKey
  active?: StableProtocolSortKey
  dir?: 'asc' | 'desc'
  onSort?: (k: StableProtocolSortKey) => void
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
        <Landmark size={22} />
      </div>
      <div className="mt-4 text-[15px] font-semibold text-plum-100">No protocol data collected yet</div>
      <div className="mt-1 max-w-sm text-[12.5px] text-dim">
        Run <span className="num text-plum-300">npm run collect</span> to pull TVL and yield history
        from DefiLlama.
      </div>
    </div>
  )
}
