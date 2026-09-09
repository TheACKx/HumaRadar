import { useEffect, useMemo, useState } from 'react'
import {
  Area, AreaChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Download, ExternalLink, Hourglass, X } from 'lucide-react'
import { formatDate, formatDateLong, formatPct, formatUsd, formatUsdSigned } from '../lib/format'
import type { Range, StableProtocolPoint, StableProtocolRow } from '../types'
import { Delta } from './Primitives'

const RANGES: { id: Range; label: string }[] = [
  { id: 7, label: '7D' },
  { id: 30, label: '30D' },
  { id: 90, label: '90D' },
  { id: 365, label: '1Y' },
]

const APY_COLOR = '#A974F1'

/** TVL and yield history for one stablecoin product. */
export function StableProtocolDrawer({
  row, onClose,
}: { row: StableProtocolRow | null; onClose: () => void }) {
  const [range, setRange] = useState<Range>(30)

  useEffect(() => {
    if (!row) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [row, onClose])

  const series = useMemo(() => (row ? row.history.slice(-range) : []), [row, range])
  const tvlSeries = useMemo(() => series.filter((h) => h.tvl !== null), [series])
  const apySeries = useMemo(() => series.filter((h) => h.apy !== null), [series])

  const stats = useMemo(() => {
    if (apySeries.length < 2) return null
    const vals = apySeries.map((p) => p.apy as number)
    return {
      pp: vals[vals.length - 1] - vals[0],
      avg: vals.reduce((a, v) => a + v, 0) / vals.length,
      min: Math.min(...vals),
      max: Math.max(...vals),
    }
  }, [apySeries])

  if (!row) return null

  const accent = row.color

  const exportCsv = () => {
    const header = 'date,tvl_usd,apy_pct\n'
    const body = row.history
      .map((h) => [h.date, h.tvl, h.apy].map((v) => (v === null ? '' : v)).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob([header + body], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${row.id}-${row.ticker}-history.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 animate-rise bg-void/75 backdrop-blur-sm" aria-hidden />
      <aside
        role="dialog"
        aria-label={`${row.name} ${row.ticker} history`}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[820px] animate-slidein flex-col
                   border-l border-hairline bg-abyss/95 shadow-[-32px_0_80px_-24px_rgba(0,0,0,.9)] backdrop-blur-2xl"
      >
        <div className="relative shrink-0 border-b border-hairline/70 px-6 py-5">
          <div
            className="pointer-events-none absolute -top-24 left-1/3 h-48 w-72 rounded-full opacity-[0.16] blur-3xl"
            style={{ background: accent }}
          />
          <div className="relative flex items-start gap-3">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-[9px] font-bold"
              style={{
                borderColor: `${accent}2E`,
                background: `linear-gradient(140deg, ${accent}22, rgba(22,15,39,.9))`,
                color: accent,
              }}
            >
              {row.ticker.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-[17px] font-bold tracking-tight text-white">{row.name}</h2>
                <span
                  className="num inline-flex items-center rounded-md border px-2 py-0.5 text-[11.5px] font-semibold"
                  style={{ color: accent, borderColor: `${accent}33`, background: `${accent}12` }}
                >
                  {row.ticker}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-muted">{row.venue ?? 'DefiLlama'}</span>
                <span className="text-dim">·</span>
                <span className="chip !text-[10.5px]">{row.history.length} days stored</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a href={row.url} target="_blank" rel="noreferrer noopener"
                className="btn !px-2.5 !py-1.5 !text-[12px]" title="Open the DefiLlama page">
                <ExternalLink size={13} /> DefiLlama
              </a>
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
              label="Yield"
              value={formatPct(row.apy)}
              accent={APY_COLOR}
              sub={
                <span className="flex items-center gap-2">
                  <Delta value={row.apy7d.abs} suffix="pp" />
                  <span className="text-dim">/</span>
                  <Delta value={row.apy30d.abs} suffix="pp" />
                </span>
              }
            />
            <Stat
              label={row.kind === 'protocol' ? 'TVL (protocol-wide)' : 'TVL'}
              value={formatUsd(row.tvl)}
              sub={
                <span className="flex items-center gap-2">
                  <Delta value={row.tvl7d.pct} />
                  <span className="text-dim">/</span>
                  <Delta value={row.tvl30d.pct} />
                </span>
              }
            />
            <Stat
              label="30D TVL Move"
              value={formatUsdSigned(row.tvl30d.abs)}
              sub={<Delta value={row.tvl30d.pct} size="md" />}
            />
            <Stat
              label={`${range === 365 ? '1Y' : `${range}D`} Yield Range`}
              value={stats ? `${formatPct(stats.min)}–${formatPct(stats.max)}` : '—'}
              sub={
                stats ? (
                  <span className="num text-[11px] text-dim">avg {formatPct(stats.avg)}</span>
                ) : (
                  <span className="text-[11px] text-dim">no yield history</span>
                )
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
                Range yield <Delta value={stats.pp} suffix="pp" />
              </span>
              <span className="num">avg {formatPct(stats.avg)}</span>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <ChartPanel
            title={row.kind === 'protocol' ? 'Protocol TVL over time' : 'TVL over time'}
            accent={accent}
            badge={tvlSeries.length > 1 ? `${tvlSeries.length} days` : undefined}
          >
            {tvlSeries.length > 1 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={tvlSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillProtoTvl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={accent} stopOpacity={0.42} />
                      <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(145,70,232,0.10)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatDate} minTickGap={28}
                    tick={{ fill: '#5D5478', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => formatUsd(v)} width={64} domain={['auto', 'auto']}
                    tick={{ fill: '#5D5478', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<PointTip accent={accent} />} cursor={{ stroke: accent, strokeOpacity: 0.35 }} />
                  <Area type="monotone" dataKey="tvl" name="TVL" stroke={accent} strokeWidth={2}
                    fill="url(#fillProtoTvl)" dot={false} animationDuration={650}
                    activeDot={{ r: 4, fill: accent, stroke: '#0A0713', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <Collecting what="TVL" stored={tvlSeries.length} name={row.name} />
            )}
          </ChartPanel>

          <ChartPanel
            title="Yield over time"
            accent={APY_COLOR}
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
                  <Tooltip content={<PointTip accent={APY_COLOR} />} cursor={{ stroke: APY_COLOR, strokeOpacity: 0.35 }} />
                  <Line type="monotone" dataKey="apy" name="Yield" stroke={APY_COLOR}
                    strokeWidth={2} dot={false} animationDuration={650}
                    activeDot={{ r: 4, fill: APY_COLOR, stroke: '#0A0713', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Collecting what="yield" stored={apySeries.length} name={row.name} />
            )}
          </ChartPanel>

          <HistoryTable rows={[...series].reverse()} />
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

/** One tooltip for both charts — each point carries TVL and yield together. */
function PointTip({ active, payload, label, accent }: {
  active?: boolean; payload?: { payload: StableProtocolPoint }[]; label?: string; accent: string
}) {
  if (!active || !payload?.length || !label) return null
  const p = payload[0].payload
  return (
    <div className="rounded-xl border border-hairline bg-abyss/95 px-3 py-2 shadow-glow backdrop-blur">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-dim">{formatDateLong(label)}</div>
      {p.tvl !== null && (
        <div className="num mt-1.5 text-[13px] font-bold" style={{ color: accent }}>
          TVL {formatUsd(p.tvl)}
        </div>
      )}
      {p.apy !== null && (
        <div className="num text-[13px] font-bold" style={{ color: APY_COLOR }}>
          Yield {formatPct(p.apy)}
        </div>
      )}
    </div>
  )
}

function Collecting({ what, stored, name }: { what: string; stored: number; name: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-hairline px-6 py-12 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-xl border border-hairline bg-raised/50 text-plum-500">
        <Hourglass size={17} />
      </div>
      <div className="mt-3 text-[13px] font-semibold text-plum-100">No {what} chart yet</div>
      <div className="mt-1 max-w-md text-[12px] text-dim">
        {stored === 0
          ? `DefiLlama publishes no ${what} for ${name} in this window.`
          : `DefiLlama publishes ${stored} day of ${what} for ${name} in this window — the chart appears once there are two.`}
      </div>
    </div>
  )
}

function HistoryTable({ rows }: { rows: StableProtocolPoint[] }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-hairline/70 px-4 py-3">
        <h3 className="text-[12.5px] font-semibold text-plum-100">Daily history</h3>
        <span className="text-[11px] text-dim">{rows.length} days</span>
      </div>
      <div className="max-h-[340px] overflow-y-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-panel/95 backdrop-blur">
            <tr className="border-b border-hairline/60">
              {['Date', 'TVL', 'Yield'].map((h, i) => (
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
                <td className="num px-4 py-2 text-right text-[12px]" style={{ color: APY_COLOR }}>
                  {formatPct(r.apy)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
