# Huma Radar

Premium DeFi yield & TVL analytics. Tracks Aave v3 reserves, Morpho vaults and
markets, Fluid borrow vaults, Jupiter Lend vaults and Kamino reserves across
eight chains plus five curated overlays — Huma, Maple, Ethena, Re and USDai
Related — with daily snapshots powering 7D / 30D change columns and historical
charts. Two overview tabs sit one level above all of that: **Stablecoin Supply
Overlook**, total stablecoin market cap network-wide and across eleven chains,
and **Stablecoin Protocols: TVL & Yield**, what 21 issuers pay on their own
coins.

**Status: Step 8 — 85 listings (31 Aave reserves + 18 Morpho vaults + 13 Morpho
markets + 1 Morpho markets total + 6 Fluid + 9 Jupiter Lend + 5 Kamino +
1 Orca pool + 1 cross-protocol total), 77 distinct venues.**

```bash
cd huma-radar
npm install
npm run collect   # pull today's snapshot
npm run dev       # http://localhost:5173
```

## Data sources

All five are the protocols' own APIs — the ones their apps read — so numbers
match `app.aave.com`, `app.morpho.org`, `fluid.io`, `jup.ag` and `kamino.com`
exactly. Free, no API keys.

| Source | Endpoint | History it publishes |
| --- | --- | --- |
| Aave v3 | `api.v3.aave.com/graphql` | supply + borrow APY, 365 days |
| Morpho vaults | `api.morpho.org/graphql` | **TVL and net APY**, back to vault creation |
| Morpho markets | `api.morpho.org/graphql` | **everything** — supplied, borrowed, liquidity, both APYs, utilization |
| Fluid vaults | `api.fluid.instadapp.io/v2/<chain>/vaults/<id>` | none — current state only |
| Fluid liquidity layer | `api.fluid.io/<chain>/liquidity/tokens` | none — current state only |
| Jupiter Lend vaults | `api.solana.fluid.io/v2/<deployment>/borrowing/vaults` | none — current state only |
| Jupiter Lend liquidity layer | `api.solana.fluid.io/v1/<deployment>/liquidity/tokens` | none — current state only |
| Kamino | `api.kamino.finance/kamino-market/<market>/reserves/metrics` | none — current state only |
| Orca | `api.orca.so/v2/solana/pools/<address>` | none — current state, plus 24h/7d/30d fee stats |
| DefiLlama stablecoins | `stablecoins.llama.fi/stablecoincharts/<chain>` | **full daily supply history**, per chain and network-wide |
| DefiLlama yields | `yields.llama.fi/chart/<pool>` | **full daily TVL and APY**, one product per pool |
| DefiLlama protocols | `api.llama.fi/protocol/<slug>` | **full daily TVL**, protocol-wide, no yield |

Two of those need explaining. Fluid's **liquidity layer** is a separate host and
path shape from its vaults — no `/v2` — and reports one row per token: everything
supplied into Fluid for that asset, across every vault drawing on it. And
**Jupiter Lend runs on Fluid's Solana deployment**, so both its vaults and its
per-token totals come from `api.solana.fluid.io` — the endpoints jup.ag itself
reads. The flat list at `lite-api.jup.ag/lend/v1/borrow/vaults` is simpler but
stops at the plain vaults and never lists the smart ones, so it is not used.
The liquidity layer is a truer source than summing vaults: it also covers a
token sitting on the layer without yet backing a borrow vault, which a vault
roll-up cannot see at all. Where both are visible they agree — PST's 66,893,033
on the layer is the five tracked vaults' collateral to the unit.

Rejected **for the lending markets**: DefiLlama covers every chain and is
simpler, but `/poolsBorrow` and `/chartLendBorrow` moved behind a paid plan, and
its free `tvlUsd` is *available liquidity* (supplied − borrowed) rather than
total supplied. Its **stablecoin**, **yields** and **protocol** endpoints are a
different story — still free, still complete, and the only practical source for
chain-level supply or for a cross-issuer yield comparison — so the two overview
tabs read them directly.

### What is and isn't backfillable

| Metric | Aave | Morpho vault | Morpho market | Fluid / JupLend / Kamino |
| --- | --- | --- | --- | --- |
| APY | 365 days backfilled | full history | full history | **from first run** |
| TVL / supplied | **from first run** | full history | full history | **from first run** |
| Borrowed, utilization | **from first run** | n/a | full history | **from first run** |

So **Morpho changes are exact today**, for vaults and markets alike. Aave's APY
changes are exact; its TVL 7D fills in after a week and 30D after a month.
Fluid, Jupiter Lend and Kamino expose only current state, so their whole record
builds from the first collector run. Until then those cells render `—` rather than a
misleading `0.00%`.

Where a chain mixes sources, the header "Total TVL" 7D/30D is computed only over
markets that have both endpoints, and is marked with a `*` whose tooltip says
how many markets and how much USD the number actually covers — so a partial
move is never presented as if the whole chain TVL had shifted.

## Stablecoin Supply Overlook

The first tab in the sidebar, and where the app opens. It answers a question the
network tabs cannot: how much stablecoin exists on a chain at all, before any of
it reaches a lending venue.

| | |
| --- | --- |
| Headline | total market cap across every chain DefiLlama indexes, with weekly and monthly change |
| Table | one row per tracked chain — total value, weekly change, monthly change, share, sparkline, Graph |
| Graph | market cap over 7D / 30D / 90D / 1Y, a daily history table with day-over-day moves, and CSV export |

Eleven series are collected: the network total plus Ethereum, Solana, Base,
XRPL, Plasma, Robinhood Chain, Monad, BSC, Tempo and Stellar. Add one by
appending to `STABLECOINS` in `scripts/tracked.mjs` — `slug` is the chain name
the API expects in the path, which is not the lowercase name in DefiLlama's page
URLs (the page `/stablecoins/robinhood-chain` is served by
`/stablecoincharts/Robinhood%20Chain`).

Two things to keep straight about the numbers:

- **This is market cap, not TVL.** It counts stablecoins issued and circulating
  on a chain whether or not they are deposited anywhere. It is the ceiling the
  network tabs draw from, not a total of them, and the two will never reconcile.
- **Every peg counts.** A day sums all of `totalCirculatingUSD` — the dollar
  pegs plus the euro, yen, ruble and the rest, each already converted to USD.
  That matches the headline on DefiLlama's own pages; reading `peggedUSD` alone
  would quietly drop about $1.6B network-wide.

Unlike every other source here, this one does not accumulate. DefiLlama
publishes the whole daily history, so each run replaces the stored series with
what the API returns, trimmed to the last 400 days, into its own store at
`src/data/stablecoins.json`. Nothing to backfill, and a chain that fails on a
given run keeps the series it already had.

```bash
npm run collect -- --only=stablecoins
```

## Stablecoin Protocols: TVL & Yield

The second tab. Where the network tabs ask what a *lending venue* pays to hold a
stablecoin, this asks what the *issuer* pays on its own coin, and how much sits
behind it.

| Column | |
| --- | --- |
| Protocol, Ticker | the issuer and the coin, e.g. Maple / syrupUSDC |
| Yield, 7D, 30D | current APY and its move, in percentage points or relative percent — same toggle as the market tables |
| TVL, 7D, 30D | total value and its relative move |
| Graph | TVL and yield charts over 7D / 30D / 90D / 1Y, a daily history table, and CSV export |

Twenty-one products are tracked, listed in `STABLECOIN_PROTOCOLS` in
`scripts/tracked.mjs`. Each entry names one of two DefiLlama shapes, and the
distinction matters when reading the TVL column:

- **`pool`** — a yields pool id. Its chart carries TVL and APY for that one
  product, exactly as `/yields/pool/<id>` shows them. Thirteen entries.
- **`protocol`** — a protocol slug. Its chart carries **protocol-wide TVL**, so
  Ondo's figure covers OUSG as well as USDY, precisely as the linked page
  reports it; those rows are marked *protocol-wide* in the table. The yield is
  the median across that project's pools for the ticker, which is what the
  page's "median APY" toggle draws. Eight entries.

Pools for a `protocol` entry are resolved against `yields.llama.fi/pools` at
collect time rather than pinned by id, so a project adding a chain is picked up
without an edit. Two things that follow from the sources:

- **Huma carries TVL but no yield.** DefiLlama indexes `huma-finance-v2` but
  publishes no yields pool for it, so the rate is genuinely absent rather than
  zero. Its cell reads `—` with a tooltip saying why.
- **Ethena's yield is sUSDe's.** USDe itself pays nothing; the staked rate is
  what its protocol page's median APY reports, and what this tab shows.

A full run is a few dozen requests — one per pool a median is taken across — so
they are spaced and a 429 backs off harder than an ordinary failure. Like the
supply overlook it replaces rather than appends, into
`src/data/stableprotocols.json`.

```bash
npm run collect -- --only=stableprotocols
```

## Tracked markets

Configured in [`scripts/tracked.mjs`](huma-radar/scripts/tracked.mjs).

**Aave v3 reserves**

| Chain | Market | Reserves |
| --- | --- | --- |
| Ethereum | Core | USDT, USDC, USDe, sUSDe\*, syrupUSDT\* |
| Plasma | Plasma | USDT0, USDe, GHO |
| Monad | Monad | USDC, USDe, USDT0, GHO, AUSD |
| Base | Base | USDC, syrupUSDC\* |
| Arbitrum | Arbitrum | USDC (native), USDT0 |
| Mantle | Mantle | USDT0 |

\* supply-only collateral — borrowing disabled, so borrow columns read `—`.

Arbitrum lists USDT0 under Tether's glyph (`USD₮0`), renamed for display; it also
has two reserves symboled `USDC` (native and bridged USDC.e), so the native
address is pinned explicitly.

**Morpho vaults** — all currently Vault V2; the collector detects V1 vs V2.

| Chain | Vaults |
| --- | --- |
| Ethereum | Paypal USD Main, Sentora RLUSD Main, Sentora Prime Main, Sentora Huma PST Main, Wintermute USDC Select, 3F x Steakhouse USDC, Galaxy USDC Enhanced, Bitwise Premium RWA AUSD |
| Monad | Hyperithm USDC Apex, August USDC V2 |
| Base | Steakhouse High Yield USDC Edition, Gauntlet USDC Frontier |
| Robinhood | Steakhouse USDG |
| Tempo | Sentora pathUSD |

### Huma Related

An **overlay, not a chain**: every entry is either a PST (PayFi Strategy Token)
borrow venue or a Huma-curated vault, gathered from three protocols across two
networks.

| Protocol | Listing | What is collected |
| --- | --- | --- |
| Morpho Blue | PST / USDC, PST / PYUSD, PST / AUSD | borrow rate, supplied, borrowed, available liquidity |
| Morpho vault | RockawayX USDC Yield, Huma USDC Main, Sentora Huma PST Main†, Galaxy USDC Enhanced† | TVL, net APY |
| Fluid | #165 PST/USDC, #166 PST/USDT, #169 PST-USDC/USDC-USDT | borrow rate, supplied, borrowed |
| Jupiter Lend | #61 PST/JupUSD, #45 PST/USDC · smart: #91 PST/JupUSD-USDC, #96 PST/USDC-USDT, #93 PST-USDC/JupUSD | borrow rate, supplied, borrowed |
| Orca | PST / USDC Whirlpool | pool TVL, annualised trading-fee yield |
| Combined | Total PST Liquidity | Fluid #169 + Jupiter #93 + the Orca pool |
| Morpho markets total | PST across the three Blue markets | combined market TVL |
| Fluid liquidity layer | PST | total supplied |
| Jupiter Lend liquidity layer | PST | total supplied |
| Kamino | PST reserve · USDC reserve (same market) | supplied TVL; the USDC side adds borrowed, both rates and utilization |

† also listed under Ethereum. Cross-listing is deliberate — the overlay is a
lens, not a partition — and each copy gets a distinct id. The sidebar's global
"Markets tracked" and "Aggregate TVL" dedupe on protocol + chain + venue +
asset, so a cross-listed venue is counted once.

Jupiter Lend and Kamino run on Solana, which has no EVM chain id; `101` is used
as the conventional stand-in so ids stay unique.

Jupiter Lend also runs **more than one deployment**. The default `main` list
does not contain the others, and vault ids repeat between them, so an entry
names its market (`ethena`) and that market becomes part of the stored id.

Its vaults come in four shapes, and a **smart** one pairs a token with a DEX
pair on one side — `#91 PST / JupUSD-USDC` borrows a JupUSD-USDC pair against
plain PST, `#93 PST-USDC / JupUSD` posts a PST-USDC pair as collateral. On a
smart side the stored totals are share counts and each leg's amount comes from
the pair's per-share figures. The collector reads each vault's `type` rather
than being told which shape to expect.

### Maple Related

The second overlay: wherever a Maple syrup token (syrupUSDC / syrupUSDT /
syrupUSDG) is supplied or posted as collateral, across four protocols and three
networks.

| Protocol | Listing | What is collected |
| --- | --- | --- |
| Aave v3 | syrupUSDT on Ethereum†, Plasma, Mantle · syrupUSDC on Monad, Base† | supplied TVL |
| Morpho Blue | syrupUSDC / PYUSD, / RLUSD, / AUSD (Ethereum) · syrupUSDG / USDG (Robinhood) | supplied, borrowed, available, borrow rate |
| Kamino | syrupUSDC reserve | supplied TVL |
| Jupiter Lend | syrupUSDC | supplied TVL, rolled up across every vault taking the mint |

† also listed under its own chain, and deduped in the global totals.

Every Aave syrup reserve is **supply-only collateral** — borrowing is disabled
and Aave pays no supply APY on them, so their APY reads `0.00%` and the borrow
columns read `—`. The yield lives inside the syrup token, not in the venue
listing it, which is why the tab's TVL-weighted "Avg APY" sits near 1%: it is
the average across venues, not the return on holding syrup.

Three of the four Morpho market links given for this tab pointed at the same
`rlusd-syrupusdc` market, so PYUSD and USDG were recovered by sweeping every
Morpho market for syrup collateral. USDG turned out to be on Robinhood Chain
rather than Ethereum. Morpho also carries a long tail of empty duplicate
markets under the same asset pairs; the ids configured here are the ones
holding size.

### Ethena Related

The third overlay: wherever USDe or its staked form sUSDe is supplied or posted
as collateral, across four protocols and four networks.

| Protocol | Listing | What is collected |
| --- | --- | --- |
| Aave v3 | USDe† and sUSDe† on Ethereum Core, Plasma, Monad, Mantle | supplied TVL, and borrow side where USDe is borrowable |
| Morpho Blue | USDe / USDC (Base) · USDe / USDG (Robinhood) · sUSDe / PYUSD (Ethereum) | supplied, borrowed, available, borrow rate |
| Kamino | USDe reserve | supplied TVL |
| Jupiter Lend | USDe, on the `ethena` deployment | supplied TVL |

† four of the eight Aave rows are also listed under their own chains, and
deduped in the global totals.

USDe is borrowable on Aave, so those rows carry a real borrow side. **sUSDe is
supply-only collateral everywhere it is listed**, so its borrow columns read `—`
and Aave pays it no supply APY — the yield is inside the staked token.

Only Aave's **Ethereum Core** market is tracked. Its Lido market also lists
sUSDe, at a fraction of the size; including both would double-count.

### Re Related

The fourth overlay: wherever Re Protocol's reUSD is supplied or posted as
collateral.

| Protocol | Listing | What is collected |
| --- | --- | --- |
| Morpho Blue | reUSD / USDC, reUSD / USDT (Ethereum) | supplied, borrowed, available, borrow rate |
| Fluid liquidity layer | reUSD | total supplied |
| Kamino | reUSD reserve | supplied TVL |
| Jupiter Lend liquidity layer | reUSD | total supplied |

reUSD is collateral-only on all three liquidity layers that hold it, so those
rows carry a supplied total and no borrow side. Only the Morpho markets have a
real one.

### USDai Related

The fifth overlay: wherever USDai's staked form sUSDai is supplied or posted as
collateral. Both venues are on **Arbitrum** — the first overlay to reach for
Fluid's liquidity layer on a chain other than Ethereum.

| Protocol | Listing | What is collected |
| --- | --- | --- |
| Fluid liquidity layer | sUSDai | total supplied |
| Morpho Blue | sUSDai / USDC | supplied, borrowed, available, borrow rate |

**This is a different asset family from Re Related**, despite the similar
shorthand: `sUSDai` is "Staked USDai", while `reUSD` is the "Re Protocol Deposit
Token". They are kept on separate tabs so each tab's total means one thing.

sUSDai also sits on Fluid's **Ethereum** liquidity layer (~$84M) and Arbitrum
carries a plain `USDai` token as well; neither is tracked yet.

## The collector

```bash
npm run collect                    # snapshot today, backfill on first sight
npm run collect -- --no-backfill   # snapshot only
npm run collect -- --only=morpho   # aave | morpho | fluid | juplend | kamino
```

Writes `src/data/snapshots.json`. Re-running the same day overwrites that day
rather than duplicating it, so it is safe to run repeatedly. Run it once a day
(Task Scheduler, cron, or a GitHub Action) to build the record.

## Layout

```
huma-radar/
  scripts/
    tracked.mjs             what to collect — chains, Aave reserves, Morpho vaults, HUMA + MAPLE overlays
    collect.mjs             orchestrator
    lib/gql.mjs             shared GraphQL client + snapshot upsert
    sources/aave.mjs        Aave v3 source
    sources/morpho.mjs      Morpho source — vaults (V1 + V2) and Blue markets
    sources/fluid.mjs       Fluid borrow vaults (type 1 + smart-debt type 4) and liquidity-layer tokens
    sources/juplend.mjs     Jupiter Lend borrow vaults and liquidity-layer tokens
    sources/kamino.mjs      Kamino lending reserves (Solana)
  src/
    types.ts                Snapshot / Market / Deltas — the storage contract
    data/
      chains.ts             networks + brand colours
      snapshots.json        the collected store (generated)
      markets.ts            loads the store
    lib/
      derive.ts             7D/30D change math, chain aggregates
      format.ts             USD / percent / date formatting
    components/
      Sidebar.tsx           chain selector + deduped global totals
      StatCards.tsx         TVL, avg APY, borrowed, utilization
      MarketTable.tsx       TVL & yield / borrow-side grouped table
      ChartDrawer.tsx       "Graph" panel: charts + daily history + CSV
      Primitives.tsx        logo, badges, delta pills, util meter, sparkline
```

## Conventions

- One snapshot shape covers every protocol. `tvl` is total supplied for an Aave
  or Kamino reserve, total assets for a Morpho vault, supplied loan assets for a
  Morpho market, and **collateral value** for a Fluid or Jupiter Lend vault —
  each is what its own app calls "supplied". `apy` is supply / net APY. Borrow
  fields are null for vaults and supply-only collateral.
- **Overlays are lenses, not partitions.** `huma`, `maple`, `ethena` and `re`
  are pseudo-chains that gather one asset family's venues from several protocols and
  networks. A venue may be listed both under its own chain and an overlay; ids
  are prefixed per overlay so the entries never collide, and the sidebar's
  global totals dedupe on protocol + chain + venue + asset so the dollars are
  counted once. Where an overlay spans networks, the network is shown in the
  row's venue sub-label rather than appended to its name, which the column would
  only truncate.
- Overlays are declared once, as `OVERLAYS` in `scripts/tracked.mjs`. Every
  collector walks that list and picks out the key it knows how to fetch, so a
  new overlay is pure configuration — add it there plus a `ChainId` and a colour
  in `src/data/chains.ts`, and it appears wherever its protocols are collected.
- **Two kinds of row are shown but not counted**, and the reasons differ.

  A **roll-up** would double-count: it reports everything supplied into a
  protocol for one token, so it *contains* that protocol's individual vaults
  rather than sitting beside them.

  A row flagged **`notInTotal`** in `scripts/tracked.mjs` is simply not what its
  tab totals. On Huma Related that covers the deposit side of the same money the
  market rows already report: Kamino's Huma-market USDC reserve — the $28M lent
  *against* PST rather than PST itself — and all four Morpho vaults, which are
  what supplies the PST markets listed above them. Each keeps its own row with
  its own rates and history.

  `excludedFromTotals()` in [`lib/derive.ts`](huma-radar/src/lib/derive.ts)
  unions the two cases. A flagged row is out of every header figure, borrowed
  and utilization included, since counting its debt against a TVL it is not part
  of would read as nonsense.

  A **composite** is both at once. `Total PST Liquidity` sums Fluid's #169,
  Jupiter's #93 and the Orca PST/USDC pool — three protocols, so no single API
  knows the answer and `sources/composites.mjs` runs last to add them up. It
  carries `rollup` because it contains rows on the same tab and `notInTotal`
  because the per-protocol roll-up rule would not catch a row whose protocol is
  `Combined`. Its history is summed per date, and a day one part existed for but
  did not report is dropped rather than summed short — otherwise a single
  failed source would read as a fall in PST liquidity. Fluid's and Jupiter's come from their
  liquidity layers. Morpho has no such layer, so its PST row sums the TVL of the
  three Blue markets that take PST as collateral.

  Read that row's figure for what it is. On Morpho Blue, TVL is the **loan**
  asset supplied — the PYUSD, USDC and AUSD waiting to be borrowed, $45.67M of
  it — not the PST posted against it, which `collateralAssetsUsd` puts higher at
  $53.10M. The TVL total is deliberate: it ties back to the three market rows a
  reader can see beneath it. Fluid's and Jupiter's PST rows, by contrast, really
  are PST.

  `supersededRollups()` drops a roll-up from the header totals **only when the
  same selection also shows non-roll-up rows from that protocol** — the case
  where counting both would double-count. Either way the row stays in the
  table, marked `not in total`, and the Total TVL card names what it left out.

  The condition matters: excluding roll-ups unconditionally would understate Re
  Related by 60% and Ethena Related by $259M, because on those tabs the roll-up
  is the *only* record of that money. Today the rule fires on Huma Related
  alone, where three roll-ups overlap the venues beneath them — Jupiter's PST
  ($75.69M), Fluid's PST ($47.22M) and the Morpho markets total ($49.29M).
  With the composite and the six deposit-side rows, nine of the tab's 22 rows
  sit outside the header, which reads $212.33M against $491.16M in the table. It is
  self-maintaining: add Fluid reUSD vaults to Re Related and that roll-up stops
  counting on its own.
- Four market kinds: `reserve` (Aave), `vault` (curated deposits, no borrow
  side), `market` (an isolated collateral/loan pair — Morpho Blue, Fluid,
  Jupiter Lend) and `pool` (an AMM pair — Orca, trading fees only). The table
  shows the collateral asset's mark and the LTV cap. A row that is a total
  badges as `Total` instead of its kind, since "Collateral" on a figure summed
  from three venues says less than "Total" does.
- **Fluid publishes APR, not APY.** Those cells are marked `APR` in the table
  rather than silently compared against compounded numbers, because fluid.io
  labels them that way too.
- **Jupiter Lend rates are stored as the APY jup.ag prints**, so they carry no
  marker. Jupiter compounds the program's simple rate continuously — 7.50%
  reads there as 7.79% — and the collector reproduces that, including the way a
  smart vault blends its legs. See sources/juplend.mjs. A collateral token's own
  staking rate passes through uncompounded, as jup.ag also shows it: PST reads
  8% there, not 8.33%.
- **TVL changes** are relative percent. **APY changes** default to **percentage
  points** (`+1.24pp`), toggleable to relative percent — a 2% → 4% APY move
  reads as `+2.00pp` rather than a misleading `+100%`.
- A percent change is suppressed when the baseline is under **$10,000**. A
  market seeded with a few dollars days ago would otherwise post six-figure
  percentages that swamp every real move in the column.
- **Average APY** on the stat cards is TVL-weighted.
- The borrow-side column group hides itself on vault-only chains, and the
  Available column appears only where a source publishes idle liquidity.
- Protocol filter tabs are derived from the data, so a chain only ever shows
  the protocols it actually holds.
- **Snapshots are UTC-dated**, one row per market per day.

## Next

- Wire the collector to a daily schedule. Until then every run is manual, and a
  missed day is a permanent hole for the sources that cannot be backfilled.
- Protocols beyond Aave, Morpho, Fluid, Jupiter Lend and Kamino.
- Fluid, Jupiter Lend and Kamino have no history endpoint; a subgraph or an
  archive node would let their record start earlier than the first collector run.
- The syrup reserves on Plasma, Monad and Mantle appear only on the Maple
  overlay; they could also be added to those chains' own tabs.
