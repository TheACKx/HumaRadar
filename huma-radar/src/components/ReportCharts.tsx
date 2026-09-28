import { useContext, useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import {
  Area, AreaChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Maximize2, X } from 'lucide-react'
import { productColor } from '../data/stableprotocols'
import { spanDays, weekLabel } from '../data/reports'
import { formatDate, formatDateLong, formatUsd } from '../lib/format'
import { ReportChartsContext } from '../lib/reportCharts'
import type { ReportChange, ReportSeries, ReportSeriesProduct } from '../types'

/**
 * The trend graphs in a report's products table, and the larger chart behind
 * each. Both draw reports/data/<date>.series.json — the daily TVL frozen with
 * the report — so a report opened months later still shows the line its
 * numbers came from, not today's data.
 */

const GAIN = '#34D8A0'
const LOSS = '#FF5C7A'
const FLAT = '#8A7FA8'
const toneOf = (dir: number) => (dir > 0 ? GAIN : dir < 0 ? LOSS : FLAT)

type Pt = { x: number; y: number } | null

/** An SVG path through the points, lifting the pen over a missing day. */
function linePath(pts: Pt[]) {
  let d = ''
  let pen = false
  for (const p of pts) {
    if (!p) {
      pen = false
      continue
    }
    d += `${pen ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)} `
    pen = true
  }
  return d.trim()
}

/**
 * The month to the report date: the part before the report's window muted,
 * the window itself shaded and drawn in the colour of its change, so the cell
 * shows both the trend and this report's piece of it.
 */
function WindowSpark({ points, start, dir, width = 88, height = 26 }: {
  points: [string, number | null][]
  start: string
  dir: number
  width?: number
  height?: number
}) {
  const gid = useId().replace(/:/g, '')
  const known = points.map(([, v]) => v).filter((v): v is number => v != null)
  if (known.length < 2) return <span className="text-dim">—</span>

  const lo = Math.min(...known)
  const hi = Math.max(...known)
  const range = hi - lo || 1
  const step = width / (points.length - 1)
  const xy: Pt[] = points.map(([, v], i) => (v == null ? null : { x: i * step, y: height - 2 - ((v - lo) / range) * (height - 5) }))
  const cut = Math.max(0, points.findIndex(([d]) => d >= start))
  const before = xy.slice(0, cut + 1)
  const during = xy.slice(cut)
  const drawn = during.filter((p): p is { x: number; y: number } => p !== null)
  const last = drawn[drawn.length - 1]
  const color = toneOf(dir)
  const area = drawn.length > 1
    ? `${linePath(drawn)} L${last.x.toFixed(2)},${height} L${drawn[0].x.toFixed(2)},${height} Z`
    : ''

  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x={cut * step} y={-2} width={width - cut * step} height={height + 4} rx={4} fill={color} fillOpacity={0.07} />
      <path d={linePath(before)} fill="none" stroke={FLAT} strokeOpacity={0.55} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
      {area && <path d={area} fill={`url(#${gid})`} />}
      <path d={linePath(during)} fill="none" stroke={color} strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round" />
      {last && <circle cx={last.x} cy={last.y} r={2.2} fill={color} />}
    </svg>
  )
}

/**
 * A products-table trend cell. The markdown holds a link to `#tvl-<id>` whose
 * text is the same line in block characters; on the site it becomes the graph,
 * and a click opens the larger chart. Without a series file — reports written
 * before the graphs existed — the text is shown as it is.
 */
export function TrendGraph({ id, fallback }: { id: string; fallback: ReactNode }) {
  const charts = useContext(ReportChartsContext)
  const p = charts?.series.products[id]
  if (!charts || !p) return <span className="font-mono text-[11px] text-dim">{fallback}</span>
  const month = p.points.filter(([d]) => d >= charts.series.month)
  return (
    <button
      type="button"
      onClick={() => charts.open(id)}
      title={`${p.label} — open the TVL chart`}
      aria-label={`Open the TVL chart for ${p.label}`}
      className="group/spark -my-1.5 inline-flex items-center gap-1.5 rounded-lg border border-transparent px-1.5 py-1 transition-colors hover:border-plum-500/35 hover:bg-plum-500/10 focus-visible:border-plum-400/60 focus-visible:outline-none"
    >
      <WindowSpark points={month} start={charts.series.start} dir={p.period.dir} />
      <Maximize2 size={11} className="text-plum-300 opacity-0 transition-opacity group-hover/spark:opacity-100 group-focus-visible/spark:opacity-100" />
    </button>
  )
}

// ---------------------------------------------------------------- the larger chart

type RangeId = 'window' | 'month' | 'all'

function Change({ label, c }: { label: string; c: ReportChange }) {
  const tone = c.dir > 0 ? 'text-gain' : c.dir < 0 ? 'text-loss' : 'text-muted'
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.11em] text-dim">{label}</div>
      <div className={`num mt-1.5 text-[18px] font-bold leading-none ${tone}`}>{c.usd}</div>
      <div className={`num mt-1.5 text-[12px] font-medium ${tone} opacity-80`}>{c.pct}</div>
    </div>
  )
}

function PointTip({ active, payload, label, accent, what }: {
  active?: boolean
  payload?: { value: number | null }[]
  label?: string
  accent: string
  what: string
}) {
  if (!active || !payload?.length || !label || payload[0].value == null) return null
  return (
    <div className="rounded-xl border border-hairline bg-abyss/95 px-3 py-2 shadow-glow backdrop-blur">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-dim">{formatDateLong(label)}</div>
      <div className="num mt-1 text-[13px] font-bold" style={{ color: accent }}>
        {what} {formatUsd(payload[0].value)}
      </div>
    </div>
  )
}

/** One product's TVL, larger, with the report's window marked on it. */
export function ReportTvlDrawer({ id, series, onClose }: { id: string | null; series: ReportSeries | null; onClose: () => void }) {
  const [range, setRange] = useState<RangeId>('month')
  const p: ReportSeriesProduct | undefined = id && series ? series.products[id] : undefined

  useEffect(() => {
    if (!p) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [p, onClose])

  const data = useMemo(() => {
    if (!p || !series) return []
    const from = range === 'window' ? series.start : range === 'month' ? series.month : ''
    return p.points.filter(([d]) => d >= from).map(([date, tvl]) => ({ date, tvl }))
  }, [p, series, range])

  if (!p || !series || !id) return null

  const accent = productColor(id)
  const days = spanDays(series)
  const what = p.metric === 'liquidity' ? 'Liquidity' : 'TVL'
  const ranges: { id: RangeId; label: string }[] = [
    { id: 'window', label: `${days}D` },
    { id: 'month', label: '30D' },
    { id: 'all', label: '90D' },
  ]
  const shown = data.filter((d) => d.tvl != null).length
  const ticker = p.label.split(' ').slice(1).join(' ') || p.label

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 animate-rise bg-void/75 backdrop-blur-sm" aria-hidden />
      <aside
        role="dialog"
        aria-label={`${p.label} TVL chart`}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[760px] animate-slidein flex-col
                   border-l border-hairline bg-abyss/95 shadow-[-32px_0_80px_-24px_rgba(0,0,0,.9)] backdrop-blur-2xl"
      >
        <div className="relative shrink-0 border-b border-hairline/70 px-6 py-5">
          <div className="pointer-events-none absolute -top-24 left-1/3 h-48 w-72 rounded-full opacity-[0.16] blur-3xl" style={{ background: accent }} />
          <div className="relative flex items-start gap-3">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-[9px] font-bold"
              style={{ borderColor: `${accent}2E`, background: `linear-gradient(140deg, ${accent}22, rgba(22,15,39,.9))`, color: accent }}
            >
              {ticker.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[17px] font-bold tracking-tight text-white">{p.label}</h2>
              <p className="mt-1 text-[12px] text-muted">
                {p.metric === 'liquidity'
                  ? 'Available liquidity — supplied minus borrowed, not deposits'
                  : p.source === 'protocol'
                    ? 'Protocol-wide TVL'
                    : p.source === 'mcaps'
                      ? 'Token supply — summed market caps'
                      : 'TVL'}
                <span className="text-dim"> · from the {weekLabel(series.start, series.end)} report</span>
              </p>
            </div>
            <button onClick={onClose} className="btn !px-2 !py-2" aria-label="Close">
              <X size={15} />
            </button>
          </div>

          <div className="relative mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.11em] text-dim">{what}</div>
              <div className="num mt-1.5 text-[18px] font-bold leading-none text-white">{p.now}</div>
              <div className="mt-1.5 text-[11px] text-dim">on {formatDateLong(series.end)}</div>
            </div>
            <Change label={series.span === 'WoW' ? 'Week on week' : `${days}-day change`} c={p.period} />
            <Change label="Month on month" c={p.mom} />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.11em] text-dim">APY</div>
              <div className="num mt-1.5 text-[18px] font-bold leading-none text-plum-300">{p.apy}</div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline/70 px-6 py-3">
          <div className="flex items-center gap-1 rounded-xl border border-hairline bg-panel/60 p-1">
            {ranges.map((r) => (
              <button key={r.id} onClick={() => setRange(r.id)} className={`seg ${range === r.id ? 'seg-on' : ''}`}>
                {r.label}
              </button>
            ))}
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-dim">
            <span className="h-2.5 w-4 rounded-sm border" style={{ background: `${accent}1F`, borderColor: `${accent}55` }} />
            This report: {weekLabel(series.start, series.end, { short: true, withYear: false })}
          </span>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-[12.5px] font-semibold text-plum-100">
                <span className="h-2 w-2 rounded-full" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />
                {what} over time
              </h3>
              <span className="chip num !text-[10px]">{shown} days</span>
            </div>
            {shown > 1 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillReportTvl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={accent} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(145,70,232,0.10)" vertical={false} />
                  <ReferenceArea x1={series.start} x2={series.end} fill={accent} fillOpacity={0.09} stroke={accent} strokeOpacity={0.25} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={formatDate} minTickGap={28}
                    tick={{ fill: '#5D5478', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => formatUsd(v)} width={64} domain={['auto', 'auto']}
                    tick={{ fill: '#5D5478', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<PointTip accent={accent} what={what} />} cursor={{ stroke: accent, strokeOpacity: 0.35 }} />
                  <Area type="monotone" dataKey="tvl" name={what} stroke={accent} strokeWidth={2} connectNulls
                    fill="url(#fillReportTvl)" dot={false} animationDuration={650}
                    activeDot={{ r: 4, fill: accent, stroke: '#0A0713', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid place-items-center rounded-xl border border-dashed border-hairline px-6 py-12 text-center text-[12px] text-dim">
                Not enough daily history in this range to draw a line.
              </div>
            )}
          </section>
          <p className="text-[11.5px] leading-relaxed text-dim">
            Daily figures as the report used them, up to its {formatDateLong(series.end)} snapshot — they do not change after
            publication. Today's figures are on the Stablecoin Protocols tab.
          </p>
        </div>
      </aside>
    </>
  )
}
