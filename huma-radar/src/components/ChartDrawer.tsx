import { useEffect, useMemo, useState } from 'react'
import {
  Area, AreaChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Download, ExternalLink, Hourglass, X } from 'lucide-react'
import { CHAIN_MAP } from '../data/chains'
import { venueLabel } from '../data/markets'
import { formatDate, formatDateLong, formatPct, formatUsd } from '../lib/format'
import type { MarketRow, Range, Snapshot } from '../types'
import { AssetMark, ChainBadge, Delta, KindBadge, UtilBar } from './Primitives'

const RANGES: { id: Range; label: string }[] = [
  { id: 7, label: '7D' },
  { id: 30, label: '30D' },
  { id: 90, label: '90D' },
  { id: 365, label: '1Y' },
]

const TVL_COLOR = '#A974F1'
const BORROW_COLOR = '#F2C14E'

export function ChartDrawer({ row, onClose }: { row: MarketRow | null; onClose: () => void }) {
  const [range, setRange] = useState<Range>(30)

  useEffect(() => {
    if (!row) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [row, onClose])

  const series = useMemo(() => (row ? row.history.slice(-range) : []), [row, range])
  const tvlSeries = useMemo(() => series.filter((h) => h.tvl !== null), [series])
  const apySeries = useMemo(
    () => series.filter((h) => h.apy !== null || h.borrowApy !== null),
    [series],
  )

  const stats = useMemo(() => {
    if (apySeries.length < 2) return null
    const key = row?.borrowable ? 'borrowApy' : 'apy'
    const vals = apySeries.map((p) => p[key]).filter((v): v is number => v !== null)
    if (vals.length < 2) return null
    return {
      apyPp: vals[vals.length - 1] - vals[0],
      apyAvg: vals.reduce((a, v) => a + v, 0) / vals.length,
      apyMin: Math.min(...vals),
      apyMax: Math.max(...vals),
    }
  }, [apySeries, row])

  if (!row) return null

  const accent = CHAIN_MAP[row.chain].color
  const d = row.deltas
  const isVault = row.kind === 'vault'
  const isPool = row.kind === 'pool'
  const tvlLabel = isPool ? 'Pool TVL' : isVault ? 'Vault TVL' : 'Total Supplied'
  const apyLabel = isPool ? 'Fee APY' : isVault ? 'Net APY' : 'Supply APY'

  const exportCsv = () => {
    const header = 'date,tvl_usd,borrowed_usd,available_usd,apy_pct,borrow_apy_pct,utilization_pct\n'
    const body = row.history
      .map((h) =>
        [h.date, h.tvl, h.borrowed, h.available, h.apy, h.borrowApy, h.utilization]
          .map((v) => (v === null ? '' : v))
          .join(','),
      )
      .join('\n')
    const url = URL.createObjectURL(new Blob([header + body], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${row.id}-history.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 animate-rise bg-void/75 backdrop-blur-sm" aria-hidden />
      <aside
        role="dialog"
        aria-label={`${row.name} history`}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[820px] animate-slidein flex-col
                   border-l border-hairline bg-abyss/95 shadow-[-32px_0_80px_-24px_rgba(0,0,0,.9)] backdrop-blur-2xl"
      >
        <div className="relative shrink-0 border-b border-hairline/70 px-6 py-5">
          <div
            className="pointer-events-none absolute -top-24 left-1/3 h-48 w-72 rounded-full opacity-[0.16] blur-3xl"
            style={{ background: accent }}
          />
          <div className="relative flex items-start gap-3">
            <AssetMark symbol={row.symbol} chain={row.chain} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-[17px] font-bold tracking-tight text-white">{row.name}</h2>
                <KindBadge kind={row.kind} borrowable={row.borrowable} rollup={row.rollup} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-muted">
                  {row.protocol} · {isVault ? row.venue : venueLabel(row.venue)}
                </span>
                <span className="text-dim">·</span>
                <ChainBadge chain={row.chain} />
                <span className="chip !text-[10.5px]">{row.assetName}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {row.url && (
                <a href={row.url} target="_blank" rel="noreferrer noopener"
                  className="btn !px-2.5 !py-1.5 !text-[12px]" title="Open in the protocol app">
                  <ExternalLink size={13} /> App
                </a>
              )}
              <button onClick={exportCsv} className="btn !px-2.5 !py-1.5 !text-[12px]" title="Download full history as CSV">
                <Download size={13} /> CSV
              </button>
              <button onClick={onClose} className="btn !px-2 !py-2" aria-label="Close">
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="relative mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            <Stat
              label={tvlLabel}
              value={formatUsd(row.tvl)}
              sub={
                <span className="flex items-center gap-2">
                  <Delta value={d.tvl7d.pct} />
                  <span className="text-dim">/</span>
                  <Delta value={d.tvl30d.pct} />
                </span>
              }
            />
            <Stat
              label={apyLabel}
              value={formatPct(row.apy)}
              accent={TVL_COLOR}
              sub={
                <span className="flex items-center gap-2">
                  <Delta value={d.apy7d.abs} suffix="pp" />
                  <span className="text-dim">/</span>
                  <Delta value={d.apy30d.abs} suffix="pp" />
                </span>
              }
            />
            <Stat
              label="Total Borrowed"
              value={row.borrowable ? formatUsd(row.borrowed) : '—'}
              sub={
                row.borrowable ? (
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-dim">util</span>
                    <UtilBar value={row.utilization} />
                  </span>
                ) : (
                  <span className="text-[11px] text-dim">
                    {isPool
                      ? 'AMM pool — no borrow side'
                      : isVault
                        ? 'vault — no borrow side'
                        : 'borrowing disabled'}
                  </span>
                )
              }
            />
            <Stat
              label="Borrow APY"
              value={row.borrowable ? formatPct(row.borrowApy) : '—'}
              accent={row.borrowable ? BORROW_COLOR : undefined}
              sub={
                row.borrowable ? (
                  <span className="flex items-center gap-2">
                    <Delta value={d.borrowApy7d.abs} suffix="pp" />
                    <span className="text-dim">/</span>
                    <Delta value={d.borrowApy30d.abs} suffix="pp" />
                  </span>
                ) : null
              }
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline/70 px-6 py-3">
          <div className="flex items-center gap-1 rounded-xl border border-hairline bg-panel/60 p-1">
            {RANGES.map((r) => (
              <button key={r.id} onClick={() => setRange(r.id)} className={`seg ${range === r.id ? 'seg-on' : ''}`}>
                {r.label}
              </button>
            ))}
          </div>
          {stats && (
            <div className="flex items-center gap-4 text-[11px] text-dim">
              <span>
                Range APY <Delta value={stats.apyPp} suffix="pp" />
              </span>
              <span className="num">
                avg {formatPct(stats.apyAvg)} · {formatPct(stats.apyMin)}–{formatPct(stats.apyMax)}
              </span>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <ChartPanel
            title={isPool || isVault ? `${tvlLabel} over time` : 'Supplied & borrowed over time'}
            accent={accent}
            badge={tvlSeries.length > 1 ? `${tvlSeries.length} days` : undefined}
          >
            {tvlSeries.length > 1 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={tvlSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillTvl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={accent} stopOpacity={0.42} />
                      <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="fillBorrowed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BORROW_COLOR} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={BORROW_COLOR} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(145,70,232,0.10)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatDate} minTickGap={28}
                    tick={{ fill: '#5D5478', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => formatUsd(v)} width={64} domain={['auto', 'auto']}
                    tick={{ fill: '#5D5478', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<TvlTip accent={accent} isVault={isVault} />} cursor={{ stroke: accent, strokeOpacity: 0.35 }} />
                  {row.borrowable && (
                    <Legend content={<ChartLegend items={[
                      { label: 'Supplied', color: accent },
                      { label: 'Borrowed', color: BORROW_COLOR },
                    ]} />} />
                  )}
                  <Area type="monotone" dataKey="tvl" name="Supplied" stroke={accent} strokeWidth={2}
                    fill="url(#fillTvl)" dot={false} animationDuration={650}
                    activeDot={{ r: 4, fill: accent, stroke: '#0A0713', strokeWidth: 2 }} />
                  {row.borrowable && (
                    <Area type="monotone" dataKey="borrowed" name="Borrowed" stroke={BORROW_COLOR} strokeWidth={2}
                      fill="url(#fillBorrowed)" dot={false} animationDuration={650}
                      activeDot={{ r: 4, fill: BORROW_COLOR, stroke: '#0A0713', strokeWidth: 2 }} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <Collecting stored={tvlSeries.length} protocol={row.protocol} />
            )}
          </ChartPanel>

          <ChartPanel
            title={row.borrowable ? 'Supply & borrow APY over time' : 'APY over time'}
            accent={TVL_COLOR}
            badge={apySeries.length > 1 ? `${apySeries.length} days` : undefined}
          >
            {apySeries.length > 1 ? (
              <ResponsiveContainer width="100%" height={210}>
                <LineChart data={apySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(145,70,232,0.10)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatDate} minTickGap={28}
                    tick={{ fill: '#5D5478', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `${v}%`} width={48} domain={['auto', 'auto']}
                    tick={{ fill: '#5D5478', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ApyTip isVault={isVault} />} cursor={{ stroke: TVL_COLOR, strokeOpacity: 0.35 }} />
                  {row.borrowable && (
                    <Legend content={<ChartLegend items={[
                      { label: 'Supply APY', color: TVL_COLOR },
                      { label: 'Borrow APY', color: BORROW_COLOR },
                    ]} />} />
                  )}
                  <Line type="monotone" dataKey="apy" name="APY" stroke={TVL_COLOR}
                    strokeWidth={2} dot={false} animationDuration={650}
                    activeDot={{ r: 4, fill: TVL_COLOR, stroke: '#0A0713', strokeWidth: 2 }} />
                  {row.borrowable && (
                    <Line type="monotone" dataKey="borrowApy" name="Borrow APY" stroke={BORROW_COLOR}
                      strokeWidth={2} dot={false} animationDuration={650}
                      activeDot={{ r: 4, fill: BORROW_COLOR, stroke: '#0A0713', strokeWidth: 2 }} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Collecting stored={apySeries.length} protocol={row.protocol} />
            )}
          </ChartPanel>

          <HistoryTable rows={[...series].reverse()} borrowable={row.borrowable} isVault={isVault} />
        </div>
      </aside>
    </>
  )
}

function Stat({
  label, value, sub, accent,
}: { label: string; value: string; sub?: React.ReactNode; accent?: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.11em] text-dim">{label}</div>
      <div className="num mt-1.5 text-[18px] font-bold leading-none" style={{ color: accent ?? '#fff' }}>
        {value}
      </div>
      {sub && <div className="mt-2">{sub}</div>}
    </div>
  )
}

function ChartPanel({
  title, badge, accent, children,
}: { title: string; badge?: string; accent: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[12.5px] font-semibold text-plum-100">
          <span className="h-2 w-2 rounded-full" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />
          {title}
        </h3>
        {badge && <span className="chip num !text-[10px]">{badge}</span>}
      </div>
      {children}
    </section>
  )
}

function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mt-1 flex items-center justify-center gap-4">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-[10.5px] text-muted">
          <span className="h-[3px] w-4 rounded-full" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

function TvlTip({ active, payload, label, accent, isVault }: {
  active?: boolean; payload?: { payload: Snapshot }[]; label?: string; accent: string; isVault: boolean
}) {
  if (!active || !payload?.length || !label) return null
  const p = payload[0].payload
  return (
    <div className="rounded-xl border border-hairline bg-abyss/95 px-3 py-2 shadow-glow backdrop-blur">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-dim">{formatDateLong(label)}</div>
      <div className="num mt-1.5 text-[13px] font-bold" style={{ color: accent }}>
        {isVault ? 'TVL' : 'Supplied'} {formatUsd(p.tvl)}
      </div>
      {p.borrowed !== null && (
        <div className="num text-[13px] font-bold text-amber-300">Borrowed {formatUsd(p.borrowed)}</div>
      )}
      {p.utilization !== null && (
        <div className="num mt-1 text-[10.5px] text-dim">Util {formatPct(p.utilization, 1)}</div>
      )}
    </div>
  )
}

function ApyTip({ active, payload, label, isVault }: {
  active?: boolean; payload?: { payload: Snapshot }[]; label?: string; isVault: boolean
}) {
  if (!active || !payload?.length || !label) return null
  const p = payload[0].payload
  return (
    <div className="rounded-xl border border-hairline bg-abyss/95 px-3 py-2 shadow-glow backdrop-blur">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-dim">{formatDateLong(label)}</div>
      <div className="num mt-1.5 text-[13px] font-bold" style={{ color: TVL_COLOR }}>
        {isVault ? 'Net APY' : 'Supply'} {formatPct(p.apy)}
      </div>
      {p.borrowApy !== null && (
        <div className="num text-[13px] font-bold" style={{ color: BORROW_COLOR }}>
          Borrow {formatPct(p.borrowApy)}
        </div>
      )}
      {p.tvl !== null && <div className="num mt-1 text-[10.5px] text-dim">TVL {formatUsd(p.tvl)}</div>}
    </div>
  )
}

/** Why a series is short, in the terms of the venue that publishes it. */
function whyShort(protocol: string): string {
  if (protocol === 'Fluid' || protocol === 'JupLend') {
    return `${protocol} exposes only current state, with no historical endpoint, so this series builds from the first collector run.`
  }
  return `${protocol} publishes historical APY but not historical supplied/borrowed totals, so this series builds from the first collector run.`
}

function Collecting({ stored, protocol }: { stored: number; protocol: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-hairline px-6 py-12 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-xl border border-hairline bg-raised/50 text-plum-500">
        <Hourglass size={17} />
      </div>
      <div className="mt-3 text-[13px] font-semibold text-plum-100">Collecting history</div>
      <div className="mt-1 max-w-md text-[12px] text-dim">
        {whyShort(protocol)} {stored} day{stored === 1 ? '' : 's'} stored so far — the chart appears
        once there are two.
      </div>
    </div>
  )
}

function HistoryTable({
  rows, borrowable, isVault,
}: { rows: Snapshot[]; borrowable: boolean; isVault: boolean }) {
  const heads = [
    'Date',
    isVault ? 'TVL' : 'Supplied',
    isVault ? 'Net APY' : 'Supply APY',
    ...(borrowable ? ['Borrowed', 'Borrow APY', 'Util'] : []),
  ]
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-hairline/70 px-4 py-3">
        <h3 className="text-[12.5px] font-semibold text-plum-100">Daily history</h3>
        <span className="text-[11px] text-dim">{rows.length} snapshots</span>
      </div>
      <div className="max-h-[340px] overflow-y-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-panel/95 backdrop-blur">
            <tr className="border-b border-hairline/60">
              {heads.map((h, i) => (
                <th
                  key={h}
                  className={`whitespace-nowrap px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-dim ${
                    i === 0 ? 'text-left' : 'text-right'
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date} className="border-b border-hairline/30 last:border-0 hover:bg-plum-950/25">
                <td className="num px-4 py-2 text-[12px] text-muted">{formatDateLong(r.date)}</td>
                <td className="num px-4 py-2 text-right text-[12px] text-white">{formatUsd(r.tvl)}</td>
                <td className="num px-4 py-2 text-right text-[12px]" style={{ color: TVL_COLOR }}>
                  {formatPct(r.apy)}
                </td>
                {borrowable && (
                  <>
                    <td className="num px-4 py-2 text-right text-[12px] text-white">{formatUsd(r.borrowed)}</td>
                    <td className="num px-4 py-2 text-right text-[12px]" style={{ color: BORROW_COLOR }}>
                      {formatPct(r.borrowApy)}
                    </td>
                    <td className="num px-4 py-2 text-right text-[12px] text-muted">
                      {formatPct(r.utilization, 1)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
