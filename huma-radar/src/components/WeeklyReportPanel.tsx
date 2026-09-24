import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowDownRight, ArrowUpRight, CalendarClock, Coins, FileText, Flag, Info, Landmark, Layers,
  Minus, Newspaper, Radar, Rocket, Search, Sparkles, TrendingDown, TrendingUp, type LucideIcon,
} from 'lucide-react'
import { LATEST_REPORT, REPORTS, addDays, dayLabel, longDate, nextReportDate, weekLabel } from '../data/reports'
import type { ReportHeadline, ReportKpi, ReportMeta } from '../types'
import { InlineMarkdown, ReportMarkdown } from './ReportMarkdown'

/**
 * The weekly report tab: a strip of weeks, newest first, and the selected
 * week's report beneath it. Reports are markdown files the report workflow
 * writes to reports/; this view adds the frame — the week's headline figures,
 * the TL;DR set apart, and a contents rail — without changing a word of them.
 */
export function WeeklyReportPanel() {
  const [selected, setSelected] = useState(LATEST_REPORT?.end ?? null)
  const report = REPORTS.find((r) => r.end === selected) ?? null

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-plum-500/20 bg-plum-500/10 text-plum-300">
            <FileText size={17} />
          </span>
          <div>
            <h1 className="text-[22px] font-extrabold leading-none tracking-tight text-white">Weekly Report</h1>
            <p className="mt-1.5 text-[12.5px] text-muted">
              Where TVL and stablecoin supply moved each week, and why — every figure traced to the data.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip">
            <CalendarClock size={11} />
            Fridays · after the 12:00 UTC snapshot
          </span>
          <span className="chip">
            {REPORTS.length} report{REPORTS.length === 1 ? '' : 's'}
          </span>
        </div>
      </header>

      <WeekStrip selected={selected} onSelect={setSelected} />

      {report ? (
        <ReportView key={report.end} report={report} latest={report === LATEST_REPORT} />
      ) : (
        <div className="card grid place-items-center px-6 py-20 text-center">
          <FileText size={22} className="text-plum-400" />
          <p className="mt-3 text-sm font-semibold text-white">No reports yet</p>
          <p className="mt-1 text-[12.5px] text-muted">The first one appears here after a Friday run.</p>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------- weeks

function WeekStrip({ selected, onSelect }: { selected: string | null; onSelect: (end: string) => void }) {
  const next = nextReportDate()
  const nextIsNew = !REPORTS.some((r) => r.end >= next)

  return (
    <div className="mb-6 flex gap-3 overflow-x-auto pb-1">
      {REPORTS.map((r, i) => {
        const active = r.end === selected
        return (
          <button
            key={r.end}
            onClick={() => onSelect(r.end)}
            aria-current={active ? 'true' : undefined}
            className={
              'group relative w-[208px] shrink-0 overflow-hidden rounded-2xl border p-4 text-left transition-all duration-150 ' +
              (active
                ? 'border-plum-400/50 bg-gradient-to-br from-plum-600/25 via-panel/80 to-panel/70 shadow-glow'
                : 'border-hairline/80 bg-panel/60 hover:border-plum-600/50 hover:bg-raised/60')
            }
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-dim">Week</span>
              {i === 0 && (
                <span className="rounded-full border border-gain/30 bg-gain/10 px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-gain">
                  Latest
                </span>
              )}
            </div>
            <div className={`mt-1.5 text-[19px] font-extrabold tracking-tight ${active ? 'text-white' : 'text-plum-100'}`}>
              {weekLabel(r.start, r.end, { short: true, withYear: false })}
            </div>
            <div className="text-[11px] text-dim">{new Date(`${r.end}T00:00:00Z`).getUTCFullYear()}</div>
            {r.headline && (
              <div className="mt-3 flex items-center gap-2 border-t border-hairline/60 pt-2.5 text-[11px]">
                <span className="text-dim">PST</span>
                <Signed dir={r.headline.pst.dir}>{r.headline.pst.pct}</Signed>
                <span className="ml-auto inline-flex items-center gap-1 text-dim">
                  <Flag size={10} className="text-plum-400" />
                  {r.headline.flagged.products + r.headline.flagged.groups} flagged
                </span>
              </div>
            )}
          </button>
        )
      })}

      {nextIsNew && (
        <div className="w-[208px] shrink-0 rounded-2xl border border-dashed border-hairline p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-dim">Next report</div>
          <div className="mt-1.5 text-[19px] font-extrabold tracking-tight text-plum-200/60">
            {weekLabel(addDays(next, -7), next, { short: true, withYear: false })}
          </div>
          <div className="text-[11px] text-dim">{dayLabel(next)}</div>
          <div className="mt-3 flex items-center gap-1.5 border-t border-hairline/60 pt-2.5 text-[11px] text-dim">
            <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-plum-400" />
            Scheduled
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- report

interface Section {
  id: string
  title: string
  body: string
}

/**
 * Splits the report at its `##` headings. Whatever precedes the first one is
 * the preamble — window, sources, notes — minus the `#` title, which the page
 * replaces with its own hero.
 */
function splitSections(md: string): { preamble: string; sections: Section[] } {
  const preamble: string[] = []
  const sections: Section[] = []
  let cur: { title: string; lines: string[] } | null = null
  const flush = () => {
    if (!cur) return
    const id = cur.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    sections.push({ id, title: cur.title, body: cur.lines.join('\n').trim() })
  }
  for (const line of md.split('\n')) {
    const h = line.match(/^##\s+(.+?)\s*$/)
    if (h) {
      flush()
      cur = { title: h[1], lines: [] }
    } else if (cur) cur.lines.push(line)
    else if (!/^#\s/.test(line)) preamble.push(line)
  }
  flush()
  return { preamble: preamble.join('\n').trim(), sections }
}

function ReportView({ report, latest }: { report: ReportMeta; latest: boolean }) {
  const [text, setText] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    report.load().then(
      (t) => live && setText(t),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [report])

  const parsed = useMemo(() => (text ? splitSections(text) : null), [text])

  return (
    <div className="space-y-6">
      <Hero report={report} latest={latest} preamble={parsed?.preamble ?? null} />
      {parsed ? (
        <Body sections={parsed.sections} />
      ) : failed ? (
        <div className="card px-6 py-10 text-center text-[13px] text-loss">This report could not be loaded.</div>
      ) : (
        <Skeleton />
      )}
    </div>
  )
}

function Hero({ report, latest, preamble }: { report: ReportMeta; latest: boolean; preamble: string | null }) {
  const h = report.headline
  return (
    <section className="card relative overflow-hidden p-6 lg:p-7">
      <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-plum-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-plum-800/20 blur-3xl" />
      <div className="grid-lines pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.18em] text-plum-300">
            <Sparkles size={12} />
            Weekly DeFi Report
            {latest && (
              <span className="rounded-full border border-gain/30 bg-gain/10 px-1.5 py-px text-[9.5px] tracking-wide text-gain">
                Latest
              </span>
            )}
          </div>
          <h2 className="mt-2 bg-gradient-to-r from-white via-plum-100 to-plum-300 bg-clip-text text-[30px] font-extrabold leading-tight tracking-tight text-transparent sm:text-[36px]">
            {weekLabel(report.start, report.end)}
          </h2>
          <p className="mt-1 text-[12.5px] text-muted">
            Week ending {longDate(report.end)} · snapshots <span className="num">{report.start}</span> →{' '}
            <span className="num">{report.end}</span>
          </p>
        </div>
        {h && (
          <div className="flex flex-wrap gap-2">
            <span className="chip !border-plum-500/30 !text-plum-200">
              <Flag size={11} className="text-plum-400" />
              {h.flagged.products + h.flagged.groups} significant moves
            </span>
            <span className="chip">
              <Search size={11} />
              {h.flagged.passes} researched
            </span>
          </div>
        )}
      </div>

      {h && <KpiGrid h={h} />}

      {preamble && (
        <div className="relative mt-5 border-t border-hairline/60 pt-4 [&_blockquote]:mt-3 [&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-dim [&_p]:text-[11.5px] [&_p]:leading-relaxed [&_p]:text-dim">
          <ReportMarkdown>{preamble}</ReportMarkdown>
        </div>
      )}
    </section>
  )
}

function KpiGrid({ h }: { h: ReportHeadline }) {
  return (
    <div className="relative mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi icon={Coins} label="Stablecoin supply" sub="All chains" k={h.supply} />
      <Kpi icon={Layers} label="Tracked lending TVL" sub="Markets Huma Radar follows" k={h.venues} />
      <Kpi icon={Radar} label="Huma PST" sub="Supply across chains" k={h.pst} glow />
      <div className="rounded-xl border border-hairline/70 bg-abyss/50 p-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-dim">Biggest movers</div>
        <div className="mt-3 space-y-2.5">
          {h.topUp && <Mover icon={TrendingUp} tone="gain" label={h.topUp.label} usd={h.topUp.usd} />}
          {h.topDown && <Mover icon={TrendingDown} tone="loss" label={h.topDown.label} usd={h.topDown.usd} />}
        </div>
      </div>
    </div>
  )
}

function Kpi({ icon: Icon, label, sub, k, glow }: { icon: LucideIcon; label: string; sub: string; k: ReportKpi; glow?: boolean }) {
  const Arrow = k.dir > 0 ? ArrowUpRight : k.dir < 0 ? ArrowDownRight : Minus
  return (
    <div
      className={
        'rounded-xl border p-4 ' +
        (glow ? 'border-plum-500/30 bg-plum-500/[0.07] shadow-[0_0_30px_-12px_rgba(169,116,241,0.6)]' : 'border-hairline/70 bg-abyss/50')
      }
    >
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-dim">
        <Icon size={12} className="text-plum-400" />
        {label}
      </div>
      <div className="num mt-2 text-[24px] font-semibold leading-none text-white">{k.value}</div>
      <div className="mt-2 flex items-center gap-1.5 text-[12px]">
        <Signed dir={k.dir}>
          <Arrow size={13} className="-mr-0.5" />
          {k.usd}
        </Signed>
        <Signed dir={k.dir} dim>
          {k.pct}
        </Signed>
        <span className="text-[11px] text-dim">WoW</span>
      </div>
      <div className="mt-1 text-[11px] text-dim">{sub}</div>
    </div>
  )
}

function Mover({ icon: Icon, tone, label, usd }: { icon: LucideIcon; tone: 'gain' | 'loss'; label: string; usd: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${
          tone === 'gain' ? 'border-gain/25 bg-gain/10 text-gain' : 'border-loss/25 bg-loss/10 text-loss'
        }`}
      >
        <Icon size={14} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[12px] font-semibold text-plum-100">{label}</div>
        <div className={`num text-[12.5px] font-semibold ${tone === 'gain' ? 'text-gain' : 'text-loss'}`}>{usd}</div>
      </div>
    </div>
  )
}

function Signed({ dir, dim, children }: { dir: number; dim?: boolean; children: ReactNode }) {
  const tone = dir > 0 ? 'text-gain' : dir < 0 ? 'text-loss' : 'text-muted'
  return <span className={`num inline-flex items-center font-medium ${tone} ${dim ? 'opacity-75' : ''}`}>{children}</span>
}

// ---------------------------------------------------------------- body

const SECTION_ICONS: [RegExp, LucideIcon][] = [
  [/TL;DR/i, Sparkles],
  [/supply/i, Coins],
  [/product/i, Landmark],
  [/venue|lending/i, Layers],
  [/drove|why/i, Newspaper],
  [/huma/i, Radar],
  [/note/i, Info],
]
const iconFor = (title: string) => SECTION_ICONS.find(([re]) => re.test(title))?.[1] ?? FileText

function Body({ sections }: { sections: Section[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? '')

  // the contents rail follows whichever section is near the top of the view
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e)
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (hit) setActive(hit.target.id)
      },
      { rootMargin: '-12% 0px -70% 0px' },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [sections])

  return (
    // the rail only where there is room beside the tables; below that they need the width
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_196px]">
      <article className="min-w-0 space-y-5">
        {sections.map((s, i) =>
          /TL;DR/i.test(s.title) ? <Tldr key={s.id} section={s} /> : <SectionCard key={s.id} section={s} index={i} />,
        )}
      </article>

      <aside className="hidden 2xl:block">
        <nav className="sticky top-6">
          <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-dim">On this page</div>
          <div className="space-y-0.5 border-l border-hairline/70">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className={
                  '-ml-px block w-full border-l py-1.5 pl-3 text-left text-[12px] transition-colors ' +
                  (active === s.id
                    ? 'border-plum-400 font-semibold text-white'
                    : 'border-transparent text-muted hover:border-hairline hover:text-plum-100')
                }
              >
                {s.title}
              </button>
            ))}
          </div>
        </nav>
      </aside>
    </div>
  )
}

function SectionCard({ section, index }: { section: Section; index: number }) {
  const Icon = iconFor(section.title)
  const quiet = /note/i.test(section.title)
  return (
    <section
      id={section.id}
      className={`scroll-mt-6 animate-rise p-5 lg:p-6 ${quiet ? 'rounded-2xl border border-hairline/60 bg-abyss/40' : 'card'}`}
      style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
    >
      <header className="mb-4 flex items-center gap-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-lg border border-plum-500/25 bg-plum-500/10 text-plum-300">
          <Icon size={14} />
        </span>
        <h2 className="text-[16px] font-bold tracking-tight text-white">{section.title}</h2>
      </header>
      <div className={quiet ? '[&_li]:text-[12.5px] [&_p]:text-[12.5px]' : ''}>
        <ReportMarkdown>{section.body}</ReportMarkdown>
      </div>
    </section>
  )
}

// each TL;DR line opens with "**Label:**" — the label picks the line's icon
const TLDR_ICONS: [RegExp, LucideIcon, string][] = [
  [/\bdown\b/i, TrendingDown, 'border-loss/25 bg-loss/10 text-loss'],
  [/\bup\b/i, TrendingUp, 'border-gain/25 bg-gain/10 text-gain'],
  [/chain|stablecoin/i, Coins, 'border-plum-500/25 bg-plum-500/10 text-plum-300'],
  [/huma/i, Radar, 'border-plum-400/40 bg-plum-500/15 text-plum-200'],
  [/launch|partner/i, Rocket, 'border-plum-500/25 bg-plum-500/10 text-plum-300'],
]

function Tldr({ section }: { section: Section }) {
  const items = section.body
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => {
      const m = l.slice(2).match(/^\*\*(.+?):\*\*\s*(.*)$/)
      return m ? { label: m[1], text: m[2] } : { label: '', text: l.slice(2) }
    })

  return (
    <section
      id={section.id}
      className="relative scroll-mt-6 animate-rise overflow-hidden rounded-2xl border border-plum-500/30 bg-gradient-to-br from-plum-600/[0.16] via-panel/85 to-panel/75 p-5 shadow-glow lg:p-6"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-plum-500/15 blur-3xl" />
      <header className="relative mb-2 flex items-center gap-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-lg border border-plum-400/40 bg-plum-500/20 text-plum-200">
          <Sparkles size={14} />
        </span>
        <h2 className="text-[16px] font-bold tracking-tight text-white">TL;DR</h2>
        <span className="text-[11.5px] text-dim">The week in five lines</span>
      </header>
      <ul className="relative divide-y divide-hairline/50">
        {items.map((it, i) => {
          const [, Icon, tone] = TLDR_ICONS.find(([re]) => re.test(it.label)) ?? [null, Sparkles, 'border-hairline bg-raised/50 text-plum-300']
          return (
            <li key={i} className="flex gap-3.5 py-3.5 last:pb-1">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${tone}`}>
                <Icon size={15} />
              </span>
              <div className="min-w-0">
                {it.label && (
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-plum-300">{it.label}</div>
                )}
                <div className="mt-0.5 text-[13.5px] leading-relaxed text-plum-100/90">
                  <InlineMarkdown>{it.text}</InlineMarkdown>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Skeleton() {
  return (
    <div className="space-y-5">
      {[180, 320, 260].map((h, i) => (
        <div key={i} className="card animate-pulse" style={{ height: h }} />
      ))}
    </div>
  )
}
