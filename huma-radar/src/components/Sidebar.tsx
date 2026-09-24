import { useState } from 'react'
import { Activity, ChevronRight, Clock3, Coins, FileText, Landmark, Layers } from 'lucide-react'
import { CHAIN_MAP, NETWORKS, PROJECTS } from '../data/chains'
import { LATEST_REPORT, weekLabel } from '../data/reports'
import { STABLE_TOTAL } from '../data/stablecoins'
import { STABLE_PROTOCOLS } from '../data/stableprotocols'
import { formatUsd } from '../lib/format'
import type { Chain, ChainId, MarketRow, ViewId } from '../types'
import { ChainDot, Logo } from './Primitives'

interface Props {
  selected: ViewId
  onSelect: (v: ViewId) => void
  allRows: MarketRow[]
  lastSync: string
}

/**
 * Huma Related is an overlay, not a network — a vault it lists may also appear
 * under its own chain. Global totals therefore count each venue once, keyed by
 * the protocol and address it actually lives at.
 */
function dedupe(rows: MarketRow[]): MarketRow[] {
  const seen = new Set<string>()
  return rows.filter((r) => {
    // venueAddress alone is not an identity: every Aave reserve in a market
    // shares the pool address, so the asset has to be part of the key
    const key = `${r.protocol}-${r.chainId}-${r.venueAddress.toLowerCase()}-${r.assetAddress.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function Sidebar({ selected, onSelect, allRows, lastSync }: Props) {
  const unique = dedupe(allRows)
  const protocolTvl = STABLE_PROTOCOLS.reduce((a, r) => a + (r.tvl ?? 0), 0)

  return (
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-hairline/60 bg-abyss/80 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-5 py-5">
        <Logo />
        <div className="leading-tight">
          <div className="text-[15px] font-extrabold tracking-tight text-white">
            Huma <span className="text-plum-400">Radar</span>
          </div>
          <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-dim">
            Yield &amp; TVL Intelligence
          </div>
        </div>
      </div>

      <div className="mx-5 h-px bg-gradient-to-r from-transparent via-hairline to-transparent" />

      <nav className="flex-1 overflow-y-auto pb-4">
        <div className="px-5 pb-2 pt-5">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-dim">Overview</span>
        </div>

        <div className="space-y-0.5 px-3">
          <OverviewTab
            icon={<FileText size={11} />}
            label="Weekly Report"
            detail={
              LATEST_REPORT
                ? `${weekLabel(LATEST_REPORT.start, LATEST_REPORT.end, { short: true, withYear: false })} · latest`
                : 'first report on Friday'
            }
            selected={selected === 'reports'}
            onSelect={() => onSelect('reports')}
          />
          <OverviewTab
            icon={<Coins size={11} />}
            label="Stablecoin Supply"
            detail={STABLE_TOTAL?.total ? `${formatUsd(STABLE_TOTAL.total)} all chains` : 'not collected yet'}
            selected={selected === 'stables'}
            onSelect={() => onSelect('stables')}
          />
          <OverviewTab
            icon={<Landmark size={11} />}
            label="Stablecoin Protocols"
            detail={
              STABLE_PROTOCOLS.length
                ? `${STABLE_PROTOCOLS.length} products · ${formatUsd(protocolTvl)}`
                : 'not collected yet'
            }
            selected={selected === 'protocols'}
            onSelect={() => onSelect('protocols')}
          />
          <ChainTab
            chain={CHAIN_MAP.huma}
            rows={allRows}
            selected={selected === 'huma'}
            onSelect={() => onSelect('huma')}
          />
        </div>

        <ChainGroup
          title="Networks"
          chains={NETWORKS}
          selected={selected}
          onSelect={onSelect}
          allRows={allRows}
        />
        <ChainGroup
          title="Projects"
          chains={PROJECTS}
          selected={selected}
          onSelect={onSelect}
          allRows={allRows}
        />
      </nav>

      <div className="space-y-2 border-t border-hairline/60 px-5 py-4">
        <Row
          icon={<Layers size={13} />}
          label="Markets tracked"
          value={String(unique.length)}
          title={
            unique.length === allRows.length
              ? undefined
              : `${allRows.length} listings, ${allRows.length - unique.length} of them cross-listed on Huma Related`
          }
        />
        <Row
          icon={<Activity size={13} />}
          label="Aggregate TVL"
          value={formatUsd(unique.reduce((a, r) => a + (r.tvl ?? 0), 0))}
          title="Each venue counted once, even when it appears on more than one tab"
        />
        <Row icon={<Clock3 size={13} />} label="Last collected" value={lastSync} />
        <div className="flex items-center gap-2 pt-1">
          <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-gain shadow-[0_0_8px_#34D8A0]" />
          <span className="text-[10.5px] text-dim">Aave · Morpho · Fluid · Jupiter · daily</span>
        </div>
      </div>
    </aside>
  )
}

/**
 * A collapsible run of chain tabs. Networks and Projects answer different
 * questions — what is deployed where, versus where one asset family is
 * accepted — so either can be folded away while working in the other.
 *
 * Collapsing never hides where you are: a folded section holding the current
 * tab names it in the header instead of counting its rows.
 */
function ChainGroup({
  title, chains, selected, onSelect, allRows,
}: {
  title: string
  chains: Chain[]
  selected: ViewId
  onSelect: (v: ViewId) => void
  allRows: MarketRow[]
}) {
  const [open, setOpen] = useState(true)
  const holdsSelection = chains.some((c) => c.id === selected)

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex w-full items-center gap-1.5 px-5 pb-2 pt-5 text-left"
      >
        <ChevronRight
          size={11}
          className={
            'shrink-0 text-dim transition-transform duration-150 group-hover:text-plum-300 ' +
            (open ? 'rotate-90' : '')
          }
        />
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-dim group-hover:text-plum-200">
          {title}
        </span>
        <span className="ml-auto truncate pl-2 text-[10px] text-dim/70">
          {open || !holdsSelection ? chains.length : CHAIN_MAP[selected as ChainId].name}
        </span>
      </button>

      {open && (
        <div className="space-y-0.5 px-3">
          {chains.map((c) => (
            <ChainTab
              key={c.id}
              chain={c}
              rows={allRows}
              selected={c.id === selected}
              onSelect={() => onSelect(c.id)}
            />
          ))}
        </div>
      )}
    </>
  )
}

/** One chain or overlay tab, wherever in the sidebar it happens to be listed. */
function ChainTab({
  chain, rows, selected, onSelect,
}: {
  chain: Chain
  rows: MarketRow[]
  selected: boolean
  onSelect: () => void
}) {
  const mine = rows.filter((r) => r.chain === chain.id)
  const tvl = mine.reduce((a, r) => a + (r.tvl ?? 0), 0)

  return (
    <button
      onClick={onSelect}
      aria-current={selected ? 'page' : undefined}
      className={
        'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150 ' +
        (selected
          ? 'bg-gradient-to-r from-plum-600/22 to-transparent shadow-[inset_0_0_0_1px_rgba(145,70,232,0.28)]'
          : 'hover:bg-raised/60')
      }
    >
      {selected && (
        <span className="absolute left-0 top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-r-full bg-plum-400 shadow-[0_0_10px_#A974F1]" />
      )}
      <ChainDot chain={chain.id} size={9} />
      <span className="min-w-0 flex-1">
        <span
          className={
            'block truncate text-[13px] font-semibold ' +
            (selected ? 'text-white' : 'text-plum-200/80 group-hover:text-plum-100')
          }
        >
          {chain.name}
        </span>
        <span className="num block text-[10.5px] text-dim">
          {mine.length ? `${mine.length} markets · ${formatUsd(tvl)}` : 'not tracked yet'}
        </span>
      </span>
      {!mine.length && (
        <span className="rounded border border-hairline px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-dim">
          Soon
        </span>
      )}
    </button>
  )
}

/**
 * The overview tabs look wider than any one network: the week's report, what
 * stablecoin supply exists at all, what the issuers pay on it, and Huma itself.
 */
function OverviewTab({
  icon, label, detail, selected, onSelect,
}: {
  icon: React.ReactNode
  label: string
  detail: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      aria-current={selected ? 'page' : undefined}
      className={
        'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150 ' +
        (selected
          ? 'bg-gradient-to-r from-plum-600/22 to-transparent shadow-[inset_0_0_0_1px_rgba(145,70,232,0.28)]'
          : 'hover:bg-raised/60')
      }
    >
      {selected && (
        <span className="absolute left-0 top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-r-full bg-plum-400 shadow-[0_0_10px_#A974F1]" />
      )}
      <span
        className={
          'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border ' +
          (selected ? 'border-plum-400/50 text-plum-300' : 'border-hairline text-plum-500/80')
        }
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={
            'block truncate text-[13px] font-semibold ' +
            (selected ? 'text-white' : 'text-plum-200/80 group-hover:text-plum-100')
          }
        >
          {label}
        </span>
        <span className="num block text-[10.5px] text-dim">{detail}</span>
      </span>
    </button>
  )
}

function Row({
  icon, label, value, title,
}: { icon: React.ReactNode; label: string; value: string; title?: string }) {
  return (
    <div className="flex items-center justify-between gap-2" title={title}>
      <span className="flex items-center gap-2 text-[11px] text-dim">
        <span className="text-plum-500/70">{icon}</span>
        {label}
      </span>
      <span className="num text-[11.5px] font-semibold text-plum-200">{value}</span>
    </div>
  )
}
