/**
 * Posts from the X accounts a weekly report needs, via the official X API.
 *
 * Some protocol news is only ever posted on X, never on a blog, and x.com
 * cannot be read without an account. The API is pay-per-use — every post it
 * returns is billed — so everything here is shaped around spending little:
 *
 *   - only the accounts the week needs (the caller decides which);
 *   - a per-account and a per-run cap, checked before every request;
 *   - user ids cached across runs, and a week's posts cached so a rerun of
 *     the same report reads nothing twice.
 *
 * The token is the user's own, from $X_BEARER_TOKEN or reports/x-token.local
 * (gitignored). It is never logged, and never reaches the site.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

// overridable so the client can be tested against a local stand-in
const API = process.env.X_API_BASE ?? 'https://api.x.com/2'

export function readXToken(tokenFile) {
  if (process.env.X_BEARER_TOKEN?.trim()) return process.env.X_BEARER_TOKEN.trim()
  if (!existsSync(tokenFile)) return null
  // the file carries a comment explaining itself; the token is the first other line
  const line = readFileSync(tokenFile, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'))
  return line || null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class XError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function get(path, params, token, attempt = 1) {
  const res = await fetch(`${API}${path}?${new URLSearchParams(params)}`, {
    headers: { authorization: `Bearer ${token}`, 'user-agent': 'huma-radar-report' },
  })
  if (res.status === 429 && attempt < 3) {
    // wait for the window X names, but never stall a scheduled run for long
    const reset = Number(res.headers.get('x-rate-limit-reset'))
    const wait = reset ? reset * 1000 - Date.now() + 1000 : 15_000 * attempt
    if (wait > 5 * 60_000) throw new XError(429, 'rate limited for more than five minutes')
    await sleep(Math.max(1000, wait))
    return get(path, params, token, attempt + 1)
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const why = body.detail ?? body.title ?? body.errors?.[0]?.message ?? JSON.stringify(body).slice(0, 200)
    throw new XError(res.status, `HTTP ${res.status}: ${why}`)
  }
  return body
}

/**
 * X's current specification names the parameter `post.fields` and the long-
 * post field `note_post`; the long-standing v2 names are `tweet.fields` and
 * `note_tweet`. Try the current names, fall back once on a 400, and remember
 * which worked. A rejected request returns no posts, so it costs nothing.
 *
 * `article` carries an X Article's title and full plain text — Securitize
 * publishes Onchain Assets Weekly that way, and the post itself is only a
 * t.co link. The conversation fields let a thread be put back together.
 */
const COMMON = 'created_at,public_metrics,article,conversation_id,in_reply_to_user_id'
const FIELDS = {
  post: { 'post.fields': `${COMMON},note_post` },
  tweet: { 'tweet.fields': `${COMMON},note_tweet` },
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}

/**
 * @param accounts  [{ handle, name, why, start?, maxPosts?, threads? }] — the
 *                  accounts to read. `start` narrows the window for that account,
 *                  `maxPosts` replaces the per-account cap, and `threads` reads
 *                  the account's replies too, keeping only those to itself: an
 *                  account that posts its news as a thread says it in the replies.
 * @param window    { start, end } ISO timestamps
 * @param limits    { maxPostsPerAccount, maxPostsPerRun, costPerPostUsd }
 * @param cachePath this week's saved posts, reused unless `refresh`
 * @param usersPath handle -> id cache shared across weeks
 */
export async function fetchXPosts({ accounts, window, token, limits, cachePath, usersPath, refresh = false }) {
  const notes = []
  const cached = refresh ? null : readJson(cachePath, null)
  const reuse = new Map(
    (cached?.window?.start === window.start ? cached.accounts : [])
      .filter((a) => !a.error)
      .map((a) => [a.handle.toLowerCase(), a]),
  )

  let postsRead = 0
  let usersRead = 0
  let fields = cached?.fields ?? null
  const out = []

  const todo = accounts.filter((a) => !reuse.has(a.handle.toLowerCase()))
  for (const a of accounts) {
    const hit = reuse.get(a.handle.toLowerCase())
    if (hit) out.push({ ...hit, why: a.why, cached: true })
  }

  if (todo.length && !token) {
    notes.push('X token not configured (reports/x-token.local) — X posts were not read; research falls back to web search')
    for (const a of todo) out.push({ ...a, posts: [], error: 'no token' })
    return { window, fields, accounts: out, postsRead, usersRead, estCostUsd: 0, notes }
  }

  // ids first, one request for every handle not yet cached
  const users = readJson(usersPath, {})
  const unknown = todo.map((a) => a.handle).filter((h) => !users[h.toLowerCase()])
  if (unknown.length) {
    try {
      const r = await get('/users/by', { usernames: unknown.join(',') }, token)
      for (const u of r.data ?? []) users[u.username.toLowerCase()] = { id: u.id, username: u.username, name: u.name }
      for (const e of r.errors ?? []) notes.push(`X: could not resolve @${e.value ?? e.resource_id ?? '?'} — ${e.detail ?? e.title}`)
      usersRead += (r.data ?? []).length
      writeFileSync(usersPath, JSON.stringify(users, null, 1) + '\n')
    } catch (err) {
      notes.push(`X user lookup failed (${err.message}) — X posts were not read`)
      for (const a of todo) out.push({ ...a, posts: [], error: err.message })
      return { window, fields, accounts: out, postsRead, usersRead, estCostUsd: 0, notes }
    }
  }

  for (const a of todo) {
    const user = users[a.handle.toLowerCase()]
    if (!user) {
      out.push({ ...a, posts: [], error: 'handle not found' })
      continue
    }
    const posts = []
    const cap = a.maxPosts ?? limits.maxPostsPerAccount
    let next = null
    let truncated = false
    try {
      while (true) {
        const room = Math.min(cap - posts.length, limits.maxPostsPerRun - postsRead)
        if (room <= 0) {
          truncated = true
          break
        }
        const params = {
          start_time: a.start ?? window.start,
          end_time: window.end,
          // X will not return fewer than 5 per page, so a cap can overshoot by up to 4
          max_results: String(Math.max(5, Math.min(100, room))),
          // replies to other people are billed and then dropped below, so only
          // an account that threads its news pays for them
          exclude: a.threads ? 'retweets' : 'replies,retweets',
          ...(next ? { pagination_token: next } : {}),
        }
        let body
        for (const mode of fields ? [fields] : ['post', 'tweet']) {
          try {
            body = await get(`/users/${user.id}/tweets`, { ...params, ...FIELDS[mode] }, token)
            fields = mode
            break
          } catch (err) {
            if (err.status === 400 && !fields && mode === 'post') continue
            throw err
          }
        }
        const page = body.data ?? []
        postsRead += page.length
        posts.push(...page)
        next = body.meta?.next_token ?? null
        if (!next) break
      }
      // with replies read, keep the account's own thread and drop its replies to others
      const own = posts.filter((p) => !p.in_reply_to_user_id || p.in_reply_to_user_id === user.id)
      out.push({
        ...a,
        id: user.id,
        username: user.username,
        truncated,
        repliesDropped: posts.length - own.length,
        posts: own.map((p) => ({
          id: p.id,
          url: `https://x.com/${user.username}/status/${p.id}`,
          created_at: p.created_at,
          text: p.note_post?.text ?? p.note_tweet?.text ?? p.text,
          // a later post of the account's own thread points at the thread's first post
          thread: p.conversation_id && p.conversation_id !== p.id ? p.conversation_id : null,
          article: p.article
            ? {
                title: p.article.title?.trim() || null,
                preview: p.article.preview_text ?? null,
                text: p.article.plain_text ?? null,
                links: (p.article.entities?.urls ?? []).map((u) => u.text).filter(Boolean),
              }
            : null,
          likes: p.public_metrics?.like_count ?? null,
          reposts: p.public_metrics?.retweet_count ?? p.public_metrics?.repost_count ?? null,
        })),
      })
      if (truncated) notes.push(`X: @${user.username} capped at ${posts.length} posts — older ones in the window were not read`)
    } catch (err) {
      out.push({ ...a, id: user.id, username: user.username, posts, error: err.message })
      notes.push(`X: @${user.username} failed — ${err.message}`)
      // out of credits or a bad token fails every later account the same way
      if (err.status === 401 || err.status === 402 || err.status === 403) break
    }
  }

  // accounts never reached after a fatal error
  for (const a of todo) {
    if (!out.some((o) => o.handle.toLowerCase() === a.handle.toLowerCase())) out.push({ ...a, posts: [], error: 'skipped after an earlier failure' })
  }

  const order = new Map(accounts.map((a, i) => [a.handle.toLowerCase(), i]))
  out.sort((x, y) => order.get(x.handle.toLowerCase()) - order.get(y.handle.toLowerCase()))

  const result = {
    window,
    fields,
    fetchedAt: new Date().toISOString(),
    accounts: out,
    postsRead,
    usersRead,
    estCostUsd: postsRead * limits.costPerPostUsd,
    notes,
  }
  writeFileSync(cachePath, JSON.stringify(result, null, 1) + '\n')
  return result
}

const oneLine = (s, max) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

function postLine(p, indent = '') {
  const meta = `**${p.created_at.slice(0, 10)}** · ♥ ${p.likes ?? '—'} · ↻ ${p.reposts ?? '—'}`
  if (!p.article) return [`${indent}- ${meta} — ${oneLine(p.text, 1500)} [post](${p.url})`]
  // an Article's post text is only a t.co link; its substance is the article
  const out = [`${indent}- ${meta} — **Article: ${p.article.title ?? 'untitled'}** [post](${p.url})`]
  if (p.article.text) {
    // one paragraph per line, so a section heading or list item stays readable
    const paras = p.article.text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
    let used = 0
    for (const para of paras) {
      if (used > 8000) {
        out.push(`${indent}  > …`)
        break
      }
      out.push(`${indent}  > ${para}`)
      used += para.length
    }
  } else if (p.article.preview) {
    out.push(`${indent}  > ${oneLine(p.article.preview, 600)}`)
  }
  if (p.article.links.length) out.push(`${indent}  - links: ${p.article.links.join(' · ')}`)
  return out
}

/** The research digest: every post, newest first, with its link; threads kept together. */
export function renderXDigest(x, end) {
  const lines = [`# X posts — report to ${end}`, '']
  const fetched = x.accounts.filter((a) => !a.error)
  const total = fetched.reduce((n, a) => n + a.posts.length, 0)
  lines.push(
    `Window: ${x.window.start} → ${x.window.end} · ${total} posts from ${fetched.length} account${fetched.length === 1 ? '' : 's'}` +
      ` · read this run: ${x.postsRead} (est. $${x.estCostUsd.toFixed(2)})`,
  )
  lines.push('')
  lines.push('Accounts read because a move was flagged, the always-read ones, and the watch accounts (from the window\'s start). Replies to others and reposts excluded.')
  lines.push("Figures in posts are the account's own claims: cite the post link on the same line when using one.")
  lines.push('')
  for (const a of x.accounts) {
    lines.push(`## ${a.name} (@${a.username ?? a.handle}) — ${a.why}${a.about ? ` · ${a.about}` : ''}${a.cached ? ' · cached' : ''}`)
    lines.push('')
    if (a.error) {
      lines.push(`_Not read: ${a.error}._`, '')
      continue
    }
    if (!a.posts.length) {
      lines.push('_No posts in the window._', '')
      continue
    }
    const byId = new Map(a.posts.map((p) => [p.id, p]))
    const children = new Map()
    for (const p of a.posts) {
      if (p.thread && byId.has(p.thread)) (children.get(p.thread) ?? children.set(p.thread, []).get(p.thread)).push(p)
    }
    const tops = a.posts.filter((p) => !p.thread || !byId.has(p.thread))
    for (const p of tops.sort((m, n) => n.created_at.localeCompare(m.created_at))) {
      lines.push(...postLine(p))
      if (p.thread) lines.push('  - _continues a thread that started before the window_')
      const kids = (children.get(p.id) ?? []).sort((m, n) => m.created_at.localeCompare(n.created_at) || m.id.localeCompare(n.id))
      for (const k of kids) lines.push(...postLine(k, '  '))
    }
    if (a.truncated) lines.push(`- _…capped; older posts in the window were not read._`)
    lines.push('')
  }
  if (x.notes.length) {
    lines.push('## Notes', '')
    for (const n of x.notes) lines.push(`- ${n}`)
    lines.push('')
  }
  return lines.join('\n')
}
