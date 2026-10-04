# Weekly DeFi Report — Huma Radar

## Goal

A weekly report on (1) TVL movement across the protocols Huma Radar tracks, (2) stablecoin
supply by chain, (3) Huma, and (4) the wider DeFi and RWA news of the week — with the
emphasis on **where** growth or decline happened and **why**.

## How the work splits

| Part | Who does it | Why |
|---|---|---|
| Every number, flag, total and % | `npm run report` (in `huma-radar/`) | Deterministic, reproducible, self-checked. Never compute a figure by hand. |
| Why things moved | You, from sources | Judgement and evidence — the part a script can't do. |
| The report | You, in `reports/YYYY-MM-DD.md` | Copy the tables; write the prose around them. |

Configuration lives in `reports/config.json`: research sources, thresholds, the Huma
definition. Edit that file, not this prompt, to change what is tracked or flagged.

## Schedule and window

- Run **Mondays at 08:00 UTC**, Monday to Monday. Huma Radar's daily snapshot is at 12:00
  UTC, so an extra Monday 07:30 UTC collection (the Cloudflare cron) gives the report
  Monday's snapshot. The daily run later that day refreshes Monday on the site, so the next
  report's starting figures can differ slightly from this one's closing ones.
- Window = the report date's snapshot vs. the snapshot 7 days earlier (WoW), with the month
  (MoM, 30 days) for context. Windows are anchored to snapshot dates, not wall-clock time.
- **Reports chain end to end — no overlap, no gap.** If the previous report ended anything
  other than 7 days before this one (e.g. a report written a day early), start where it
  ended: `--start=<previous report's date>`. A window other than 7 days labels its change
  columns by length (`10D $`, `8D %`) instead of WoW — use that label in prose too.
- A report dated today uses today's intraday snapshot: DefiLlama keeps revising the current
  day until midnight UTC. Say so in the note under the report title.

## Step 1 — Numbers

1. `git pull` — the collector commits a snapshot daily, so the local copy goes stale.
2. `cd huma-radar && npm run report` (add `-- --date=YYYY-MM-DD` for a past Monday, and
   `--start=YYYY-MM-DD` for a window other than 7 days).
3. Read the self-checks at the end of `reports/data/<date>.tables.md`:
   - **FAIL** → stop. The numbers are wrong or incomplete; fix the cause before writing.
   - **WARN** → publishable, but explain it in one sentence where the affected figure
     appears (the report has no Data notes section).
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

**Keep it lean — the user's instruction.** Per source, in this order, and stop as soon as
the move is explained: (a) the numbers in the tables, (b) that source's posts in the X
digest, (c) that source's blog from the config — one look at the index, opening a post only
if its title fits the move. If none of them explains it, write *"No public explanation
found"* and move on. No web searches, governance forums, onchain or API digging, and no
research subagents, unless the user asks for a deeper look at a specific move. (The first
report in this format spent heavily on exactly that; don't repeat it.)

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
   - A supply cap at 100% explains a plateau; a cap raise explains the next leg — say so
     when the protocol's own posts mention one.
   - The trend (3+ weeks one direction) separates a trend from a one-off: it is in the
     venue tables, and in the "Flagged products" lines for products, whose table now shows
     a 30-day graph instead. Those lines also carry each product's chain split.
   - Tracked assets are USD stablecoins or yield-bearing USD tokens, so price explains
     almost nothing. Treat moves as flows unless a coin depegged — check its price only
     when a move has no flow explanation.
2. **X posts** — `npm run report` reads them through the official X API into
   `reports/data/<date>.x.md`: every flagged source with a handle, plus Huma every week,
   from 7 days before the window to the end of the snapshot day, replies and reposts
   excluded — and the **watch accounts** (`x.watch` in the config) from the window's start.
   Read that file first — some news is only ever posted on X. Cite a post by its
   `x.com/…/status/…` link. A number in a post is the account's own claim, not a verified
   figure: quote it only with that link on the same line. (The API is pay-per-post; the
   run is capped by `x.maxPostsPerRun` in the config, and a rerun of the same week reads
   from cache for free.) If the X self-check WARNs — no token, no credits, an account
   failed — say so in that source's paragraph and rely on its blog.
3. **Blog** from the config: posts published within the window or up to 7 days before. A
   blog that doesn't render for automated reading is skipped, not searched around. x.com
   pages themselves can't be opened (HTTP 402); the API above is the way in.
4. Look for: partnerships, new chains or markets, incentive or points programs, rate or
   parameter changes, integrations, exploits or pauses, token events.
5. **Evidence standard.** Link every claim to its source; summarise in your own words.
   Mark inference as inference: *"Possible cause: … (evidence: …)"*. If nothing explains a
   move, write *"No public explanation found"* — that is a valid finding.

## Step 4 — DeFi & RWA watch

The watch accounts are market commentary, read every week whatever the numbers did:

- **The DeFi Investor** (@TheDeFinvestor) — weekly watchlists ("Crypto Watchlist for the week
  ahead") and the latest DeFi developments.
- **Securitize** (@Securitize) — *Onchain Assets Weekly*, published as an X Article (the
  digest carries its full text), plus tokenization news posted as threads (kept together).

Use them twice. First as **leads** for Step 3: if one names a cause for a flagged move,
confirm it at the primary source (the protocol's own post, blog or forum) and cite that;
cite the commentary only when it is the only source, and say it is commentary. Then for the
**DeFi & RWA watch** section: 3–6 items from the window that matter to what Huma Radar
tracks — stablecoins, tokenized assets and RWAs, lending, the chains in the tables —
skipping price talk and token picks. Lead each with what happened, link the post, and tie
it to the tables where it connects (e.g. a tokenized fund's growth against BUIDL in the
Ethereum supply row). Figures from these posts are the account's claims: link on the same
line, as for any post.

## Step 5 — Stablecoin supply

From the tables: each chain's supply, WoW $ and %, 30d %, top 3 stablecoins with their WoW,
ranked by WoW $. Call out any chain marked ◆ (one coin drove at least half the gross
movement). The per-coin columns are live DefiLlama figures, a few hours newer than the
snapshot — if the drift WARN fired, say which coin moved after the snapshot.

## Step 6 — Huma

"Huma-related" means:
- **PST reserves** — DefiLlama's Huma TVL: the reserves backing PST and mPST, split by
  the chain they sit on — not where PST is held. A same-day move out of one chain and into
  another is Huma moving reserves, not new money; the "PST reserves by chain" table shows
  Solana and Ethereum only (smaller chains still count in its Net).
- **The Huma Related tab** — PST borrow markets and liquidity on Morpho, Fluid, Jupiter Lend,
  Kamino and Orca, plus Huma-curated vaults. Its total follows the site's own rules, so it
  matches what people see.
- **PST liquidity and borrow conditions** — Total PST Liquidity, PST supplied on Jupiter Lend
  and Morpho, and borrow APY and utilisation on the PST markets. A borrow-rate jump matters
  to anyone looping PST.

Explain where growth came from — chain, venue, market — and compare PST's growth with
stablecoin supply's: is Huma growing faster or slower than its market?

## Output — `reports/YYYY-MM-DD.md`

1. **TL;DR** — 5 lines max: biggest mover up, biggest mover down, fastest-growing chain for
   stablecoins, Huma headline, one notable partnership or launch.
2. **Stablecoin products** — the table as the script renders it, sorted by |WoW $|, ⚑ rows
   marked: TVL, WoW $ and %, MoM $ and %, APY and its change, and a 30-day **Trend** graph
   (on the site each opens a larger chart). No chain column. Ondo USDY and Hastra PRIME are
   left out (config `exclude`) — they have no TVL source.
3. **What drove the big moves?** — one short paragraph per research pass, products and
   venues alike, with links. It comes before the venue table, so name each venue with its
   chain ("Aave v3 on Ethereum") and give its figure, rather than pointing at a table below.
4. **Huma** — metrics table, where it moved, vs. its market, and notable market changes.
5. **DeFi & RWA watch** — 3–6 items from the watch accounts (Step 4).
6. **Lending venues** — protocol × chain table, and where the flagged groups moved. Orca is
   left out: an AMM pool, not a lending venue (it stays in Huma's PST liquidity).
7. **Stablecoin supply by chain** — table plus 2–3 sentences of takeaways.

No Data notes section — the user's instruction. A caveat a reader needs goes in one
sentence beside the figure it qualifies; the tables' own footnotes cover the rest.

## On the site

The **Weekly Report** tab picks up every `reports/<date>.md` together with its
`data/<date>.headline.json` and `data/<date>.series.json` (both written by `npm run report`)
— no code change. The page styles the markdown itself: signed figures turn green or red,
`⚑` becomes a badge, the TL;DR becomes the highlight card, and each products-table Trend
cell — a `[▁▃▅▇](#tvl-<id>)` link — becomes a graph that opens the product's chart. So
paste the tables unedited, keep the output structure above exactly, and open each TL;DR
line with `**Label:**`. Check it locally (`npm run dev`) before committing.

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
  - 30d is n/a for a venue with under 30 days of history; the note under the venue table
    names which, and since when.
- Publish only with every self-check at PASS or an explained WARN.
