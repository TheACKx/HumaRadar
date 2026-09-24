/**
 * Every figure in the report must come from the tables file.
 *
 *   npm run report:check                        the latest report
 *   npm run report:check -- --date=2026-09-23
 *
 * Pulls each dollar amount, percentage and percentage-point change out of
 * reports/<date>.md and looks for it in reports/data/<date>.tables.md. The
 * prompt forbids deriving numbers in prose, and this is what enforces it: a
 * figure found nowhere in the tables was either mistyped, computed by hand, or
 * quoted from an outside source — the last is allowed, but only with a link on
 * the same line, which this checks too.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPORTS = resolve(HERE, '../../reports')

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  }),
)

const date = args.date ??
  readdirSync(REPORTS).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().at(-1)?.slice(0, 10)
if (!date) throw new Error('no report found in reports/')

const report = readFileSync(resolve(REPORTS, `${date}.md`), 'utf8')
const tables = readFileSync(resolve(REPORTS, `data/${date}.tables.md`), 'utf8')

// the typographic minus the tables use, and the ASCII one prose might slip in
const norm = (s) => s.replace(/−/g, '-')
const FIGURE = /[+\-−]?\$\d[\d,.]*[KMB]?|[+\-−]?\d[\d,.]*(?:%|pp)/g

const known = new Set()
for (const m of norm(tables).matchAll(FIGURE)) {
  known.add(m[0])
  known.add(m[0].replace(/^[+-]/, '')) // prose may drop the sign: "fell $X"
}

const unmatched = []
let checked = 0
for (const [i, line] of report.split('\n').entries()) {
  // tables are pasted verbatim, so checking their cells would only compare the
  // file with itself; the prose is where hand-derived numbers creep in
  if (line.trimStart().startsWith('|')) continue
  for (const m of norm(line).matchAll(FIGURE)) {
    checked++
    const tok = m[0]
    if (known.has(tok) || known.has(tok.replace(/^[+-]/, ''))) continue
    unmatched.push({ line: i + 1, tok, cited: /\]\(https?:\/\//.test(line), text: line.trim().slice(0, 110) })
  }
}

const uncited = unmatched.filter((u) => !u.cited)
console.log(`${date}: ${checked} figures in prose, ${checked - unmatched.length} found in the tables`)
for (const u of unmatched) {
  console.log(`  ${u.cited ? 'cited  ' : 'MISSING'}  line ${u.line}: ${u.tok}  — ${u.text}`)
}
if (uncited.length) {
  console.log(`\n${uncited.length} figure(s) neither in the tables nor on a cited line — fix or source them.`)
  process.exitCode = 1
} else {
  console.log('\nEvery figure is from the tables or on a line with a source link.')
}
