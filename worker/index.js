/**
 * The site itself is static files, and Cloudflare serves those without this
 * script ever running. The script exists for the cron.
 *
 * GitHub's own `schedule:` trigger is best-effort on free runners: it queues
 * behind paid work, and in this repo it drifted two to three hours late every
 * day before dropping two days in a row with Actions reporting healthy. So the
 * clock moved here — Cloudflare Cron Triggers fire on time — and GitHub is left
 * to do the part it is good at, which is running the job and committing to
 * itself.
 */

const DISPATCH_EVENT = 'daily-collect'

export default {
  /**
   * Static assets are matched before this handler runs, so it only ever sees
   * paths the asset store had no file for. Handing those back to the binding
   * reproduces exactly what the site did when it was assets-only, including the
   * single-page-application fallback — the Worker adds a cron, not a behaviour.
   */
  async fetch(request, env) {
    return env.ASSETS.fetch(request)
  },

  async scheduled(controller, env) {
    // awaited rather than handed to ctx.waitUntil: the runtime then treats the
    // POST as the handler's own work, and anything thrown inside it lands in
    // the logs instead of disappearing into a floating promise
    await dispatch(env, controller)
  },
}

/**
 * Asks GitHub to run the collect workflow. Nothing is collected here: this is
 * one POST, and Actions does the work, keeping the collector in the one place
 * that can commit its output back to the repo.
 */
async function dispatch(env, controller) {
  if (!env.GITHUB_TOKEN) {
    // A deploy carries no secrets, so this is what a fresh Worker looks like
    // before the token is added. Say so plainly rather than failing obscurely.
    console.error('GITHUB_TOKEN is not set — add it as a Worker secret')
    return
  }

  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`
  console.log(`dispatching ${DISPATCH_EVENT} to ${url}`)

  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'content-type': 'application/json',
        // GitHub rejects API requests that do not identify themselves
        'user-agent': 'humaradar-cron',
        // deliberately no X-GitHub-Api-Version: pinning a version means this
        // breaks the day that version retires, and the contract relied on here
        // is a two-field body and a 204 — nothing a version could change
      },
      body: JSON.stringify({
        event_type: DISPATCH_EVENT,
        client_payload: {
          source: 'cloudflare-cron',
          cron: controller.cron,
          scheduledTime: new Date(controller.scheduledTime).toISOString(),
        },
      }),
    })
  } catch (err) {
    // DNS, TLS, a thrown binding — without this the request simply vanishes
    console.error(`dispatch threw before any response: ${err}`)
    return
  }

  // 204 No Content is the documented success. Anything else is worth the log
  // line, since a silent failure here looks identical to a stale site.
  if (res.status !== 204) {
    console.error(`dispatch failed: HTTP ${res.status} ${await res.text()}`)
    return
  }

  console.log(`dispatched ${DISPATCH_EVENT} to ${env.GITHUB_REPO}`)
}
