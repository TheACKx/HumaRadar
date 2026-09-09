import { Banknote, Gauge, Layers, Percent } from 'lucide-react'
import { formatPct, formatUsd } from '../lib/format'
import type { AggChange, aggregate } from '../lib/derive'
import { Delta, Sparkline } from './Primitives'

type Agg = ReturnType<typeof aggregate>

export function StatCards({ agg, accent }: { agg: Agg; accent: string }) {
  const tvlSpark = agg.series.map((p) => p.value)
  const apySpark = agg.apySeries.map((p) => p.value)
  const hasBorrow = agg.borrowCount > 0

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card
        icon={<Layers size={15} />}
        label="Total TVL"
        value={formatUsd(agg.tvl)}
        footer={
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <AggDelta label="7D" change={agg.tvl7d} />
              <AggDelta label="30D" change={agg.tvl30d} />
            </div>
            {agg.excludedCount > 0 && <ExcludedNote agg={agg} />}
          </div>
        }
        aside={tvlSpark.length > 1 ? <Sparkline data={tvlSpark} color={accent} /> : null}
        accent={accent}
      />
      <Card
        icon={<Percent size={15} />}
        label="Avg APY"
        value={formatPct(agg.apy)}
        footer={
          <span className="text-[11px] text-dim">
            TVL-weighted across {agg.count} market{agg.count === 1 ? '' : 's'}
          </span>
        }
        aside={apySpark.length > 1 ? <Sparkline data={apySpark} color="#C4A2F7" /> : null}
        accent={accent}
      />
      <Card
        icon={<Banknote size={15} />}
        label={hasBorrow ? 'Total Borrowed' : 'Vault TVL'}
        value={hasBorrow ? formatUsd(agg.borrowed) : formatUsd(vaultTvl(agg))}
        footer={<span className="text-[11px] text-dim">{composition(agg)}</span>}
        accent={accent}
      />
      <Card
        icon={<Gauge size={15} />}
        label={hasBorrow ? 'Avg Borrow APY' : 'Avg Vault APY'}
        value={formatPct(hasBorrow ? agg.borrowApy : agg.vaultApy)}
        footer={
          hasBorrow ? (
            <UtilTrack value={agg.utilization} />
          ) : (
            <span className="text-[11px] text-dim">net of fees, TVL-weighted</span>
          )
        }
        accent={accent}
      />
    </div>
  )
}

/**
 * Some rows are shown but not counted — a liquidity-layer roll-up that already
 * contains the vaults beside it, or a row that is simply not what the tab
 * totals. Saying so beats silently publishing a figure that does not match the
 * table.
 */
function ExcludedNote({ agg }: { agg: Agg }) {
  const n = agg.excludedCount
  return (
    <span
      className="text-[10.5px] text-dim/80"
      title={`${formatUsd(agg.excludedTvl)} across ${n} row${n === 1 ? '' : 's'} is left out of this figure — either a roll-up that already contains the venues shown below it, or a row that is not what this tab totals. Each is still in the table, marked "not in total".`}
    >
      excludes {n} row{n === 1 ? '' : 's'} · {formatUsd(agg.excludedTvl)}
    </span>
  )
}

/** Only meaningful when a chain has no borrow side; agg keeps the split counts. */
function vaultTvl(agg: Agg) {
  return agg.vaultCount ? agg.tvl : null
}

/** "7 markets · 3 vaults" — only the kinds this selection actually contains. */
function composition(agg: Agg): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  const parts = [
    agg.reserveCount && plural(agg.reserveCount, 'reserve'),
    agg.marketCount && plural(agg.marketCount, 'market'),
    agg.vaultCount && plural(agg.vaultCount, 'vault'),
    agg.poolCount && plural(agg.poolCount, 'pool'),
  ].filter(Boolean)
  return parts.join(' · ') || 'no markets'
}

/**
 * A chain-level change plus how much of the selection it actually covers.
 * Partial coverage is flagged, since Aave contributes no TVL history yet.
 */
function AggDelta({ label, change }: { label: string; change: AggChange }) {
  const partial = change.pct !== null && change.covered < change.total
  return (
    <span
      className="flex items-center gap-1 text-[11px] text-dim"
      title={
        change.pct === null
          ? 'Not enough history collected yet'
          : partial
            ? `Covers ${change.covered} of ${change.total} markets (${formatUsd(change.coveredTvl)}) — the rest have no TVL history yet`
            : `Covers all ${change.total} markets`
      }
    >
      {label} <Delta value={change.pct} />
      {partial && <span className="text-dim/60">*</span>}
    </span>
  )
}

function UtilTrack({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[11px] text-dim">—</span>
  const pct = Math.max(0, Math.min(100, value))
  const color = pct >= 90 ? '#FF5C7A' : pct >= 75 ? '#F2C14E' : '#34D8A0'
  return (
    <div className="flex items-center gap-2">
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-raised">
        <span
          className="block h-full rounded-full"
          style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}90` }}
        />
      </span>
      <span className="num text-[11px] text-dim">{pct.toFixed(1)}% utilized</span>
    </div>
  )
}

function Card({
  icon, label, value, footer, aside, accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  footer: React.ReactNode
  aside?: React.ReactNode
  accent: string
}) {
  return (
    <div className="card group relative overflow-hidden p-4 transition-colors duration-200 hover:border-plum-600/50">
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-40 w-40 rounded-full opacity-[0.14] blur-2xl transition-opacity duration-300 group-hover:opacity-25"
        style={{ background: accent }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-hairline bg-raised/70 text-plum-400">
              {icon}
            </span>
            <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              {label}
            </span>
          </div>
          <div className="num mt-3 text-[26px] font-bold leading-none text-white">{value}</div>
          <div className="mt-2.5">{footer}</div>
        </div>
        {aside && <div className="mt-1 shrink-0">{aside}</div>}
      </div>
    </div>
  )
}
