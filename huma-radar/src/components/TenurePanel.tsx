import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Lock } from 'lucide-react'
import { TENURE, TENURE_DAPP_SINCE, UNLOCKS, UNLOCKS_AS_OF } from '../data/tenure'
import { formatDate, formatDateLong, formatUsd } from '../lib/format'
import type { StableProtocolRow, TenurePoint, UnlockMonth } from '../types'

/** Four slices: where the lockup was chosen, and for how long. */
const SLICES = [
  { key: 'prime3', label: 'Huma Prime · 3 months', color: '#F5A524', pick: (p: TenurePoint) => p.prime.m3 },
  { key: 'prime6', label: 'Huma Prime · 6 months', color: '#C2410C', pick: (p: TenurePoint) => p.prime.m6 },
  { key: 'dapp3', label: 'Huma dApp · 3 months', color: '#3FA9F5', pick: (p: TenurePoint) => p.dapp.m3 },
  { key: 'dapp6', label: 'Huma dApp · 6 months', color: '#1D5FD1', pick: (p: TenurePoint) => p.dapp.m6 },
] as const

type SliceKey = (typeof SLICES)[number]['key']

const pctOf = (v: number, whole: number | null) => (whole ? (v / whole) * 100 : null)
const pctText = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`)

/**
 * PST Deep Dive — section 2, how long PST is committed for. A lockup is chosen
 * in only two places, Huma Prime and the Huma dApp, each offering none, 3 or 6
 * months. Prime's figures are its vault's own; the dApp's are estimated from
 * the deposits made with a lockup.
 */
export function TenurePanel({ pst }: { pst: StableProtocolRow | undefined }) {
  const latest = TENURE[TENURE.length - 1]
  if (!latest) return null

  const pstTvl = pst?.tvl ?? null
  const m3 = latest.prime.m3 + latest.dapp.m3
  const m6 = latest.prime.m6 + latest.dapp.m6
  const locked = m3 + m6

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline/70 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-plum-100">
          <Lock size={14} className="text-plum-400" />
          Locked PST
        </h2>
        <span className="text-[11px] text-dim">
          Locked <span className="num text-plum-200">{formatUsd(locked)}</span> ·{' '}
          <span className="num text-plum-200">{pctText(pctOf(locked, pstTvl))}</span> of PST Total TVL
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-3">
        <LockCard
          label="Locked 3 months"
          value={m3}
          share={pctOf(m3, pstTvl)}
          lines={[
            ['Huma Prime', latest.prime.m3],
            ['Huma dApp (est.)', latest.dapp.m3],
          ]}
        />
        <LockCard
          label="Locked 6 months"
          value={m6}
          share={pctOf(m6, pstTvl)}
          lines={[
            ['Huma Prime', latest.prime.m6],
            ['Huma dApp (est.)', latest.dapp.m6],
          ]}
        />
        <LockCard
          label="Total locked"
          value={locked}
          share={pctOf(locked, pstTvl)}
          lines={[
            ['Huma Prime', latest.prime.m3 + latest.prime.m6],
            ['Huma dApp (est.)', latest.dapp.m3 + latest.dapp.m6],
          ]}
        />
      </div>

      <BreakdownTable p={latest} />

      <UnlockSchedule />

      <TenureChart pstHistory={pst?.history ?? []} />

      <div className="border-t border-hairline/70 px-5 py-3 text-[11px] leading-relaxed text-dim">
        A lockup is chosen in two places only, each offering none, 3 or 6 months. <b className="text-plum-200">Huma
        Prime</b> is read from its vault, which keeps the assets under each lockup option, so its figures are exact.{' '}
        <b className="text-plum-200">Huma dApp</b> (Classic and Maxi) keeps no lockup on chain beyond the deposit
        itself, so its figures are estimated: every deposit made with a 3- or 6-month lockup
        {TENURE_DAPP_SINCE ? ` since ${formatDateLong(TENURE_DAPP_SINCE)}` : ''} that is still inside it (or set to
        auto-renew), valued at today's token price. A lockup extended later in the dApp is not on chain, and locked
        tokens moved out of the wallet still count, so read the dApp figures as an estimate.
      </div>
    </div>
  )
}

function LockCard({
  label, value, share, lines,
}: {
  label: string
  value: number
  share: number | null
  lines: [string, number][]
}) {
  return (
    <div className="rounded-xl border border-hairline bg-raised/30 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="num text-[26px] font-bold leading-none text-white">{formatUsd(value)}</span>
        <span className="num text-[12px] text-plum-200">{pctText(share)}</span>
      </div>
      <div className="mt-1.5 text-[11px] text-dim">of PST Total TVL</div>
      <div className="mt-3 space-y-1.5 border-t border-hairline/60 pt-3">
        {lines.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 text-[12px]">
            <span className="text-dim">{k}</span>
            <span className="num text-plum-200">{formatUsd(v)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BreakdownTable({ p }: { p: TenurePoint }) {
  const td = 'num py-2.5 pr-5 text-right text-[12.5px]'
  const rows = [
    { name: 'Huma Prime', note: 'exact · vault', m3: p.prime.m3, m6: p.prime.m6, none: p.prime.none as number | null },
    {
      name: 'Huma dApp',
      note: `estimated · ${p.dapp.wallets3} wallets 3 mo · ${p.dapp.wallets6} wallets 6 mo`,
      m3: p.dapp.m3,
      m6: p.dapp.m6,
      none: null,
    },
  ]
  return (
    <div className="overflow-x-auto border-t border-hairline/70">
      <table className="w-full border-collapse text-left" style={{ minWidth: 640 }}>
        <thead>
          <tr className="border-b border-hairline/70 bg-raised/30 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-dim">
            <th className="py-2.5 pl-5 pr-4">Where the lockup was chosen</th>
            <th className="py-2.5 pr-5 text-right">3 months</th>
            <th className="py-2.5 pr-5 text-right">6 months</th>
            <th className="py-2.5 pr-5 text-right">Total locked</th>
            <th className="py-2.5 pr-5 text-right">No lockup</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-hairline/30">
              <td className="py-2.5 pl-5 pr-4">
                <div className="text-[12.5px] font-semibold text-white">{r.name}</div>
                <div className="text-[11px] text-dim">{r.note}</div>
              </td>
              <td className={`${td} text-white`}>{formatUsd(r.m3)}</td>
              <td className={`${td} text-white`}>{formatUsd(r.m6)}</td>
              <td className={`${td} font-semibold text-white`}>{formatUsd(r.m3 + r.m6)}</td>
              <td
                className={`${td} text-plum-200`}
                title={r.none === null ? 'The dApp keeps no record of unlocked deposits as such' : undefined}
              >
                {r.none === null ? '—' : formatUsd(r.none)}
              </td>
            </tr>
          ))}
          <tr className="bg-raised/40 font-semibold">
            <td className="py-3 pl-5 pr-4 text-[12.5px] text-white">Total</td>
            <td className={`${td} text-white`}>{formatUsd(p.prime.m3 + p.dapp.m3)}</td>
            <td className={`${td} text-white`}>{formatUsd(p.prime.m6 + p.dapp.m6)}</td>
            <td className={`${td} text-white`}>{formatUsd(p.prime.m3 + p.dapp.m3 + p.prime.m6 + p.dapp.m6)}</td>
            <td className={`${td} text-plum-200`} />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

interface ChartDay extends Record<SliceKey, number> {
  date: string
  pst: number | null
}

/** Locked TVL day by day, as dollars or as a share of PST Total TVL. */
function TenureChart({ pstHistory }: { pstHistory: { date: string; tvl: number | null }[] }) {
  const [mode, setMode] = useState<'usd' | 'pct'>('usd')
  // PST Total TVL on that day, or the latest before it — DefiLlama's day can lag the lockups' by a few hours
  const pstKnown = pstHistory.filter((h) => h.tvl !== null).sort((a, b) => a.date.localeCompare(b.date))
  const pstAsOf = (date: string) => {
    let v: number | null = null
    for (const h of pstKnown) if (h.date <= date) v = h.tvl
    return v
  }
  const days: ChartDay[] = TENURE.map((p) => {
    const day = { date: p.date, pst: pstAsOf(p.date) } as ChartDay
    for (const s of SLICES) day[s.key] = s.pick(p)
    return day
  })
  const shown = mode === 'usd'
    ? days
    : days.filter((d) => d.pst).map((d) => {
        const out = { ...d }
        for (const s of SLICES) out[s.key] = (d[s.key] / (d.pst as number)) * 100
        return out
      })

  return (
    <div className="border-t border-hairline/70 px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[12.5px] font-semibold text-plum-100">Locked PST, daily</h3>
        <div className="flex rounded-lg border border-hairline bg-raised/40 p-0.5 text-[11px]">
          {(['usd', 'pct'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                mode === m ? 'bg-plum-600/30 text-plum-100' : 'text-dim hover:text-plum-200'
              }`}
            >
              {m === 'usd' ? 'TVL' : 'Share % of PST TVL'}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={shown} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(145,70,232,0.10)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatDate} minTickGap={24}
            tick={{ fill: '#5D5478', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={(v) => (mode === 'usd' ? formatUsd(v) : `${v.toFixed(0)}%`)}
            width={64} tick={{ fill: '#5D5478', fontSize: 10 }} axisLine={false} tickLine={false}
          />
          <Tooltip content={<TenureTip mode={mode} />} cursor={{ fill: 'rgba(145,70,232,0.08)' }} />
          {SLICES.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} stackId="lock" fill={s.color} maxBarSize={36}
              radius={i === SLICES.length - 1 ? [3, 3, 0, 0] : 0} animationDuration={500} />
          ))}
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-dim">
        {SLICES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      {days.length < 2 && (
        <p className="mt-2 text-[11px] text-dim">
          Tracking began {formatDateLong(days[0].date)}, so this starts with one day and adds a bar each day.
        </p>
      )}
    </div>
  )
}

function TenureTip({ active, payload, label, mode }: {
  active?: boolean; payload?: { payload: ChartDay }[]; label?: string; mode: 'usd' | 'pct'
}) {
  if (!active || !payload?.length || !label) return null
  const d = payload[0].payload
  return (
    <div className="rounded-xl border border-hairline bg-abyss/95 px-3 py-2 shadow-glow backdrop-blur">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-dim">{formatDateLong(label)}</div>
      <div className="mt-1.5 space-y-1">
        {[...SLICES].reverse().map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-[11.5px]">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="text-dim">{s.label}</span>
            <span className="num ml-auto pl-3 font-semibold text-white">
              {mode === 'usd' ? formatUsd(d[s.key]) : `${d[s.key].toFixed(1)}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The unlock schedule's parts: three that unlock, and Prime's auto-renewals, which roll over. */
const UNLOCK_PARTS = [
  { key: 'primeUnlock', label: 'Huma Prime', color: '#F5A524' },
  { key: 'dapp3', label: 'Huma dApp · 3-month locks', color: '#3FA9F5' },
  { key: 'dapp6', label: 'Huma dApp · 6-month locks', color: '#1D5FD1' },
] as const
const RENEW = { key: 'primeRenew', label: 'Huma Prime · auto-renews (rolls over)', color: '#F5A524' } as const

const monthLabel = (m: string, short = false) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleString('en-US', {
    month: 'short', year: short ? '2-digit' : 'numeric', timeZone: 'UTC',
  })

const unlocking = (r: UnlockMonth) => r.primeUnlock + r.dapp3 + r.dapp6

/** When locked PST unlocks, month by month — what could leave, and when. */
function UnlockSchedule() {
  if (!UNLOCKS.length) return null
  const total = UNLOCKS.reduce((a, r) => a + unlocking(r), 0)
  const next3 = UNLOCKS.slice(0, 3)
  const soon = next3.reduce((a, r) => a + unlocking(r), 0)
  const renew = UNLOCKS.reduce((a, r) => a + r.primeRenew, 0)
  const peak = UNLOCKS.reduce((best, r) => (unlocking(r) > unlocking(best) ? r : best), UNLOCKS[0])
  const span = `${monthLabel(next3[0].month).split(' ')[0]}–${monthLabel(next3[next3.length - 1].month).split(' ')[0]}`
  const td = 'num py-2 pr-4 text-right text-[12px]'
  const sum = (k: 'primeUnlock' | 'dapp3' | 'dapp6') => UNLOCKS.reduce((a, r) => a + r[k], 0)

  return (
    <div className="border-t border-hairline/70 px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[12.5px] font-semibold text-plum-100">Unlock schedule</h3>
        {UNLOCKS_AS_OF && <span className="text-[11px] text-dim">as of {formatDateLong(UNLOCKS_AS_OF)}</span>}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Unlocking in total" value={formatUsd(total)} />
        <Stat label={`Next 3 months (${span})`} value={formatUsd(soon)} />
        <Stat label={`Biggest month · ${monthLabel(peak.month)}`} value={formatUsd(unlocking(peak))} />
        <Stat label="Prime auto-renewing" value={formatUsd(renew)} note="rolls over unless switched off" />
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={UNLOCKS} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={3}>
          <defs>
            <pattern id="renewHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="rgba(245,165,36,0.12)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke={RENEW.color} strokeWidth="2" strokeOpacity="0.7" />
            </pattern>
          </defs>
          <CartesianGrid stroke="rgba(145,70,232,0.10)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m, true)}
            tick={{ fill: '#5D5478', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => formatUsd(v)} width={64}
            tick={{ fill: '#5D5478', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip content={<UnlockTip />} cursor={{ fill: 'rgba(145,70,232,0.08)' }} />
          {UNLOCK_PARTS.map((p, i) => (
            <Bar key={p.key} dataKey={p.key} stackId="unlock" fill={p.color} maxBarSize={34}
              radius={i === UNLOCK_PARTS.length - 1 ? [3, 3, 0, 0] : 0} animationDuration={500} />
          ))}
          <Bar dataKey={RENEW.key} fill="url(#renewHatch)" stroke={RENEW.color} strokeOpacity={0.6}
            strokeDasharray="3 2" maxBarSize={34} radius={[3, 3, 0, 0]} animationDuration={500} />
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-dim">
        {UNLOCK_PARTS.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-sm border border-dashed"
            style={{ borderColor: RENEW.color, background: 'rgba(245,165,36,0.25)' }}
          />
          {RENEW.label}
        </span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-hairline/70">
        <table className="w-full border-collapse text-left" style={{ minWidth: 680 }}>
          <thead className="bg-raised/30">
            <tr className="border-b border-hairline/70 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-dim">
              <th className="py-2 pl-4 pr-4">Unlocks in</th>
              <th className="py-2 pr-4 text-right">Huma Prime</th>
              <th className="py-2 pr-4 text-right">dApp · 3-month</th>
              <th className="py-2 pr-4 text-right">dApp · 6-month</th>
              <th className="py-2 pr-4 text-right">Total unlocking</th>
              <th className="py-2 pr-4 text-right">Prime auto-renews</th>
            </tr>
          </thead>
          <tbody>
            {UNLOCKS.map((r) => (
              <tr key={r.month} className="border-b border-hairline/30">
                <td className="num py-2 pl-4 pr-4 text-[12px] text-plum-100">{monthLabel(r.month)}</td>
                <td className={`${td} text-white`}>{r.primeUnlock ? formatUsd(r.primeUnlock) : '—'}</td>
                <td className={`${td} text-white`}>{r.dapp3 ? formatUsd(r.dapp3) : '—'}</td>
                <td className={`${td} text-white`}>{r.dapp6 ? formatUsd(r.dapp6) : '—'}</td>
                <td className={`${td} font-semibold text-white`}>{formatUsd(unlocking(r))}</td>
                <td className={`${td} text-dim`}>{r.primeRenew ? formatUsd(r.primeRenew) : '—'}</td>
              </tr>
            ))}
            <tr className="bg-raised/40 font-semibold">
              <td className="py-2.5 pl-4 pr-4 text-[12px] text-white">Total</td>
              <td className={`${td} text-white`}>{formatUsd(sum('primeUnlock'))}</td>
              <td className={`${td} text-white`}>{formatUsd(sum('dapp3'))}</td>
              <td className={`${td} text-white`}>{formatUsd(sum('dapp6'))}</td>
              <td className={`${td} text-white`}>{formatUsd(total)}</td>
              <td className={`${td} text-dim`}>{formatUsd(renew)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-dim">
        Prime's dates are each deposit's own unlock date in its vault; a deposit set to auto-renew locks again for
        another term when it gets there, so it is shown apart. Prime is split by unlock date only: an extended or
        renewed deposit keeps its first deposit date, so its original lockup length can't be read. The dApp's dates
        are each locked deposit's date plus 3 or 6 months.
      </p>
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-raised/30 px-3.5 py-3">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-dim">{label}</div>
      <div className="num mt-1.5 text-[18px] font-bold leading-none text-white">{value}</div>
      {note && <div className="mt-1 text-[10.5px] text-dim">{note}</div>}
    </div>
  )
}

function UnlockTip({ active, payload, label }: {
  active?: boolean; payload?: { payload: UnlockMonth }[]; label?: string
}) {
  if (!active || !payload?.length || !label) return null
  const r = payload[0].payload
  return (
    <div className="rounded-xl border border-hairline bg-abyss/95 px-3 py-2 shadow-glow backdrop-blur">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-dim">{monthLabel(label)}</div>
      <div className="mt-1.5 space-y-1">
        {UNLOCK_PARTS.map((p) => (
          <div key={p.key} className="flex items-center gap-2 text-[11.5px]">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span className="text-dim">{p.label}</span>
            <span className="num ml-auto pl-3 font-semibold text-white">{formatUsd(r[p.key])}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 border-t border-hairline/60 pt-1 text-[11.5px]">
          <span className="text-dim">Total unlocking</span>
          <span className="num ml-auto pl-3 font-semibold text-white">{formatUsd(unlocking(r))}</span>
        </div>
        <div className="flex items-center gap-2 text-[11.5px]">
          <span className="text-dim">Prime auto-renews</span>
          <span className="num ml-auto pl-3 text-plum-200">{formatUsd(r.primeRenew)}</span>
        </div>
      </div>
    </div>
  )
}
