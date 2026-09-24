import {
  Children, cloneElement, createContext, isValidElement, useContext,
  type ReactElement, type ReactNode,
} from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowUpRight, Flag } from 'lucide-react'
import { chainColor } from '../data/reports'

/**
 * Renders a weekly report's markdown in the dashboard's own visual language.
 *
 * The report file stays plain markdown — the workflow writes it, the numbers
 * checker reads it, and it has to read well on GitHub too — so everything that
 * makes it look like part of the site happens here, at render time: signed
 * figures take the gain/loss colours, trend words become pills, chain names get
 * their dots, and a table's total row is set apart.
 */

// the minimum of a hast node this file reads
type HNode = { type: string; tagName?: string; value?: string; children?: HNode[] }

const textOf = (n?: HNode): string =>
  !n ? '' : n.type === 'text' ? (n.value ?? '') : (n.children ?? []).map(textOf).join('')

const meaningful = (n: HNode) => !(n.type === 'text' && !n.value?.trim())

// signed dollars, signed percentages and points, and the report's markers —
// only explicit signs, so an unsigned level like "$313.27B" stays neutral
const TOKEN = /([+−]\$[\d.,]+[KMB]?|[+−]\d[\d.,]*(?:%|pp)|[⚑◆◇†‡])/g

function Token({ t }: { t: string }) {
  if (t === '⚑') return <FlagMark />
  if ('◆◇†‡'.includes(t)) {
    return <span className="mx-px align-[1px] text-[0.85em] text-plum-300">{t}</span>
  }
  const zero = Number(t.replace(/[^\d.]/g, '')) === 0
  const tone = zero ? 'text-muted' : t.startsWith('+') ? 'text-gain' : 'text-loss'
  return <span className={`num font-medium ${tone}`}>{t}</span>
}

/** Colours the figures inside plain strings; elements pass through untouched. */
export function decorate(children: ReactNode): ReactNode {
  return Children.map(children, (c) => {
    if (typeof c !== 'string') return c
    const parts = c.split(TOKEN)
    if (parts.length === 1) return c
    // a capturing split alternates text, token, text, token…
    return parts.map((p, i) => (i % 2 ? <Token key={i} t={p} /> : p))
  })
}

export function FlagMark() {
  return (
    <span
      title="Significant this week"
      className="inline-grid h-[18px] w-[18px] place-items-center rounded-md border border-plum-400/40 bg-plum-500/15 text-plum-300 shadow-[0_0_10px_-2px_rgba(169,116,241,0.6)]"
    >
      <Flag size={10} strokeWidth={2.5} />
    </span>
  )
}

function ChainName({ name }: { name: string }) {
  const color = chainColor(name)
  if (!color) return <>{name}</>
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}99` }} />
      {name}
    </span>
  )
}

function Pill({ tone, children }: { tone: 'gain' | 'loss' | 'plum' | 'dim'; children: ReactNode }) {
  const cls = {
    gain: 'border-gain/25 bg-gain/10 text-gain',
    loss: 'border-loss/25 bg-loss/10 text-loss',
    plum: 'border-plum-500/30 bg-plum-500/10 text-plum-200',
    dim: 'border-hairline bg-raised/50 text-dim',
  }[tone]
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${cls}`}>
      {children}
    </span>
  )
}

// ---------------------------------------------------------------- tables

/** Column headers of the table being rendered, so a cell knows what it holds. */
const Columns = createContext<string[]>([])

const NUMERIC = /TVL|WoW|30d|APY|Supply|Value|Markets|Borrow|Util|PST on chain|Huma tab|Biggest day|outside tracked|^#$/i
const CHAIN = /^(Chain|Network)$/
// Long free-text cells wrap instead of stretching the table off the page. Checked
// before NUMERIC: "Top 3 by supply (WoW %)" names a figure but holds a sentence.
const WRAPS = /Top 3|Biggest mover|^Market$|^Product$|^Chain$/
const isNumeric = (header: string) => NUMERIC.test(header) && !WRAPS.test(header)

type CellProps = { node?: unknown; children?: ReactNode; col?: number }

function Cell({ node, children, col = -1 }: CellProps) {
  const header = useContext(Columns)[col] ?? ''
  const text = textOf(node as HNode).trim()
  const base = 'px-3 py-2.5 align-middle'

  if (header === '' && text === '⚑') return <td className={`${base} w-9 pr-0`}><FlagMark /></td>
  if (header === '' && !text) return <td className={`${base} w-9 pr-0`} />

  if (header === 'Trend') {
    const tone = /^up/.test(text) ? 'gain' : /^down/.test(text) ? 'loss' : text === 'mixed' ? 'plum' : 'dim'
    return <td className={`${base} whitespace-nowrap`}><Pill tone={tone}>{text}</Pill></td>
  }
  if (/^Faster than market/.test(header) && (text === 'yes' || text === 'no')) {
    return <td className={base}><Pill tone={text === 'yes' ? 'gain' : 'loss'}>{text}</Pill></td>
  }
  if (CHAIN.test(header) && chainColor(text)) {
    return <td className={`${base} whitespace-nowrap`}><ChainName name={text} /></td>
  }
  if (isNumeric(header)) {
    return <td className={`${base} num whitespace-nowrap text-right text-plum-100`}>{decorate(children)}</td>
  }
  const wrap = WRAPS.test(header) ? (CHAIN.test(header) ? 'min-w-[130px]' : 'min-w-[170px]') : 'whitespace-nowrap'
  return <td className={`${base} ${wrap} text-plum-100/90`}>{decorate(children)}</td>
}

function HeadCell({ children, col = -1 }: CellProps) {
  const header = useContext(Columns)[col] ?? ''
  // a long header ("PST growth outside tracked venues") wraps onto two lines
  // rather than setting the column's width by itself
  const long = header.length > 16
  return (
    <th
      className={`px-3 py-2.5 text-[10px] font-semibold uppercase leading-tight tracking-[0.12em] text-dim ${
        long ? 'min-w-[96px] max-w-[150px] whitespace-normal' : 'whitespace-nowrap'
      } ${isNumeric(header) ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  )
}

const components = {
  p: ({ node, children }: { node?: unknown; children?: ReactNode }) => {
    // a paragraph that is nothing but bold text is the report's subheading
    const kids = ((node as HNode)?.children ?? []).filter(meaningful)
    if (kids.length === 1 && kids[0].tagName === 'strong') {
      return (
        <h3 className="flex items-center gap-2 pt-2 text-[12px] font-bold uppercase tracking-[0.14em] text-plum-300">
          <span className="h-px w-4 bg-gradient-to-r from-plum-400 to-transparent" />
          {textOf(kids[0])}
        </h3>
      )
    }
    return <p className="text-[13.5px] leading-[1.8] text-plum-100/85">{children}</p>
  },
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-white">{decorate(children)}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => <em className="italic text-plum-200">{children}</em>,
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group/link inline-flex items-baseline gap-0.5 text-plum-300 underline decoration-plum-500/40 decoration-1 underline-offset-[3px] transition-colors hover:text-plum-100 hover:decoration-plum-300"
    >
      {children}
      <ArrowUpRight size={11} className="shrink-0 self-center opacity-60 transition-opacity group-hover/link:opacity-100" />
    </a>
  ),
  ul: ({ children }: { children?: ReactNode }) => <ul className="space-y-2.5">{children}</ul>,
  ol: ({ children }: { children?: ReactNode }) => <ol className="list-decimal space-y-2.5 pl-5">{children}</ol>,
  li: ({ children }: { children?: ReactNode }) => (
    <li className="relative pl-5 text-[13.5px] leading-[1.75] text-plum-100/85 [&>ul]:mt-2.5">
      <span className="absolute left-1 top-[0.72em] h-1.5 w-1.5 rounded-full bg-plum-400/80 shadow-[0_0_8px_#A974F1]" />
      {children}
    </li>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="rounded-xl border border-plum-500/20 bg-plum-500/[0.06] px-4 py-3 text-[12.5px] text-plum-200 [&_p]:text-[12.5px] [&_p]:leading-relaxed [&_p]:text-plum-200">
      {children}
    </blockquote>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded-md border border-hairline bg-raised/70 px-1.5 py-0.5 font-mono text-[11.5px] text-plum-200">
      {children}
    </code>
  ),
  hr: () => <hr className="border-hairline/60" />,
  table: ({ node, children }: { node?: unknown; children?: ReactNode }) => {
    const head = (node as HNode)?.children?.find((c) => c.tagName === 'thead')
    const cols = (head?.children?.find((c) => c.tagName === 'tr')?.children ?? [])
      .filter((c) => c.tagName === 'th')
      .map((c) => textOf(c).trim())
    return (
      <Columns.Provider value={cols}>
        <div className="overflow-x-auto rounded-xl border border-hairline/70 bg-abyss/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <table className="w-full border-collapse text-[12.5px]">{children}</table>
        </div>
      </Columns.Provider>
    )
  },
  thead: ({ children }: { children?: ReactNode }) => (
    <thead className="border-b border-hairline/80 bg-raised/40">{children}</thead>
  ),
  tbody: ({ children }: { children?: ReactNode }) => <tbody>{children}</tbody>,
  tr: ({ node, children }: { node?: unknown; children?: ReactNode }) => {
    const cells = ((node as HNode)?.children ?? []).filter((c) => c.tagName === 'td')
    // "**Total**" / "**All chains**" rows sum the others, so they are set apart
    const total = cells.some(
      (c) => c.children?.find(meaningful)?.tagName === 'strong' && /^(Total|All chains)$/.test(textOf(c).trim()),
    )
    let i = 0
    const kids = Children.map(children, (c) =>
      isValidElement(c) ? cloneElement(c as ReactElement<CellProps>, { col: i++ }) : c,
    )
    return (
      <tr
        className={
          total
            ? 'border-t border-plum-500/30 bg-plum-500/[0.07] font-semibold'
            : 'border-b border-hairline/40 transition-colors last:border-b-0 hover:bg-raised/40'
        }
      >
        {kids}
      </tr>
    )
  },
  th: HeadCell,
  td: Cell,
} as unknown as Components

export function ReportMarkdown({ children }: { children: string }) {
  return (
    <div className="space-y-4">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}

/** For one-line fragments — TL;DR items, captions — with no block wrapper. */
export function InlineMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{ ...components, p: ({ children: c }: { children?: ReactNode }) => <>{c}</> } as Components}
    >
      {children}
    </ReactMarkdown>
  )
}
