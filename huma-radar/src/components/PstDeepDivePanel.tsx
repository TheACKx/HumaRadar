import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ExternalLink, Layers, PieChart, Store, Wallet } from 'lucide-react'
import { PRIME_SINCE, PRIME_WALLETS } from '../data/prime'
import type { AggChange } from '../lib/derive'
import { formatDate, formatDateLong, formatUsd } from '../lib/format'
import type { PrimePoint, StableProtocolRow } from '../types'
import { Delta } from './Primitives'

/**
 * The three slices of PST Total TVL. They add up: Prime's exposure sits inside
 * the lending markets, so the middle slice is the lending markets without it.
 */
const SLICES = [
  { key: 'prime', label: 'Total Prime PST Exposure (including lending markets)', short: 'Prime exposure', color: '#F5A524' },
  { key: 'lendingEx', label: 'Lending Markets excluding Prime', short: 'Lending excl. Prime', color: '#8B7CF6' },
  { key: 'vanilla', label: 'Vanilla dApp Only', short: 'Vanilla dApp Only', color: '#3FA9F5' },
] as const

type SliceKey = (typeof SLICES)[number]['key']

/** One day of the funding mix, USD, with each slice's share of PST Total TVL. */
interface MixDay {
  date: string
  pst: number
  lending: number
  prime: number
  lendingEx: number
  vanilla: number
  primePct: number
  lendingExPct: number
  vanillaPct: number
}

const share = (part: number | null, whole: number | null) =>
  part === null || !whole ? null : (part / whole) * 100

const pctText = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`)

const shortAddress = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`

/** Prime's PST exposure per day, on days every tracked wallet was read. */
function primeByDate(): Map<string, number> {
  const out = new Map<string, number>()
  if (!PRIME_WALLETS.length) return out
  const dates = new Set(PRIME_WALLETS.flatMap((w) => w.history.map((h) => h.date)))
  for (const d of dates) {
    const pts = PRIME_WALLETS.map((w) => w.history.find((h) => h.date === d))
    if (pts.every(Boolean)) out.set(d, pts.reduce((a, p) => a + p!.supplied, 0))
  }
  return out
}

function mixSeries(
  pst: StableProtocolRow | undefined,
  lendingSeries: { date: string; value: number }[],
): MixDay[] {
  const prime = primeByDate()
  const pstOn = new Map((pst?.history ?? []).filter((h) => h.tvl !== null).map((h) => [h.date, h.tvl as number]))
  return lendingSeries
    .filter((l) => prime.has(l.date) && pstOn.has(l.date))
    .map((l) => {
      const p = pstOn.get(l.date)!
      const pr = prime.get(l.date)!
      const lendingEx = l.value - pr
      const vanilla = p - l.value
      return {
        date: l.date,
        pst: p,
        lending: l.value,
        prime: pr,
        lendingEx,
        vanilla,
        primePct: (pr / p) * 100,
        lendingExPct: (lendingEx / p) * 100,
        vanillaPct: (vanilla / p) * 100,
      }
    })
}

/**
 * PST Deep Dive — section 1, where PST's funding comes from:
 *
 *   Prime         Huma Prime's wallets: the PST they post as collateral (Total
 *                 Prime PST Exposure) and their net worth (Net Prime Deposit)
 *   Lending       the Huma Related tab's Total Tracked TVL
 *   Vanilla       PST Total TVL − Lending: PST held in the Huma dApp and not
 *                 put to work in a tracked venue
 *
 * Prime's exposure sits inside the lending markets, so the graph splits PST
 * Total TVL as Prime exposure + lending markets without it + vanilla.
 */
export function PstDeepDivePanel({
  pst, lending,
}: {
  pst: StableProtocolRow | undefined
  lending: { tvl: number; tvl7d: AggChange; series: { date: string; value: number }[] }
}) {
  const pstTvl = pst?.tvl ?? null
  const vanilla = pstTvl === null ? null : pstTvl - lending.tvl

  const latest = PRIME_WALLETS.map((w) => ({ wallet: w, point: w.history[w.history.length - 1] }))
    .filter((x): x is { wallet: typeof x.wallet; point: PrimePoint } => Boolean(x.point))
  const hasPrime = latest.length > 0
  const primeNet = latest.reduce((a, x) => a + x.point.net, 0)
  const primeExposure = latest.reduce((a, x) => a + x.point.supplied, 0)
  const primeDebt = latest.reduce((a, x) => a + x.point.borrowed, 0)
  const primeDate = latest.map((x) => x.point.date).sort().pop() ?? null
  const lendingEx = hasPrime ? lending.tvl - primeExposure : null

  const slices: Record<SliceKey, number | null> = {
    prime: hasPrime ? primeExposure : null,
    lendingEx,
    vanilla,
  }

  const mix = useMemo(() => mixSeries(pst, lending.series), [pst, lending.series])

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline/70 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-plum-100">
          <PieChart size={14} className="text-plum-400" />
          Funding mix
        </h2>
        <span className="text-[11px] text-dim">
          PST Total TVL <span className="num text-plum-200">{formatUsd(pstTvl)}</span>
          {pst?.tvl7d.pct != null && (
            <span className="ml-1.5 inline-flex items-center gap-1">
              7D <Delta value={pst.tvl7d.pct} />
            </span>
          )}
        </span>
      </div>

      <div className="space-y-5 p-5">
        {/* PST Total TVL in three slices that add up to it */}
        <div>
          <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-raised">
            {SLICES.map((s) => {
              const pct = share(slices[s.key], pstTvl)
              return (
                <span
                  key={s.key}
                  className="h-full"
                  style={{ width: `${Math.max(0, pct ?? 0)}%`, background: s.color }}
                  title={`${s.label}: ${formatUsd(slices[s.key])} · ${pctText(pct)} of PST Total TVL`}
                />
              )
            })}
          </div>
          <div className="mt-2.5 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[11.5px] text-dim md:grid-cols-3">
            {SLICES.map((s) => (
              <span key={s.key} className="flex items-baseline gap-1.5">
                <span className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full" style={{ background: s.color }} />
                <span>{s.label}</span>
                <span className="num ml-auto whitespace-nowrap text-plum-200 md:ml-1">
                  {pctText(share(slices[s.key], pstTvl))} · {formatUsd(slices[s.key])}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SourceCard icon={<Wallet size={15} />} color={SLICES[0].color} label="Prime" className="md:col-span-2">
            <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
              <BigFigure value={formatUsd(hasPrime ? primeNet : null)} caption="Net Prime Deposit" />
              <BigFigure value={formatUsd(hasPrime ? primeExposure : null)} caption="Total Prime PST Exposure" />
            </div>
            <Lines>
              <Line label="Exposure, share of PST TVL" value={pctText(share(hasPrime ? primeExposure : null, pstTvl))} strong />
              <Line label="Borrowed against it" value={formatUsd(hasPrime ? primeDebt : null)} />
              <Line label="Exposure ÷ net deposit" value={primeNet > 0 ? `${(primeExposure / primeNet).toFixed(1)}×` : '—'} />
            </Lines>
          </SourceCard>

          <SourceCard icon={<Layers size={15} />} color={SLICES[1].color} label="Lending Markets">
            <BigFigure value={formatUsd(lending.tvl)} caption="Huma Related tab · Total Tracked TVL" />
            <Lines>
              <Line label="Excluding Prime" value={formatUsd(lendingEx)} strong />
              <Line label="Excluding Prime, share of PST TVL" value={pctText(share(lendingEx, pstTvl))} />
              <Line label="7D" value={<Delta value={lending.tvl7d.pct} />} />
            </Lines>
          </SourceCard>

          <SourceCard icon={<Store size={15} />} color={SLICES[2].color} label="Vanilla dApp Only Deposit">
            <BigFigure value={formatUsd(vanilla)} caption="PST Total TVL − Lending Markets" />
            <Lines>
              <Line label="Share of PST TVL" value={pctText(share(vanilla, pstTvl))} strong />
              <Line label="PST Total TVL (DefiLlama)" value={formatUsd(pstTvl)} />
            </Lines>
          </SourceCard>
        </div>
      </div>

      <MixChart mix={mix} />

      <PrimeTable rows={latest} totals={{ supplied: primeExposure, borrowed: primeDebt, net: primeNet }} />

      <div className="border-t border-hairline/70 px-5 py-3 text-[11px] leading-relaxed text-dim">
        Prime is read each day from the wallets' own positions — Jupiter Lend and Kamino on Solana, Morpho and
        Fluid on Ethereum — plus what sits idle in each wallet; net worth is collateral − debt + idle tokens, as
        on Jupiter's portfolio page and DeBank.
        {PRIME_SINCE && <> Tracked since {formatDateLong(PRIME_SINCE)}{primeDate && primeDate !== PRIME_SINCE ? `, latest ${formatDateLong(primeDate)}` : ''}.</>}{' '}
        Prime's exposure is PST posted in the same venues the Lending Markets figure covers, so the graph counts it
        once: Prime exposure + lending markets excluding Prime + vanilla = PST Total TVL, DefiLlama's Huma TVL.
      </div>
    </div>
  )
}

function BigFigure({ value, caption }: { value: string; caption: string }) {
  return (
    <div>
      <div className="num text-[26px] font-bold leading-none text-white">{value}</div>
      <div className="mt-1.5 text-[11px] text-dim">{caption}</div>
    </div>
  )
}

function SourceCard({
  icon, color, label, className = '', children,
}: {
  icon: React.ReactNode
  color: string
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-hairline bg-raised/30 p-4 ${className}`}>
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-40 w-40 rounded-full opacity-[0.14] blur-2xl"
        style={{ background: color }}
      />
      <div className="relative">
        <div className="mb-3 flex items-center gap-2">
          <span
            className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-hairline bg-raised/70"
            style={{ color }}
          >
            {icon}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</span>
        </div>
        {children}
      </div>
    </div>
  )
}

function Lines({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 space-y-1.5 border-t border-hairline/60 pt-3">{children}</div>
}

function Line({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12px]">
      <span className="text-dim">{label}</span>
      <span className={`num ${strong ? 'font-semibold text-white' : 'text-plum-200'}`}>{value}</span>
    </div>
  )
}

/** The three slices day by day, as dollars or as shares of PST Total TVL. */
function MixChart({ mix }: { mix: MixDay[] }) {
  const [mode, setMode] = useState<'usd' | 'pct'>('usd')
  if (!mix.length) return null
  const key = (k: SliceKey) => (mode === 'usd' ? k : (`${k}Pct` as const))

  return (
    <div className="border-t border-hairline/70 px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[12.5px] font-semibold text-plum-100">PST funding mix, daily</h3>
        <div className="flex rounded-lg border border-hairline bg-raised/40 p-0.5 text-[11px]">
          {(['usd', 'pct'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                mode === m ? 'bg-plum-600/30 text-plum-100' : 'text-dim hover:text-plum-200'
              }`}
            >
              {m === 'usd' ? 'TVL' : 'Share %'}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={mix} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(145,70,232,0.10)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatDate} minTickGap={24}
            tick={{ fill: '#5D5478', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={(v) => (mode === 'usd' ? formatUsd(v) : `${v}%`)}
            domain={mode === 'usd' ? [0, 'auto'] : [0, 100]}
            width={64} tick={{ fill: '#5D5478', fontSize: 10 }} axisLine={false} tickLine={false}
          />
          <Tooltip content={<MixTip />} cursor={{ fill: 'rgba(145,70,232,0.08)' }} />
          {SLICES.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={key(s.key)}
              stackId="mix"
              fill={s.color}
              maxBarSize={36}
              radius={i === SLICES.length - 1 ? [3, 3, 0, 0] : 0}
              animationDuration={500}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>

      {mix.length < 2 && (
        <p className="mt-2 text-[11px] text-dim">
          Prime tracking began {formatDateLong(mix[0].date)}, so this starts with one day and adds a bar each day.
        </p>
      )}

      <MixTable mix={mix} />
    </div>
  )
}

function MixTip({ active, payload, label }: {
  active?: boolean; payload?: { payload: MixDay }[]; label?: string
}) {
  if (!active || !payload?.length || !label) return null
  const d = payload[0].payload
  const pct = { prime: d.primePct, lendingEx: d.lendingExPct, vanilla: d.vanillaPct }
  return (
    <div className="rounded-xl border border-hairline bg-abyss/95 px-3 py-2 shadow-glow backdrop-blur">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-dim">{formatDateLong(label)}</div>
      <div className="mt-1.5 space-y-1">
        {[...SLICES].reverse().map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-[11.5px]">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="text-dim">{s.short}</span>
            <span className="num ml-auto pl-3 font-semibold text-white">{formatUsd(d[s.key])}</span>
            <span className="num w-12 text-right text-plum-200">{pct[s.key].toFixed(1)}%</span>
          </div>
        ))}
        <div className="flex items-center gap-2 border-t border-hairline/60 pt-1 text-[11.5px]">
          <span className="text-dim">PST Total TVL</span>
          <span className="num ml-auto pl-3 font-semibold text-white">{formatUsd(d.pst)}</span>
          <span className="w-12" />
        </div>
      </div>
    </div>
  )
}

function MixTable({ mix }: { mix: MixDay[] }) {
  const td = 'num py-2 pr-4 text-right text-[12px]'
  return (
    <div className="mt-4 max-h-[260px] overflow-auto rounded-xl border border-hairline/70">
      <table className="w-full border-collapse text-left" style={{ minWidth: 720 }}>
        <thead className="sticky top-0 bg-panel/95 backdrop-blur">
          <tr className="border-b border-hairline/70 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-dim">
            <th className="py-2 pl-4 pr-4">Day</th>
            {SLICES.map((s) => (
              <th key={s.key} className="py-2 pr-4 text-right" colSpan={2}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                  {s.short}
                </span>
              </th>
            ))}
            <th className="py-2 pr-4 text-right">PST Total TVL</th>
          </tr>
        </thead>
        <tbody>
          {[...mix].reverse().map((d) => (
            <tr key={d.date} className="border-b border-hairline/30 last:border-0">
              <td className="num py-2 pl-4 pr-4 text-[12px] text-plum-100">{formatDateLong(d.date)}</td>
              <td className={`${td} text-white`}>{formatUsd(d.prime)}</td>
              <td className={`${td} text-dim`}>{d.primePct.toFixed(1)}%</td>
              <td className={`${td} text-white`}>{formatUsd(d.lendingEx)}</td>
              <td className={`${td} text-dim`}>{d.lendingExPct.toFixed(1)}%</td>
              <td className={`${td} text-white`}>{formatUsd(d.vanilla)}</td>
              <td className={`${td} text-dim`}>{d.vanillaPct.toFixed(1)}%</td>
              <td className={`${td} font-semibold text-white`}>{formatUsd(d.pst)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Every Prime position, wallet by wallet, with each wallet's net worth. */
function PrimeTable({
  rows, totals,
}: {
  rows: { wallet: (typeof PRIME_WALLETS)[number]; point: PrimePoint }[]
  totals: { supplied: number; borrowed: number; net: number }
}) {
  if (!rows.length) return null
  const td = 'num py-2.5 pr-5 text-right text-[12.5px]'
  return (
    <div className="overflow-x-auto border-t border-hairline/70">
      <table className="w-full border-collapse text-left" style={{ minWidth: 720 }}>
        <thead>
          <tr className="border-b border-hairline/70 bg-raised/30 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-dim">
            <th className="py-2.5 pl-5 pr-4">Prime wallet · market</th>
            <th className="py-2.5 pr-4">Venue</th>
            <th className="py-2.5 pr-5 text-right">PST supplied</th>
            <th className="py-2.5 pr-5 text-right">Borrowed</th>
            <th className="py-2.5 pr-5 text-right">Net</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ wallet, point }) => (
            <WalletRows key={wallet.id} wallet={wallet} point={point} td={td} />
          ))}
          <tr className="bg-raised/40 font-semibold">
            <td className="py-3 pl-5 pr-4 text-[12.5px] text-white" colSpan={2}>
              All Prime wallets
            </td>
            <td className={`${td} text-white`} title="Total Prime PST Exposure">{formatUsd(totals.supplied)}</td>
            <td className={`${td} text-plum-200`}>{formatUsd(totals.borrowed)}</td>
            <td className={`${td} text-white`} title="Net Prime Deposit">{formatUsd(totals.net)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function WalletRows({
  wallet, point, td,
}: {
  wallet: (typeof PRIME_WALLETS)[number]
  point: PrimePoint
  td: string
}) {
  return (
    <>
      <tr className="border-b border-hairline/40 bg-plum-950/20">
        <td className="py-2.5 pl-5 pr-4" colSpan={5}>
          <a
            href={wallet.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-plum-100 hover:text-plum-300"
            title={wallet.address}
          >
            {wallet.label}
            <span className="num font-normal text-dim">{shortAddress(wallet.address)}</span>
            <ExternalLink size={11} className="text-dim" />
          </a>
        </td>
      </tr>
      {point.positions.map((p) => (
        <tr key={`${p.venue}-${p.market}`} className="border-b border-hairline/30">
          <td className="py-2.5 pl-9 pr-4 text-[12.5px] text-white">{p.market}</td>
          <td className="py-2.5 pr-4 text-[11.5px] text-dim">{p.venue}</td>
          <td className={`${td} text-white`}>{formatUsd(p.supplied)}</td>
          <td className={`${td} text-plum-200`}>{formatUsd(p.borrowed)}</td>
          <td className={`${td} text-plum-200`}>{formatUsd(p.supplied - p.borrowed)}</td>
        </tr>
      ))}
      <tr className="border-b border-hairline/30">
        <td className="py-2.5 pl-9 pr-4 text-[12.5px] text-dim" colSpan={4}>
          Idle in wallet
        </td>
        <td className={`${td} text-plum-200`}>{formatUsd(point.wallet)}</td>
      </tr>
      <tr className="border-b border-hairline/60">
        <td className="py-2.5 pl-9 pr-4 text-[12.5px] font-semibold text-plum-100" colSpan={2}>
          Net worth
        </td>
        <td className={`${td} font-semibold text-white`}>{formatUsd(point.supplied)}</td>
        <td className={`${td} text-plum-200`}>{formatUsd(point.borrowed)}</td>
        <td className={`${td} font-semibold text-white`}>{formatUsd(point.net)}</td>
      </tr>
    </>
  )
}
