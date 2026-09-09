import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { CHAIN_MAP } from '../data/chains'
import { formatSigned, toneOf } from '../lib/format'
import type { ChainId, MarketKind } from '../types'

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-plum-400 via-plum-600 to-plum-900 shadow-glow-sm" />
      <div className="absolute inset-[1px] rounded-[11px] bg-abyss" />
      <svg viewBox="0 0 40 40" className="absolute inset-0" fill="none">
        <circle cx="20" cy="20" r="13" stroke="rgba(169,116,241,.32)" strokeWidth="1" />
        <circle cx="20" cy="20" r="8" stroke="rgba(169,116,241,.24)" strokeWidth="1" />
        <circle cx="20" cy="20" r="2.4" fill="#C4A2F7" />
        <circle cx="27.5" cy="13.5" r="1.8" fill="#34D8A0" />
      </svg>
      <div
        className="absolute inset-0 animate-sweep rounded-full"
        style={{
          background:
            'conic-gradient(from 0deg, rgba(169,116,241,0) 0deg, rgba(169,116,241,0) 300deg, rgba(169,116,241,.55) 358deg, rgba(169,116,241,0) 360deg)',
          maskImage: 'radial-gradient(circle at center, black 55%, transparent 72%)',
          WebkitMaskImage: 'radial-gradient(circle at center, black 55%, transparent 72%)',
        }}
      />
    </div>
  )
}

export function ChainDot({ chain, size = 8 }: { chain: ChainId; size?: number }) {
  const c = CHAIN_MAP[chain]
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: c.color, boxShadow: `0 0 10px ${c.color}80` }}
    />
  )
}

export function ChainBadge({ chain }: { chain: ChainId }) {
  const c = CHAIN_MAP[chain]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: c.color, borderColor: `${c.color}33`, background: `${c.color}12` }}
    >
      <ChainDot chain={chain} size={6} />
      {c.name}
    </span>
  )
}

/**
 * What a row is. A total takes precedence over its kind: "Collateral" on a row
 * that sums three venues says less than "Total" does.
 */
export function KindBadge({
  kind, borrowable, rollup,
}: { kind: MarketKind; borrowable: boolean; rollup?: boolean }) {
  const spec = rollup
    ? { text: 'Total', cls: 'border-plum-400/30 bg-plum-400/10 text-plum-200', tip: 'A total summed from other rows, not a venue of its own' }
    : kind === 'pool'
      ? { text: 'Pool', cls: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-300', tip: 'AMM liquidity pool — trading fees only, no borrow side' }
      : kind === 'vault'
        ? { text: 'Vault', cls: 'border-plum-500/30 bg-plum-500/10 text-plum-300', tip: 'Curated vault' }
        : kind === 'market'
          ? { text: 'Market', cls: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300', tip: 'Isolated collateral / loan market' }
          : borrowable
            ? { text: 'Borrow', cls: 'border-amber-400/25 bg-amber-400/10 text-amber-300', tip: 'Borrowable reserve' }
            : { text: 'Collateral', cls: 'border-sky-400/25 bg-sky-400/10 text-sky-300', tip: 'Supply-only collateral — borrowing disabled' }
  return (
    <span
      className={'inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ' + spec.cls}
      title={spec.tip}
    >
      {spec.text}
    </span>
  )
}

/** Asset avatar built from the ticker — placeholder until real token logos. */
export function AssetMark({ symbol, chain }: { symbol: string; chain: ChainId }) {
  const label = symbol.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase()
  const c = CHAIN_MAP[chain]
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-[9px] font-bold"
      style={{
        borderColor: `${c.color}2E`,
        background: `linear-gradient(140deg, ${c.color}22, rgba(22,15,39,.9))`,
        color: c.color,
      }}
    >
      {label}
    </span>
  )
}

const TONE_TEXT = { up: 'text-gain', down: 'text-loss', flat: 'text-dim' } as const

export function Delta({
  value,
  suffix = '%',
  digits = 2,
  showIcon = true,
  size = 'sm',
}: {
  value: number | null
  suffix?: string
  digits?: number
  showIcon?: boolean
  size?: 'sm' | 'md'
}) {
  const tone = toneOf(value)
  const Icon = tone === 'up' ? ArrowUpRight : tone === 'down' ? ArrowDownRight : Minus

  if (value === null) {
    return (
      <span className="num text-dim" title="Not enough history collected yet">
        —
      </span>
    )
  }
  return (
    <span
      className={`num inline-flex items-center gap-0.5 font-medium ${TONE_TEXT[tone]} ${
        size === 'md' ? 'text-sm' : 'text-[13px]'
      }`}
    >
      {showIcon && <Icon size={size === 'md' ? 14 : 12} strokeWidth={2.5} className="-ml-0.5" />}
      {formatSigned(value, suffix, digits)}
    </span>
  )
}

/** Utilization meter — share of supplied liquidity currently borrowed. */
export function UtilBar({ value }: { value: number | null }) {
  if (value === null) return <div className="num text-center text-[12px] text-dim">—</div>

  const pct = Math.max(0, Math.min(100, value))
  const color = pct >= 90 ? '#FF5C7A' : pct >= 75 ? '#F2C14E' : '#34D8A0'
  return (
    <div
      className="flex flex-col items-center gap-1"
      title={`${pct.toFixed(1)}% of supplied liquidity is borrowed`}
    >
      <span className="num text-[11.5px] font-semibold" style={{ color }}>
        {pct.toFixed(1)}%
      </span>
      <span className="h-1 w-14 overflow-hidden rounded-full bg-raised">
        <span
          className="block h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}90` }}
        />
      </span>
    </div>
  )
}

/** Dependency-free inline sparkline. */
export function Sparkline({
  data,
  width = 96,
  height = 28,
  color = '#A974F1',
}: {
  data: number[]
  width?: number
  height?: number
  color?: string
}) {
  if (data.length < 2) return <div style={{ width, height }} />
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const step = width / (data.length - 1)
  const pts = data.map((v, i) => [i * step, height - ((v - min) / span) * (height - 4) - 2])
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')
  const gid = `sp-${color.slice(1)}-${data.length}-${Math.round(min)}`
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${width},${height} L0,${height} Z`} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2" fill={color} />
    </svg>
  )
}
