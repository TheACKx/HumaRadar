import { useMemo, useState } from 'react'
import { ArrowUpDown, ChevronDown, ChevronUp, Coins, ExternalLink, LineChart, TrendingUp } from 'lucide-react'
import { STABLE_CHAINS, STABLE_TOTAL } from '../data/stablecoins'
import { formatUsd, formatUsdSigned } from '../lib/format'
import type { StableRow, StableSortKey } from '../types'
import { Delta, Sparkline } from './Primitives'

/**
 * Stablecoin supply per chain, from DefiLlama. This is circulating market cap,
 * not TVL: it counts every stablecoin issued on a chain whether or not it is
 * deposited anywhere, so it is the ceiling the lending tabs draw from rather
 * than a total of them.
 */
export function StablecoinPanel({
  onOpenChart, activeId,
}: { onOpenChart: (row: StableRow) => void; activeId?: string | null }) {
  const [sortKey, setSortKey] = useState<StableSortKey>('total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const onSort = (k: StableSortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir(k === 'name' ? 'asc' : 'desc')
    }
  }

  const rows = useMemo(() => {
    const value = (r: StableRow): number | string | null => {
      switch (sortKey) {
        case 'name': return r.name.toLowerCase()
        case 'total': return r.total
        case 'change7d': return r.change7d.pct
        case 'change30d': return r.change30d.pct
      }
    }
    return [...STABLE_CHAINS].sort((a, b) => {
      const va = value(a)
      const vb = value(b)
      // a chain too young for the window always sinks to the bottom
      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [sortKey, sortDir])

  // the tracked chains are a slice of the network, so this is coverage, not a total
  const trackedTotal = STABLE_CHAINS.reduce((a, r) => a + (r.total ?? 0), 0)
  const networkTotal = STABLE_TOTAL?.total ?? null

  return (
    <>
      <TotalCards onOpenChart={onOpenChart} activeId={activeId} trackedTotal={trackedTotal} />

      <div className="mt-6 card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline/70 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-plum-100">
            <Coins size={14} className="text-plum-400" />
            Stablecoin market cap by chain
          </h2>
          <span className="text-[11px] text-dim">
            {STABLE_CHAINS.length} chains tracked
            {networkTotal ? ` · ${((trackedTotal / networkTotal) * 100).toFixed(1)}% of all chains` : ''}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left" style={{ minWidth: 880 }}>
            <thead>
              <tr className="border-b border-hairline/70 bg-raised/30">
                <Th className="w-11 pl-5 text-center">#</Th>
                <Th sortKey="name" active={sortKey} dir={sortDir} onSort={onSort}>Chain</Th>
                <Th align="right" divider sortKey="total" active={sortKey} dir={sortDir} onSort={onSort}
                  title="Circulating stablecoin supply, every peg type converted to USD">
                  Total Value
                </Th>
                <Th align="right" sortKey="change7d" active={sortKey} dir={sortDir} onSort={onSort}
                  title="Change over the last 7 days">
                  Weekly Change
                </Th>
                <Th align="right" sortKey="change30d" active={sortKey} dir={sortDir} onSort={onSort}
                  title="Change over the last 30 days">
                  Monthly Change
                </Th>
                <Th align="right" className="w-[120px]" title="Share of the tracked chains' combined supply">
                  Share
                </Th>
                <Th align="right" className="w-[130px] pr-5">Chart</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const active = activeId === r.id
                const share = trackedTotal ? ((r.total ?? 0) / trackedTotal) * 100 : 0
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
                          <div className="text-[11px] text-dim">{r.history.length} days of history</div>
                        </div>
                      </div>
                    </td>

                    <td className="num border-l border-hairline/40 py-3 pl-4 pr-4 text-right text-[13.5px] font-semibold text-white">
                      {formatUsd(r.total)}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <ChangeCell change={r.change7d} />
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <ChangeCell change={r.change30d} />
                    </td>

                    <td className="py-3 pr-4">
                      <ShareBar pct={share} color={r.color} />
                    </td>

                    <td className="py-3 pr-5 text-right">
                      <div className="flex items-center justify-end gap-2.5">
                        <Sparkline data={r.history.slice(-30).map((h) => h.total)} color={r.color} width={52} height={22} />
                        <button
                          onClick={() => onOpenChart(r)}
                          className={
                            'btn whitespace-nowrap !px-2.5 !py-1.5 !text-[12px] ' +
                            (active ? 'btn-primary' : 'opacity-70 group-hover:opacity-100')
                          }
                          title="Show market cap history"
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
    </>
  )
}

/**
 * The network-wide headline. It is not a row in the table below because it
 * contains every chain there and hundreds more, so ranking it alongside them
 * would say nothing.
 */
function TotalCards({
  onOpenChart, activeId, trackedTotal,
}: { onOpenChart: (row: StableRow) => void; activeId?: string | null; trackedTotal: number }) {
  const total = STABLE_TOTAL
  if (!total) {
    return (
      <div className="card grid place-items-center px-6 py-16 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-hairline bg-raised/50 text-plum-500">
          <Coins size={22} />
        </div>
        <div className="mt-4 text-[15px] font-semibold text-plum-100">No stablecoin data collected yet</div>
        <div className="mt-1 max-w-sm text-[12.5px] text-dim">
          Run <span className="num text-plum-300">npm run collect</span> to pull the supply history
          from DefiLlama.
        </div>
      </div>
    )
  }

  const active = activeId === total.id
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.6fr_1fr_1fr]">
      <div className="card group relative overflow-hidden p-5">
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full opacity-[0.16] blur-2xl"
          style={{ background: total.color }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[220px] flex-1">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-hairline bg-raised/70 text-plum-400">
                <Coins size={14} />
              </span>
              <span className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                Total Stablecoin Market Cap
              </span>
            </div>
            <div className="num mt-3 text-[34px] font-bold leading-none text-white">
              {formatUsd(total.total)}
            </div>
            <div className="num mt-2 text-[11.5px] text-dim">
              {formatUsd(total.total, { compact: false })} across every chain DefiLlama indexes
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2.5">
            <Sparkline data={total.history.slice(-90).map((h) => h.total)} color={total.color} width={140} height={40} />
            <button
              onClick={() => onOpenChart(total)}
              className={'btn whitespace-nowrap !px-2.5 !py-1.5 !text-[12px] ' + (active ? 'btn-primary' : '')}
              title="Show total market cap history"
            >
              <LineChart size={13} />
              Graph
            </button>
          </div>
        </div>
        <div className="relative mt-4 border-t border-hairline/60 pt-3 text-[11px] text-dim">
          Tracked chains below hold {formatUsd(trackedTotal)} of it
          {total.total ? ` · ${((trackedTotal / total.total) * 100).toFixed(1)}%` : ''}
        </div>
      </div>

      <ChangeCard label="Weekly Change" change={total.change7d} color={total.color} days={7} />
      <ChangeCard label="Monthly Change" change={total.change30d} color={total.color} days={30} />
    </div>
  )
}

function ChangeCard({
  label, change, color, days,
}: { label: string; change: { pct: number | null; abs: number | null }; color: string; days: number }) {
  return (
    <div className="card group relative overflow-hidden p-5">
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-40 w-40 rounded-full opacity-[0.12] blur-2xl"
        style={{ background: color }}
      />
      <div className="relative">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-hairline bg-raised/70 text-plum-400">
            <TrendingUp size={14} />
          </span>
          <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            {label}
          </span>
        </div>
        <div className="num mt-3 text-[26px] font-bold leading-none text-white">
          {formatUsdSigned(change.abs)}
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <Delta value={change.pct} size="md" />
          <span className="text-[11px] text-dim">over {days} days</span>
        </div>
      </div>
    </div>
  )
}

/** Dollar move on top, percent underneath — the size of a move matters as much as its rate. */
function ChangeCell({ change }: { change: { pct: number | null; abs: number | null } }) {
  if (change.abs === null) {
    return (
      <span className="num text-[13px] text-dim" title="Younger than this window">
        —
      </span>
    )
  }
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="num text-[13px] font-semibold text-white">{formatUsdSigned(change.abs)}</span>
      <Delta value={change.pct} />
    </div>
  )
}

function ShareBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex flex-col items-end gap-1" title={`${pct.toFixed(2)}% of the tracked chains' supply`}>
      <span className="num text-[11.5px] font-semibold text-plum-200">{pct.toFixed(1)}%</span>
      <span className="h-1 w-16 overflow-hidden rounded-full bg-raised">
        <span
          className="block h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.min(100, pct)}%`, background: color, boxShadow: `0 0 6px ${color}90` }}
        />
      </span>
    </div>
  )
}

function Th({
  children, align = 'left', className = '', sortKey, active, dir, onSort, divider, title,
}: {
  children?: React.ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
  sortKey?: StableSortKey
  active?: StableSortKey
  dir?: 'asc' | 'desc'
  onSort?: (k: StableSortKey) => void
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
