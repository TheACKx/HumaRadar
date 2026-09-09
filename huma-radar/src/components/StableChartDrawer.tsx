import { useEffect, useMemo, useState } from 'react'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Download, ExternalLink, X } from 'lucide-react'
import { formatDate, formatDateLong, formatUsd, formatUsdSigned } from '../lib/format'
import { seriesChange } from '../lib/derive'
import type { Range, StablePoint, StableRow } from '../types'
import { Delta } from './Primitives'

const RANGES: { id: Range; label: string }[] = [
  { id: 7, label: '7D' },
  { id: 30, label: '30D' },
  { id: 90, label: '90D' },
  { id: 365, label: '1Y' },
]

/** Supply history for one chain, or for the network as a whole. */
export function StableChartDrawer({ row, onClose }: { row: StableRow | null; onClose: () => void }) {
  const [range, setRange] = useState<Range>(30)

  useEffect(() => {
    if (!row) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [row, onClose])

  const series = useMemo(() => (row ? row.history.slice(-range) : []), [row, range])

  const stats = useMemo(() => {
    if (series.length < 2) return null
    const vals = series.map((p) => p.total)
    const first = vals[0]
    const last = vals[vals.length - 1]
    return {
      abs: last - first,
      pct: first === 0 ? null : ((last - first) / first) * 100,
      min: Math.min(...vals),
      max: Math.max(...vals),
    }
  }, [series])

  if (!row) return null

  const accent = row.color
  // the drawer's window can be shorter than these, so they read the full history
  const d7 = seriesChange(row.history, 7)
  const d30 = seriesChange(row.history, 30)

  const exportCsv = () => {
    const header = 'date,stablecoin_market_cap_usd\n'
    const body = row.history.map((h) => `${h.date},${h.total}`).join('\n')
    const url = URL.createObjectURL(new Blob([header + body], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `stablecoins-${row.id}-history.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 animate-rise bg-void/75 backdrop-blur-sm" aria-hidden />
      <aside
        role="dialog"
        aria-label={`${row.name} stablecoin supply history`}
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
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-[13px] font-bold"
              style={{
                borderColor: `${accent}2E`,
                background: `linear-gradient(140deg, ${accent}22, rgba(22,15,39,.9))`,
                color: accent,
              }}
            >
              $
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[17px] font-bold tracking-tight text-white">{row.name}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-muted">Stablecoin market cap</span>
                <span className="text-dim">·</span>
                <span className="chip !text-[10.5px]">DefiLlama · {row.history.length} days stored</span>
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
            <Stat label="Market Cap" value={formatUsd(row.total)} accent={accent} />
            <Stat
              label="Weekly Change"
              value={formatUsdSigned(d7.abs)}
              sub={<Delta value={d7.pct} size="md" />}
            />
            <Stat
              label="Monthly Change"
              value={formatUsdSigned(d30.abs)}
              sub={<Delta value={d30.pct} size="md" />}
            />
            <Stat
              label={`${range === 365 ? '1Y' : `${range}D`} High`}
              value={stats ? formatUsd(stats.max) : '—'}
              sub={
                stats ? (
                  <span className="num text-[11px] text-dim">low {formatUsd(stats.min)}</span>
                ) : (
                  <span className="text-[11px] text-dim">not enough history</span>
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
                Over this window <Delta value={stats.pct} />
              </span>
              <span className="num">{formatUsdSigned(stats.abs)}</span>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-[12.5px] font-semibold text-plum-100">
                <span className="h-2 w-2 rounded-full" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />
                Stablecoin market cap over time
              </h3>
              <span className="chip num !text-[10px]">{series.length} days</span>
            </div>
            {series.length > 1 ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillStable" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={accent} stopOpacity={0.42} />
                      <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(145,70,232,0.10)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatDate} minTickGap={28}
                    tick={{ fill: '#5D5478', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => formatUsd(v)} width={64} domain={['auto', 'auto']}
                    tick={{ fill: '#5D5478', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<SupplyTip accent={accent} />} cursor={{ stroke: accent, strokeOpacity: 0.35 }} />
                  <Area type="monotone" dataKey="total" name="Market cap" stroke={accent} strokeWidth={2}
                    fill="url(#fillStable)" dot={false} animationDuration={650}
                    activeDot={{ r: 4, fill: accent, stroke: '#0A0713', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid place-items-center rounded-xl border border-dashed border-hairline px-6 py-12 text-center text-[12px] text-dim">
                DefiLlama publishes only {series.length} day{series.length === 1 ? '' : 's'} for{' '}
                {row.name} — the chart appears once there are two.
              </div>
            )}
          </section>

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

function SupplyTip({ active, payload, label, accent }: {
  active?: boolean; payload?: { payload: StablePoint }[]; label?: string; accent: string
}) {
  if (!active || !payload?.length || !label) return null
  const p = payload[0].payload
  return (
    <div className="rounded-xl border border-hairline bg-abyss/95 px-3 py-2 shadow-glow backdrop-blur">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-dim">{formatDateLong(label)}</div>
      <div className="num mt-1.5 text-[13px] font-bold" style={{ color: accent }}>
        {formatUsd(p.total)}
      </div>
      <div className="num mt-1 text-[10.5px] text-dim">{formatUsd(p.total, { compact: false })}</div>
    </div>
  )
}

function HistoryTable({ rows }: { rows: StablePoint[] }) {
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
              {['Date', 'Market Cap', 'Day over day'].map((h, i) => (
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
            {rows.map((r, i) => {
              // rows read newest-first here, so the previous day is the next entry
              const prev = rows[i + 1]
              const pct = prev && prev.total ? ((r.total - prev.total) / prev.total) * 100 : null
              return (
                <tr key={r.date} className="border-b border-hairline/30 last:border-0 hover:bg-plum-950/25">
                  <td className="num px-4 py-2 text-[12px] text-muted">{formatDateLong(r.date)}</td>
                  <td className="num px-4 py-2 text-right text-[12px] text-white">{formatUsd(r.total)}</td>
                  <td className="px-4 py-2 text-right"><Delta value={pct} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
