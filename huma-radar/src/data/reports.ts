import { CHAINS } from './chains'
import { CHAIN_FALLBACK_COLOR, STABLE_CHAIN_COLORS } from './stablecoins'
import type { ReportHeadline, ReportMeta, ReportSeries } from '../types'

/**
 * Weekly reports, read from ../reports at the repo root — the report workflow
 * writes them there (reports/PROMPT.md), beside the app rather than inside it.
 *
 * A new report needs no code: drop reports/<date>.md and its
 * data/<date>.headline.json and it appears in the week list on the next build.
 *
 * The markdown is loaded lazily, one chunk per week, so a year of archive costs
 * the bundle nothing until a week is opened. The headlines are a few hundred
 * bytes each and load eagerly, because the week list shows them.
 */
const TEXTS = import.meta.glob(['../../../reports/*.md', '!../../../reports/PROMPT.md'], {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

const HEADLINES = import.meta.glob('../../../reports/data/*.headline.json', {
  eager: true,
  import: 'default',
}) as Record<string, ReportHeadline>

// the daily TVL behind a report's trend graphs — ~50 KB a week, so lazy like the text
const SERIES = import.meta.glob('../../../reports/data/*.series.json', {
  import: 'default',
}) as Record<string, () => Promise<ReportSeries>>

const DATE = /(\d{4}-\d{2}-\d{2})/
const dateOf = (path: string) => path.match(DATE)?.[1] ?? null

export const addDays = (iso: string, n: number) => {
  const t = new Date(`${iso}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

const headlineFor = new Map(
  Object.entries(HEADLINES).map(([path, h]) => [dateOf(path), h]),
)
const seriesFor = new Map(Object.entries(SERIES).map(([path, load]) => [dateOf(path), load]))

/** Newest first. */
export const REPORTS: ReportMeta[] = Object.entries(TEXTS)
  .map(([path, load]) => {
    const end = dateOf(path)
    if (!end) return null
    const headline = headlineFor.get(end) ?? null
    // a report may cover more or less than a week; its headline says so
    return { end, start: headline?.start ?? addDays(end, -7), load, series: seriesFor.get(end) ?? null, headline }
  })
  .filter((r): r is ReportMeta => r !== null)
  .sort((a, b) => b.end.localeCompare(a.end))

/** Days between a report's two snapshots. */
export const spanDays = (r: { start: string; end: string }) =>
  Math.round((Date.parse(`${r.end}T00:00:00Z`) - Date.parse(`${r.start}T00:00:00Z`)) / 86_400_000)

export const LATEST_REPORT = REPORTS[0] ?? null

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`)
// en-US month names: en-GB abbreviates September to "Sept"
const month = (iso: string, style: 'long' | 'short') =>
  utc(iso).toLocaleDateString('en-US', { month: style, timeZone: 'UTC' })
const day = (iso: string) => utc(iso).getUTCDate()
const year = (iso: string) => utc(iso).getUTCFullYear()

/**
 * "16–23 September 2026", or "28 Sep – 5 Oct 2026" across a month boundary.
 * The range is the two snapshots compared, so it says exactly what the numbers
 * cover.
 */
export function weekLabel(start: string, end: string, opts: { short?: boolean; withYear?: boolean } = {}) {
  const { short = false, withYear = true } = opts
  const y = withYear ? ` ${year(end)}` : ''
  if (month(start, 'long') === month(end, 'long') && year(start) === year(end)) {
    return `${day(start)}–${day(end)} ${month(end, short ? 'short' : 'long')}${y}`
  }
  return `${day(start)} ${month(start, 'short')} – ${day(end)} ${month(end, 'short')}${y}`
}

/** "Monday 5 Oct" — assembled by hand so no locale turns it into "Sept". */
export function dayLabel(iso: string) {
  const weekday = utc(iso).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  return `${weekday} ${day(iso)} ${month(iso, 'short')}`
}

export function longDate(iso: string) {
  return utc(iso).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

/**
 * The Monday the next report is due, from today: reports run Monday to Monday
 * at 08:00 UTC, so a Monday that has not reached 08:00 UTC counts.
 */
export function nextReportDate(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes()
  let ahead = (1 - d.getUTCDay() + 7) % 7
  if (ahead === 0 && minutes >= 8 * 60) ahead = 7
  d.setUTCDate(d.getUTCDate() + ahead)
  return d.toISOString().slice(0, 10)
}

// Report tables name chains by display name, including ones the network tabs
// do not list, so colours are keyed by lower-cased name from both sources.
const COLOR_BY_NAME = new Map<string, string>([
  ...CHAINS.map((c) => [c.name.toLowerCase(), c.color] as [string, string]),
  ...Object.entries(STABLE_CHAIN_COLORS).map(([id, c]) => [id, c] as [string, string]),
  ['robinhood chain', STABLE_CHAIN_COLORS.robinhood],
  ['avalanche', '#E84142'],
])

export const chainColor = (name: string) => COLOR_BY_NAME.get(name.trim().toLowerCase()) ?? null
export { CHAIN_FALLBACK_COLOR }
