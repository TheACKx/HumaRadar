import { useMemo, useState } from 'react'
import { ExternalLink, LineChart, ShieldCheck } from 'lucide-react'
import { CURATORS } from '../data/curators'
import { formatUsd } from '../lib/format'
import type { CuratorRow, CuratorSortKey } from '../types'
import { Sparkline } from './Primitives'
import { ChangeCell, ShareBar, Th } from './StablecoinPanel'

/**
 * Risk curators' TVL from DefiLlama — the assets in the vaults each one
 * manages, across chains — with the week, month and year of change beside it.
 * The rows are curators, not markets, so this sits apart from the network tabs.
 */
export function CuratorPanel({
  onOpenChart, activeId,
}: { onOpenChart: (row: CuratorRow) => void; activeId?: string | null }) {
  const [sortKey, setSortKey] = useState<CuratorSortKey>('total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const onSort = (k: CuratorSortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir(k === 'name' ? 'asc' : 'desc')
    }
  }

  const rows = useMemo(() => {
    const value = (r: CuratorRow): number | string | null => {
      switch (sortKey) {
        case 'name': return r.name.toLowerCase()
        case 'total': return r.total
        case 'change7d': return r.change7d.pct
        case 'change30d': return r.change30d.pct
        case 'change365d': return r.change365d.pct
      }
    }
    return [...CURATORS].sort((a, b) => {
      const va = value(a)
      const vb = value(b)
      // a curator too young for the window always sinks to the bottom
      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [sortKey, sortDir])

  const combined = CURATORS.reduce((a, r) => a + (r.total ?? 0), 0)

  if (!CURATORS.length) {
    return (
      <div className="card grid place-items-center px-6 py-16 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-hairline bg-raised/50 text-plum-500">
          <ShieldCheck size={22} />
        </div>
        <div className="mt-4 text-[15px] font-semibold text-plum-100">No curator data collected yet</div>
        <div className="mt-1 max-w-sm text-[12.5px] text-dim">
          Run <span className="num text-plum-300">npm run collect -- --only=curators</span> to pull the TVL
          history from DefiLlama.
        </div>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline/70 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-plum-100">
          <ShieldCheck size={14} className="text-plum-400" />
          TVL by curator
        </h2>
        <span className="text-[11px] text-dim">
          {CURATORS.length} curators · <span className="num">{formatUsd(combined)}</span> combined
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left" style={{ minWidth: 980 }}>
          <thead>
            <tr className="border-b border-hairline/70 bg-raised/30">
              <Th className="w-11 pl-5 text-center">#</Th>
              <Th<CuratorSortKey> sortKey="name" active={sortKey} dir={sortDir} onSort={onSort}>Curator</Th>
              <Th<CuratorSortKey> align="right" divider sortKey="total" active={sortKey} dir={sortDir} onSort={onSort}
                title="Assets in the vaults this curator manages, across chains (DefiLlama)">
                TVL
              </Th>
              <Th<CuratorSortKey> align="right" sortKey="change7d" active={sortKey} dir={sortDir} onSort={onSort}
                title="Change over the last 7 days">
                7D Change
              </Th>
              <Th<CuratorSortKey> align="right" sortKey="change30d" active={sortKey} dir={sortDir} onSort={onSort}
                title="Change over the last 30 days">
                30D Change
              </Th>
              <Th<CuratorSortKey> align="right" sortKey="change365d" active={sortKey} dir={sortDir} onSort={onSort}
                title="Change over the last year — blank for a curator DefiLlama has tracked for less">
                1Y Change
              </Th>
              <Th align="right" className="w-[110px]" title="Share of the listed curators' combined TVL">
                Share
              </Th>
              <Th align="right" className="w-[130px] pr-5">Chart</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const active = activeId === r.id
              const share = combined ? ((r.total ?? 0) / combined) * 100 : 0
              return (
                <tr
                  key={r.id}
                  className={
                    'group border-b border-hairline/40 transition-colors last:border-0 ' +
                    (active ? 'bg-plum-600/12' : 'hover:bg-plum-950/25')
                  }
                >
                  <td className="num py-3 pl-5 text-center text-[11px] text-dim">{i + 1}</td>

                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: r.color, boxShadow: `0 0 10px ${r.color}80` }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13.5px] font-semibold text-white">{r.name}</span>
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="shrink-0 text-dim opacity-0 transition-opacity hover:text-plum-300 group-hover:opacity-100"
                            title="Open the DefiLlama page"
                          >
                            <ExternalLink size={12} />
                          </a>
                        </div>
                        <div className="text-[11px] text-dim">
                          {/* the store keeps ~400 days, so an older curator's first stored day is not its start */}
                          {r.history.length > 365 ? 'over a year of history' : `tracked since ${r.history[0]?.date ?? '—'}`}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="num border-l border-hairline/40 py-3 pl-4 pr-4 text-right text-[13.5px] font-semibold text-white">
                    {formatUsd(r.total)}
                  </td>
                  <td className="py-3 pr-4 text-right"><ChangeCell change={r.change7d} /></td>
                  <td className="py-3 pr-4 text-right"><ChangeCell change={r.change30d} /></td>
                  <td className="py-3 pr-4 text-right"><ChangeCell change={r.change365d} /></td>

                  <td className="py-3 pr-4">
                    <ShareBar pct={share} color={r.color} title={`${share.toFixed(2)}% of the listed curators' TVL`} />
                  </td>

                  <td className="py-3 pr-5 text-right">
                    <div className="flex items-center justify-end gap-2.5">
                      <Sparkline data={r.history.slice(-30).map((h) => h.total)} color={r.color} width={52} height={22} />
                      <button
                        onClick={() => onOpenChart(r)}
                        className={
                          'btn whitespace-nowrap !px-2.5 !py-1.5 !text-[12px] ' +
                          (active ? 'btn-primary' : 'opacity-70 group-hover:opacity-100')
                        }
                        title="Show TVL history"
                      >
                        <LineChart size={13} />
                        Graph
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
