/** Minimal GraphQL POST with backoff. Shared by every source. */
export function makeClient(endpoint, label) {
  return async function gql(query, variables, attempt = 1) {
    const retry = (why) => {
      if (attempt >= 4) throw new Error(`${label}: ${why}`)
      const wait = 500 * 2 ** attempt
      console.warn(`    retry ${attempt} in ${wait}ms (${why})`)
      return new Promise((r) => setTimeout(r, wait)).then(() =>
        gql(query, variables, attempt + 1),
      )
    }

    let res
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      })
    } catch (err) {
      return retry(err.message)
    }
    if (!res.ok) return retry(`HTTP ${res.status}`)

    const json = await res.json()
    if (json.errors) throw new Error(`${label}: ${JSON.stringify(json.errors).slice(0, 300)}`)
    return json.data
  }
}

/** Upsert one day into an oldest-first history array. */
export function upsert(history, snap) {
  const i = history.findIndex((h) => h.date === snap.date)
  if (i === -1) {
    history.push(snap)
    history.sort((a, b) => a.date.localeCompare(b.date))
  } else {
    history[i] = { ...history[i], ...snap }
  }
}

export const usd = (v) => (v == null ? null : Math.round(Number(v)))

/** Fraction ("0.0329") to percent, 4dp. */
export const pct = (v) => (v == null ? null : Math.round(Number(v) * 100 * 10000) / 10000)

export const dayOf = (unixSeconds) =>
  new Date(unixSeconds * 1000).toISOString().slice(0, 10)

/**
 * Serialise a store with one daily row per line.
 *
 * Every collector run commits these stores, so their diffs are the project's
 * audit trail. Compact JSON puts the whole store on a single line, which makes
 * one appended day read as "the entire file changed"; `JSON.stringify(s, null, 1)`
 * gives every number its own line and costs 50% more bytes. A newline before
 * each row is legal JSON whitespace, costs under 1%, and makes an append look
 * like an append.
 *
 * This relies on `date` being the first key of a row — every source writes it
 * first and `upsert` preserves that order. Were it ever to change, the file
 * would simply go back to one line; the JSON stays valid either way.
 */
export function stringifyStore(store) {
  return JSON.stringify(store).replaceAll('{"date":', '\n{"date":') + '\n'
}
