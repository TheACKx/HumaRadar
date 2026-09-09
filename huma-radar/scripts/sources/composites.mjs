/**
 * Composite rows — a total summed from rows the other sources have already
 * collected, rather than from an endpoint of its own.
 *
 * Some questions cut across protocols. "How much PST liquidity is there?" is
 * answered by Fluid's PST-USDC vault plus Jupiter's plus Orca's PST/USDC pool,
 * and no single API knows about all three. A composite declares its parts by
 * store id and this runs last, after every source has written today's row.
 *
 * A composite always double-counts by construction — its parts are listed on
 * the same tab — so it carries both `rollup` and `notInTotal`: the first says
 * what it is, the second keeps it out of the header totals regardless of the
 * per-protocol rule that governs liquidity-layer roll-ups.
 *
 * History is summed per date and rebuilt from scratch each run, so a change to
 * which parts a composite covers cannot leave older days on the previous basis.
 * A part missing a given day contributes nothing to it rather than voiding the
 * total, which is what makes a young part join the series cleanly.
 */

import { OVERLAYS } from '../tracked.mjs'

const round = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v))

export function collectComposites({ store, today, log }) {
  let snapshots = 0

  const wants = OVERLAYS.flatMap((o) => (o.composites ?? []).map((c) => [o, c]))

  for (const [overlay, want] of wants) {
    const parts = want.parts.map((id) => store.markets[id]).filter(Boolean)
    const missing = want.parts.filter((id) => !store.markets[id])
    if (missing.length) {
      log(`  Total  ${overlay.label.padEnd(7)} ${want.name.padEnd(22)} !! missing ${missing.join(', ')}`)
    }
    if (!parts.length) continue

    const id = `composite-${overlay.id}-${want.id}`
    const entry = (store.markets[id] ??= { id, history: [] })

    Object.assign(entry, {
      id,
      chain: overlay.id,
      chainId: parts[0].chainId,
      protocol: 'Combined',
      kind: 'reserve',
      name: want.name,
      symbol: want.symbol,
      venue: want.venue ?? parts.map((p) => p.protocol).join(' · '),
      venueAddress: `composite:${want.id}`,
      assetName: want.assetName ?? want.symbol,
      assetAddress: want.assetAddress ?? `composite:${want.id}`,
      borrowable: false,
      // it contains the rows it sums, and those rows are on the same tab
      rollup: true,
      notInTotal: true,
      url: want.url,
    })

    const series = parts.map((p) => {
      const byDate = new Map(p.history.filter((h) => h.tvl != null).map((h) => [h.date, h.tvl]))
      // the day this part first reported anything; before that it contributes
      // nothing rather than making the day incomplete
      const from = [...byDate.keys()].sort()[0] ?? null
      return { byDate, from }
    })

    const dates = [...new Set(series.flatMap((s) => [...s.byDate.keys()]))].sort()

    entry.history = []
    for (const date of dates) {
      let total = 0
      let complete = true
      for (const s of series) {
        if (s.from === null || date < s.from) continue // not yet in existence
        const v = s.byDate.get(date)
        // a part that existed on this day but did not report it would make the
        // sum read as a drop, so the day is left out altogether
        if (v == null) {
          complete = false
          break
        }
        total += v
      }
      if (!complete) continue

      entry.history.push({
        date,
        tvl: round(total),
        borrowed: null,
        available: null,
        apy: null,
        borrowApy: null,
        utilization: null,
      })
    }

    const latest = entry.history[entry.history.length - 1]
    snapshots++
    log(
      `  Total  ${overlay.label.padEnd(7)} ${want.name.padEnd(22)}` +
        ` $${((latest?.tvl ?? 0) / 1e6).toFixed(2)}M across ${parts.length} row${parts.length === 1 ? '' : 's'}` +
        (latest?.date === today ? '' : ` !! newest day is ${latest?.date}`),
    )
  }

  return { snapshots, backfills: 0 }
}
