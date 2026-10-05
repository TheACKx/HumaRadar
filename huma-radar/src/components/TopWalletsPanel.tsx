import { Fragment, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronDown, ExternalLink, LineChart as LineChartIcon, Users } from 'lucide-react'
import { TOP_WALLETS } from '../data/topwallets'
import { seriesChange } from '../lib/derive'
import { formatDate, formatDateLong, formatUsd } from '../lib/format'
import type { StableProtocolRow, StableRow, TopWallet, TopWalletPoint, TopWalletPosition } from '../types'
import { Sparkline } from './Primitives'
import { ChangeCell, ShareBar } from './StablecoinPanel'
import { StableChartDrawer } from './StableChartDrawer'

const COLORS = ['#F5A524', '#3FA9F5', '#8B7CF6', '#34D8A0', '#FF6B6B', '#E879F9', '#FDE047', '#60A5FA', '#FB7185']

const shortAddress = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`

/** A wallet's exposure as the one-number daily series the chart drawer draws. */
function asSeriesRow(w: TopWallet, color: string): StableRow {
  const history = w.history.map((h) => ({ date: h.date, total: h.exposure }))
  return {
    id: w.id,
    name: w.name,
    slug: w.id,
    url: w.addresses[0]?.url ?? '',
    history,
    color,
    total: history[history.length - 1]?.total ?? null,
    change7d: seriesChange(history, 7),
    change30d: seriesChange(history, 30),
  }
}
const latestOf = (w: TopWallet): TopWalletPoint | undefined => w.history[w.history.length - 1]

/** What makes up a wallet's Total PST Exposure, in words. */
function countedAs(w: TopWallet) {
  const rules = new Set(w.addresses.map((a) => {
    const c = a.count ?? w.count
    return c.positions && c.held ? 'both' : c.held ? 'held' : 'positions'
  }))
  if (rules.size > 1) return 'PST supplied in its looping wallets\' PST markets + PST held in its hold wallets'
  const only = [...rules][0]
  if (only === 'both') return 'PST supplied in its PST markets + PST held'
  if (only === 'held') return 'PST held in the wallet'
  return 'PST supplied in its PST markets'
}

/**
 * PST Deep Dive — page 3, the largest PST holders: how much PST each one is
 * exposed to, how (looping or holding), and the debt behind the loops.
 */
export function TopWalletsPanel({ pst }: { pst: StableProtocolRow | undefined }) {
  const [open, setOpen] = useState<string | null>(null)
  const [chart, setChart] = useState<StableRow | null>(null)
  const pstTvl = pst?.tvl ?? null
  const rows = TOP_WALLETS.map((w, i) => {
    const color = COLORS[i % COLORS.length]
    return { w, p: latestOf(w), color, series: asSeriesRow(w, color) }
  }).filter((r): r is { w: TopWallet; p: TopWalletPoint; color: string; series: StableRow } => Boolean(r.p))
  if (!rows.length) return null

  const listed = rows.reduce((a, r) => a + r.p.exposure, 0)
  const share = (v: number) => (pstTvl ? (v / pstTvl) * 100 : 0)
  const td = 'num py-3 pr-4 text-right text-[12.5px]'

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline/70 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-plum-100">
          <Users size={14} className="text-plum-400" />
          Largest PST holders
        </h2>
        <span className="text-[11px] text-dim">
          {rows.length} wallets · <span className="num text-plum-200">{formatUsd(listed)}</span> ·{' '}
          <span className="num text-plum-200">{pstTvl ? `${share(listed).toFixed(1)}%` : '—'}</span> of PST Total TVL
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left" style={{ minWidth: 1220 }}>
          <thead>
            <tr className="border-b border-hairline/70 bg-raised/30 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-dim">
              <th className="w-10 py-2.5 pl-5 text-center">#</th>
              <th className="py-2.5 pr-4">Wallet</th>
              <th className="py-2.5 pr-4">Strategy</th>
              <th className="py-2.5 pr-4 text-right">Total PST Exposure</th>
              <th className="py-2.5 pr-4 text-right" title="Change in Total PST Exposure over 7 days">7D</th>
              <th className="py-2.5 pr-4 text-right" title="Change in Total PST Exposure over 30 days">30D</th>
              <th className="w-[130px] py-2.5 pr-4 text-right">Share of PST TVL</th>
              <th className="py-2.5 pr-4 text-right">Borrowed against it</th>
              <th className="py-2.5 pr-4 text-right" title="Total PST Exposure − borrowed">Net</th>
              <th className="py-2.5 pr-4 text-right" title="Total PST Exposure ÷ net">Leverage</th>
              <th className="w-[130px] py-2.5 pr-5 text-right">Chart</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ w, p, color, series }, i) => {
              const net = p.exposure - p.borrowed
              const expanded = open === w.id
              const canExpand = p.positions.length > 0 || (p.wallets?.length ?? 0) > 1
              return (
                <Fragment key={w.id}>
                  <tr
                    onClick={() => canExpand && setOpen(expanded ? null : w.id)}
                    className={
                      'border-b border-hairline/40 transition-colors ' +
                      (canExpand ? 'cursor-pointer hover:bg-plum-950/25 ' : '') +
                      (expanded ? 'bg-plum-600/10' : '')
                    }
                  >
                    <td className="num py-3 pl-5 text-center text-[11px] text-dim">{i + 1}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[13.5px] font-semibold text-white">
                            {w.name}
                            {canExpand && (
                              <ChevronDown size={13} className={`text-dim transition-transform ${expanded ? '' : '-rotate-90'}`} />
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5">
                            {w.addresses.length > 2 && (
                              <span className="text-[11px] text-dim">
                                {w.addresses.length} wallets ·{' '}
                                {[...new Set(w.addresses.map((a) => (a.chain === 'solana' ? 'Solana' : 'Ethereum')))].join(', ')}
                              </span>
                            )}
                            {w.addresses.length <= 2 && w.addresses.map((a) => (
                              <a
                                key={a.address}
                                href={a.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-[11px] text-dim hover:text-plum-300"
                                title={a.address}
                              >
                                {a.chain === 'solana' ? 'Solana' : 'Ethereum'}
                                <span className="num">{shortAddress(a.address)}</span>
                                <ExternalLink size={10} />
                              </a>
                            ))}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="inline-block rounded-md border border-hairline bg-raised/50 px-2 py-0.5 text-[11px] text-plum-200">
                        {w.strategy}
                      </span>
                    </td>
                    <td className={`${td} font-semibold text-white`}>{formatUsd(p.exposure)}</td>
                    <td className="py-3 pr-4 text-right" title={series.change7d.abs === null ? `Tracked since ${formatDateLong(series.history[0].date)}` : undefined}>
                      <ChangeCell change={series.change7d} />
                    </td>
                    <td className="py-3 pr-4 text-right" title={series.change30d.abs === null ? `Tracked since ${formatDateLong(series.history[0].date)}` : undefined}>
                      <ChangeCell change={series.change30d} />
                    </td>
                    <td className="py-3 pr-4">
                      <ShareBar pct={share(p.exposure)} color={color} title={`${share(p.exposure).toFixed(2)}% of PST Total TVL`} />
                    </td>
                    <td className={`${td} text-plum-200`}>{p.borrowed ? formatUsd(p.borrowed) : '—'}</td>
                    <td className={`${td} text-plum-200`}>{formatUsd(net)}</td>
                    <td className="num py-3 pr-4 text-right text-[12.5px] text-plum-200">
                      {p.borrowed && net > 0 ? `${(p.exposure / net).toFixed(1)}×` : '1.0×'}
                    </td>
                    <td className="py-3 pr-5 text-right">
                      <div className="flex items-center justify-end gap-2.5">
                        {series.history.length > 1 && (
                          <Sparkline data={series.history.slice(-30).map((h) => h.total)} color={color} width={52} height={22} />
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setChart(series)
                          }}
                          className={
                            'btn whitespace-nowrap !px-2.5 !py-1.5 !text-[12px] ' +
                            (chart?.id === w.id ? 'btn-primary' : 'opacity-70 hover:opacity-100')
                          }
                          title="Show Total PST Exposure history"
                        >
                          <LineChartIcon size={13} />
                          Graph
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded && <DetailRows w={w} p={p} />}
                </Fragment>
              )
            })}
            <tr className="bg-raised/40 font-semibold">
              <td />
              <td className="py-3 pr-4 text-[12.5px] text-white" colSpan={2}>All listed wallets</td>
              <td className={`${td} text-white`}>{formatUsd(listed)}</td>
              <td colSpan={2} />
              <td className="py-3 pr-4 text-right text-[12px] text-plum-200">
                {pstTvl ? `${share(listed).toFixed(1)}%` : '—'}
              </td>
              <td className={`${td} text-plum-200`}>{formatUsd(rows.reduce((a, r) => a + r.p.borrowed, 0))}</td>
              <td className={`${td} text-plum-200`}>{formatUsd(rows.reduce((a, r) => a + r.p.exposure - r.p.borrowed, 0))}</td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>

      <ExposureChart rows={rows} />

      <StableChartDrawer
        row={chart}
        onClose={() => setChart(null)}
        measure={{
          title: 'Total PST Exposure',
          short: 'Exposure',
          csvColumn: 'pst_exposure_usd',
          csvPrefix: 'pst-wallet',
          source: 'Wallet positions',
          linkLabel: chart?.url.includes('debank') ? 'DeBank' : 'Jupiter',
        }}
      />

      <div className="border-t border-hairline/70 px-5 py-3 text-[11px] leading-relaxed text-dim">
        Total PST Exposure is read each day from each wallet's own positions — Jupiter Lend and Kamino on Solana,
        Morpho and Fluid on Ethereum — and its PST balance:{' '}
        {rows.map(({ w }, i) => (
          <span key={w.id}>
            <b className="text-plum-200">{w.name}</b> counts {countedAs(w)}
            {i < rows.length - 1 ? '; ' : '.'}
          </span>
        ))}{' '}
        Positions in other collateral in the same wallets are left out. Click a looping wallet to see its markets.
        History before a wallet's first daily reading is filled in where the source keeps one — Morpho and Kamino
        positions, and PST balances — so a wallet that also uses Jupiter Lend or Fluid shows changes from its first
        reading on.
      </div>
    </div>
  )
}

/** Each wallet's Total PST Exposure, day by day — drawn once there are two days. */
function ExposureChart({ rows }: { rows: { w: TopWallet; color: string }[] }) {
  const dates = [...new Set(rows.flatMap((r) => r.w.history.map((h) => h.date)))].sort()
  if (dates.length < 2) {
    return (
      <div className="border-t border-hairline/70 px-5 py-3 text-[11px] text-dim">
        Tracking began {dates[0] ? formatDateLong(dates[0]) : 'today'}; a daily exposure chart for each wallet
        appears here from the second day.
      </div>
    )
  }
  const data = dates.map((date) => {
    const day: Record<string, number | string | null> = { date }
    for (const { w } of rows) day[w.id] = w.history.find((h) => h.date === date)?.exposure ?? null
    return day
  })
  return (
    <div className="border-t border-hairline/70 px-5 py-4">
      <h3 className="mb-3 text-[12.5px] font-semibold text-plum-100">Total PST Exposure, daily</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(145,70,232,0.10)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatDate} minTickGap={24}
            tick={{ fill: '#5D5478', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => formatUsd(v)} width={64}
            tick={{ fill: '#5D5478', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip
            formatter={(v: number, id: string) => [formatUsd(v), rows.find((r) => r.w.id === id)?.w.name ?? id]}
            labelFormatter={(l: string) => formatDateLong(l)}
            contentStyle={{ background: 'rgba(10,7,19,0.95)', border: '1px solid rgba(145,70,232,0.25)', borderRadius: 12, fontSize: 11.5 }}
          />
          {rows.map(({ w, color }) => (
            <Line key={w.id} type="monotone" dataKey={w.id} stroke={color} strokeWidth={2} dot={false} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** An expanded wallet: each address of a multi-wallet entry, and every PST position. */
function DetailRows({ w, p }: { w: TopWallet; p: TopWalletPoint }) {
  const ofIt = (v: number) => (p.exposure ? `${((v / p.exposure) * 100).toFixed(0)}% of it` : '')
  const positionRow = (pos: TopWalletPosition, indent: string) => (
    <tr key={`${w.id}-${pos.address ?? ''}-${pos.venue}-${pos.market}`} className="border-b border-hairline/30 bg-plum-950/15">
      <td />
      <td className={`py-2 pr-4 ${indent} text-[12px] text-white`} colSpan={2}>
        {pos.market}
        <span className="ml-2 text-[11px] text-dim">
          {pos.venue} · {pos.chain === 'solana' ? 'Solana' : 'Ethereum'}
        </span>
      </td>
      <td className="num py-2 pr-4 text-right text-[12px] text-white">{formatUsd(pos.supplied)}</td>
      <td colSpan={2} />
      <td className="num whitespace-nowrap py-2 pr-4 text-right text-[11px] text-dim">{ofIt(pos.supplied)}</td>
      <td className="num py-2 pr-4 text-right text-[12px] text-plum-200">{formatUsd(pos.borrowed)}</td>
      <td className="num py-2 pr-4 text-right text-[12px] text-plum-200">{formatUsd(pos.supplied - pos.borrowed)}</td>
      <td colSpan={2} />
    </tr>
  )

  if (!p.wallets || p.wallets.length < 2) return <>{p.positions.map((pos) => positionRow(pos, 'pl-5'))}</>

  const urlOf = new Map(w.addresses.map((a) => [a.address, a.url]))
  return (
    <>
      {[...p.wallets].sort((a, b) => b.exposure - a.exposure).map((a) => {
        const counted = a.supplied > 0 || a.borrowed > 0 ? 'looping' : 'holding'
        return (
          <Fragment key={`${w.id}-${a.address}`}>
            <tr className="border-b border-hairline/30 bg-plum-950/25">
              <td />
              <td className="py-2 pl-5 pr-4" colSpan={2}>
                <a
                  href={urlOf.get(a.address)}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-plum-100 hover:text-plum-300"
                  title={a.address}
                >
                  {a.label ?? (a.chain === 'solana' ? 'Solana wallet' : 'Ethereum wallet')}
                  <span className="num font-normal text-dim">{shortAddress(a.address)}</span>
                  <ExternalLink size={10} className="text-dim" />
                </a>
                <span className="ml-2 text-[11px] text-dim">
                  {counted === 'looping' ? 'PST supplied as collateral' : a.exposure ? 'PST held' : 'no PST found'}
                </span>
              </td>
              <td className="num py-2 pr-4 text-right text-[12px] font-semibold text-white">{formatUsd(a.exposure)}</td>
              <td colSpan={2} />
              <td className="num whitespace-nowrap py-2 pr-4 text-right text-[11px] text-dim">{a.exposure ? ofIt(a.exposure) : ''}</td>
              <td className="num py-2 pr-4 text-right text-[12px] text-plum-200">{a.borrowed ? formatUsd(a.borrowed) : '—'}</td>
              <td className="num py-2 pr-4 text-right text-[12px] text-plum-200">{formatUsd(a.exposure - a.borrowed)}</td>
              <td colSpan={2} />
            </tr>
            {p.positions.filter((pos) => pos.address === a.address).map((pos) => positionRow(pos, 'pl-10'))}
          </Fragment>
        )
      })}
    </>
  )
}
