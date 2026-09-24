# Weekly DeFi Report — Huma Radar

## Goal

A weekly report on (1) TVL movement across the protocols Huma Radar tracks, (2) stablecoin
supply by chain, and (3) Huma — with the emphasis on **where** growth or decline happened
and **why**.

## How the work splits

| Part | Who does it | Why |
|---|---|---|
| Every number, flag, total and % | `npm run report` (in `huma-radar/`) | Deterministic, reproducible, self-checked. Never compute a figure by hand. |
| Why things moved | You, from sources | Judgement and evidence — the part a script can't do. |
| The report | You, in `reports/YYYY-MM-DD.md` | Copy the tables; write the prose around them. |

Configuration lives in `reports/config.json`: research sources, thresholds, the Huma
definition. Edit that file, not this prompt, to change what is tracked or flagged.

## Schedule and window

- Run **Fridays at or after 12:30 UTC**. Huma Radar snapshots at 12:00 UTC; running earlier
  races the snapshot.
- Window = the report date's snapshot vs. the snapshot 7 days earlier (WoW), with 30-day
  change for context. Windows are anchored to snapshot dates, not wall-clock time.

## Step 1 — Numbers

1. `git pull` — the collector commits a snapshot daily, so the local copy goes stale.
2. `cd huma-radar && npm run report` (add `-- --date=YYYY-MM-DD` for a past Friday).
3. Read the self-checks at the end of `reports/data/<date>.tables.md`:
   - **FAIL** → stop. The numbers are wrong or incomplete; fix the cause before writing.
   - **WARN** → publishable, but explain it in the Data notes section.
4. Every row must carry the report date. If the snapshot is missing, say so at the top
   rather than silently reporting an older week.

## Step 2 — What counts as significant

The script flags (⚑) products and venue groups where |WoW $| ≥ $25M, or where |WoW %| ≥ 5%
on something worth ≥ $10M that moved ≥ $5M. Individual markets are **not** flagged on their
own — they explain *where* inside a flagged group (the "Where the flagged groups moved"
list), plus any single market moving ≥ $25M, so an inflow and outflow that net out inside a
group can't hide.

## Step 3 — Why it moved (flagged items only)

Work from the **Research plan** in the tables file: one pass per source, covering every
flagged item that source owns.

1. **Start from the numbers — they often answer the question before any search.**
   - **◇ rows are lending pools: the figure is available liquidity (supplied − borrowed),
     not deposits.** A fall usually means more borrowing, not withdrawals — never describe
     it as an outflow. (First run: "Aave USDC −21%" had flat supply and rising borrows.)
   - **Biggest day.** A week's move arriving in one day (e.g. −$243.7M of −$240.5M) points
     to one depositor, migration or cap change. A move spread across the days points to
     demand. For reserves, check borrowed and utilisation too: supply falling while
     borrowing holds flat means a supplier left.
   - One market carrying most of a group's move (e.g. 86%) suggests a single large
     depositor, migration or incentive, not broad demand.
   - An APY change in the same week is a candidate cause for flows: yield up with inflows,
     yield down with outflows. Growth while APY *falls* means yield isn't the reason.
   - A supply cap at 100% explains a plateau; a cap raise in governance explains the next
     leg. Check governance forums when a reserve stops dead at a round number.
   - The trend column separates a trend (3+ weeks one direction) from a one-off.
   - Tracked assets are USD stablecoins or yield-bearing USD tokens, so price explains
     almost nothing. Treat moves as flows unless a coin depegged — check its price only
     when a move has no flow explanation.
2. **X posts** — `npm run report` reads them through the official X API into
   `reports/data/<date>.x.md`: every flagged source with a handle, plus Huma every week,
   from 7 days before the window to the end of the snapshot day, replies and reposts
   excluded. Read that file first — some news is only ever posted on X. Cite a post by its
   `x.com/…/status/…` link. A number in a post is the account's own claim, not a verified
   figure: quote it only with that link on the same line. (The API is pay-per-post; the
   run is capped by `x.maxPostsPerRun` in the config, and a rerun of the same week reads
   from cache for free.) If the X self-check WARNs — no token, no credits, an account
   failed — fall back to web search for that source and say so in Data notes.
3. **Blog / RSS** from the config: posts published within the window or up to 7 days
   before. Then web search — `"{name}" {specific topic}` — news coverage, and governance
   forums for parameter changes (e.g. governance.aave.com, forum.morpho.org). x.com pages
   themselves can't be opened (HTTP 402); the API above is the way in.
4. Look for: partnerships, new chains or markets, incentive or points programs, rate or
   parameter changes, integrations, exploits or pauses, token events.
5. **Evidence standard.** Link every claim to its source; summarise in your own words.
   Mark inference as inference: *"Possible cause: … (evidence: …)"*. If nothing explains a
   move, write *"No public explanation found"* — that is a valid finding.

## Step 4 — Stablecoin supply

From the tables: each chain's supply, WoW $ and %, 30d %, top 3 stablecoins with their WoW,
ranked by WoW $. Call out any chain marked ◆ (one coin drove at least half the gross
movement). The per-coin columns are live DefiLlama figures, a few hours newer than the
snapshot — if the drift WARN fired, say which coin moved after the snapshot.

## Step 5 — Huma

"Huma-related" means:
- **PST supply** — DefiLlama's Huma protocol TVL, split by chain.
- **The Huma Related tab** — PST borrow markets and liquidity on Morpho, Fluid, Jupiter Lend,
  Kamino and Orca, plus Huma-curated vaults. Its total follows the site's own rules, so it
  matches what people see.
- **PST liquidity and borrow conditions** — Total PST Liquidity, PST supplied on Jupiter Lend
  and Morpho, and borrow APY and utilisation on the PST markets. A borrow-rate jump matters
  to anyone looping PST.

Explain where growth came from — chain, venue, market — and compare it with stablecoin
supply growth on the same chains: is Huma growing faster or slower than its market?

## Output — `reports/YYYY-MM-DD.md`

1. **TL;DR** — 5 lines max: biggest mover up, biggest mover down, fastest-growing chain for
   stablecoins, Huma headline, one notable partnership or launch.
2. **Stablecoin products** — table, sorted by |WoW $|, ⚑ rows marked.
3. **Lending venues** — protocol × chain table, and where the flagged groups moved.
4. **What drove the big moves** — one short paragraph per research pass, with links.
5. **Stablecoin supply by chain** — table plus 2–3 sentences of takeaways.
6. **Huma** — metrics table, where it moved, vs. its market, and notable market changes.
7. **Data notes** — coverage limits, WARNs, sources that failed, anything withheld.

## On the site

The **Weekly Report** tab picks up every `reports/<date>.md` together with its
`data/<date>.headline.json` (which `npm run report` writes) — no code change. The page
styles the markdown itself: signed figures turn green or red, `⚑` becomes a badge, the
TL;DR becomes the highlight card. So keep the output structure above exactly, and open
each TL;DR line with `**Label:**`. Check it locally (`npm run dev`) before committing.

## Before publishing

`npm run report:check` — it extracts every $, % and pp figure from the report's prose and
fails on any that is neither in the tables nor on a line with a source link. On its first
run it caught two hand-derived figures ("about $2M", "around 90%"). Then reread the prose
for reasoning the check can't see: does each "because" actually follow from its evidence?

## Rules

- **Numbers come only from `reports/data/<date>.tables.md`.** Copy them as rendered; don't
  round differently and don't derive new ones in prose — `report:check` enforces this. If
  a sentence needs a figure the tables lack, add it to the script. Outside figures (a cap
  change, a vault's deposits) are fine with a link on the same line.
- A URL for every qualitative claim.
- State coverage limits wherever a figure could be misread:
  - Lending-venue figures are **tracked markets only**, not protocol-wide TVL.
  - Protocol-sourced products are protocol-wide TVL, not the ticker alone.
  - 30d is n/a for Aave, Fluid, Jupiter Lend, Kamino and Orca until those histories are 30
    days old; the collector began recording them on 2026-08-30.
- Publish only with every self-check at PASS or an explained WARN.
