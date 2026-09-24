/**
 * What Huma Radar tracks.
 *
 * Two source families:
 *
 *   aave   — Aave v3 reserves. `market` is the Aave market name as returned by
 *            api.v3.aave.com ("AaveV3Ethereum" is the Ethereum Core market).
 *            Token addresses resolve at collect time from the symbol, but an
 *            entry may pin `address` when one market lists two reserves under
 *            the same symbol (Arbitrum: native USDC vs bridged USDC.e).
 *            `as` renames a reserve for display.
 *
 *   morpho — Morpho vaults, addressed directly. The collector detects whether
 *            each one is a V1 or V2 vault.
 */

export const CHAINS = [
  { id: 'ethereum',  chainId: 1,     name: 'Ethereum'  },
  { id: 'plasma',    chainId: 9745,  name: 'Plasma'    },
  { id: 'monad',     chainId: 143,   name: 'Monad'     },
  { id: 'base',      chainId: 8453,  name: 'Base'      },
  { id: 'arbitrum',  chainId: 42161, name: 'Arbitrum'  },
  { id: 'mantle',    chainId: 5000,  name: 'Mantle'    },
  { id: 'robinhood', chainId: 4663,  name: 'Robinhood' },
  { id: 'tempo',     chainId: 4217,  name: 'Tempo'     },
  { id: 'arc',       chainId: 5042,  name: 'Arc'       },
]

export const AAVE = {
  ethereum: {
    market: 'AaveV3Ethereum',
    reserves: [
      { symbol: 'USDT' },
      { symbol: 'USDC' },
      { symbol: 'USDe' },
      { symbol: 'sUSDe' },
      { symbol: 'syrupUSDT' },
    ],
  },
  plasma: {
    market: 'AaveV3Plasma',
    reserves: [{ symbol: 'USDT0' }, { symbol: 'USDe' }, { symbol: 'GHO' }],
  },
  monad: {
    market: 'AaveV3Monad',
    reserves: [
      { symbol: 'USDC' },
      { symbol: 'USDe' },
      { symbol: 'USDT0' },
      { symbol: 'GHO' },
      { symbol: 'AUSD' },
    ],
  },
  base: {
    market: 'AaveV3Base',
    reserves: [{ symbol: 'USDC' }, { symbol: 'syrupUSDC' }],
  },
  arbitrum: {
    market: 'AaveV3Arbitrum',
    reserves: [
      // native USDC — the bridged USDC.e reserve shares the symbol and is frozen
      { symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
      // Arbitrum lists USDT0 under Tether's glyph
      { symbol: 'USD₮0', as: 'USDT0' },
    ],
  },
  mantle: {
    market: 'AaveV3Mantle',
    reserves: [{ symbol: 'USDT0' }],
  },
}

/**
 * Aave v4 reserves. v4 is a different protocol shape from v3 — liquidity sits
 * in hubs, and each market ("spoke") borrows from one — and it is served by a
 * different API (api.aave.com, not api.v3.aave.com), so it has its own source.
 *
 * `reserveId` is the id Aave Pro puts in its reserve URLs: base64 of
 * "<chainId>::<spoke address>::<reserve index>". It is also what the API takes.
 */
export const AAVE_V4 = {
  arc: [
    {
      // 5042::0xB843bdC3a87A05E77E07Df9FE48928b3A34b134d::0 — USDC, Main spoke on the Core hub
      reserveId: 'NTA0Mjo6MHhCODQzYmRDM2E4N0EwNUU3N0UwN0RmOUZFNDg5MjhiM0EzNGIxMzRkOjow',
      name: 'USDC',
    },
  ],
}

const morphoUrl = (slug, address, path) =>
  `https://app.morpho.org/${slug}/vault/${address}/${path}`

export const MORPHO = {
  ethereum: [
    { name: 'Paypal USD Main',      address: '0xb576765fB15505433aF24FEe2c0325895C559FB2', url: morphoUrl('ethereum', '0xb576765fB15505433aF24FEe2c0325895C559FB2', 'paypal-usd-main') },
    { name: 'Sentora RLUSD Main',   address: '0x6dC58a0FdfC8D694e571DC59B9A52EEEa780E6bf', url: morphoUrl('ethereum', '0x6dC58a0FdfC8D694e571DC59B9A52EEEa780E6bf', 'sentora-rlusd-main') },
    { name: 'Sentora Prime Main',   address: '0xC21b08C16458202593D4D9B26b9984Ee67b38BbD', url: morphoUrl('ethereum', '0xC21b08C16458202593D4D9B26b9984Ee67b38BbD', 'sentora-prime-main') },
    { name: 'Sentora Huma PST Main', address: '0x8381a156958711E230f325428B5eb4b6555C75D9', url: morphoUrl('ethereum', '0x8381a156958711E230f325428B5eb4b6555C75D9', 'sentora-huma-pst-main') },
    { name: 'Wintermute USDC Select', address: '0xA2EAaD0D586cF9FD73bb2c09cF6A7E3e187D68cd', url: morphoUrl('ethereum', '0xA2EAaD0D586cF9FD73bb2c09cF6A7E3e187D68cd', 'wintermute-usdc-select') },
    { name: '3F x Steakhouse USDC', address: '0xBEEf3f3A04e28895f3D5163d910474901981183D', url: morphoUrl('ethereum', '0xBEEf3f3A04e28895f3D5163d910474901981183D', '3f-x-steakhouse-usdc') },
    { name: 'Galaxy USDC Enhanced', address: '0xd95fE7adF5075fad9D6Bf853E0f9Fe53369E8D96', url: morphoUrl('ethereum', '0xd95fE7adF5075fad9D6Bf853E0f9Fe53369E8D96', 'galaxy-usdc-enhanced') },
    { name: 'Bitwise Premium RWA AUSD', address: '0xB344e331A3cDa61D329fb3Cca2Be5942da87c418', url: morphoUrl('ethereum', '0xB344e331A3cDa61D329fb3Cca2Be5942da87c418', 'bitwise-premium-rwa-ausd') },
  ],
  monad: [
    { name: 'Hyperithm USDC Apex', address: '0x78999cc96d2Ba0341588C60CcB0E91c6C33CF371', url: morphoUrl('monad', '0x78999cc96d2Ba0341588C60CcB0E91c6C33CF371', 'hyperithm-usdc-apex') },
    { name: 'August USDC V2',      address: '0x80017bF0f793EBbE9679Cd61ff0e395B62CAbB59', url: morphoUrl('monad', '0x80017bF0f793EBbE9679Cd61ff0e395B62CAbB59', 'august-usdc-v2') },
  ],
  base: [
    { name: 'Steakhouse High Yield USDC Edition', address: '0xbeeff2490FEffa212faC2f6553682C219E6a8845', url: morphoUrl('base', '0xbeeff2490FEffa212faC2f6553682C219E6a8845', 'steakhouse-high-yield-usdc-edition') },
    { name: 'Gauntlet USDC Frontier',             address: '0x1deEfABEe758AAbdC29a542B24ca3b75aFD56765', url: morphoUrl('base', '0x1deEfABEe758AAbdC29a542B24ca3b75aFD56765', 'gauntlet-usdc-frontier') },
  ],
  robinhood: [
    { name: 'Steakhouse USDG', address: '0xBeEff033F34C046626B8D0A041844C5d1A5409dd', url: morphoUrl('robinhood-chain', '0xBeEff033F34C046626B8D0A041844C5d1A5409dd', 'steakhouse-usdg') },
  ],
  tempo: [
    { name: 'Sentora pathUSD', address: '0x9a044AE05E5e6290DcF56afd69548565e957a626', url: morphoUrl('tempo', '0x9a044AE05E5e6290DcF56afd69548565e957a626', 'sentora-pathusd') },
  ],
  arc: [
    { name: 'Bitwise Premium RWA USDC', address: '0x7610094B846657dCF166D59e42973db52c7015F9', url: morphoUrl('arc', '0x7610094B846657dCF166D59e42973db52c7015F9', 'bitwise-premium-rwa-usdc') },
  ],
}

/**
 * Huma Related — a curated overlay rather than a chain.
 *
 * Everything here is either a PST (PayFi Strategy Token) borrow venue or a
 * Huma-curated Morpho vault, gathered from three protocols across two
 * networks. Entries carry their real network so each collector can address
 * them; the app files them all under the pseudo-chain `huma`.
 *
 * Galaxy USDC Enhanced also appears under Ethereum. It is deliberately listed
 * twice — the overlay is a lens, not a partition — and the sidebar's aggregate
 * dedupes on venue address so the dollars are not counted twice.
 */
export const HUMA = {
  /** Morpho Blue markets — a collateral/loan pair with a borrow side. */
  morphoMarkets: [
    {
      name: 'PST / USDC',
      marketId: '0x002278ea242ec722813b4fe3c8eeaa07dbc331c731cc0b4248a1bf0771f933ea',
      chainId: 1,
      url: 'https://app.morpho.org/ethereum/variable/0x002278ea242ec722813b4fe3c8eeaa07dbc331c731cc0b4248a1bf0771f933ea/pst-usdc',
    },
    {
      name: 'PST / PYUSD',
      marketId: '0xb4977179610abfecfc8b76255a002c16b33f46d077beb86e5911e1fe9ee6e512',
      chainId: 1,
      url: 'https://app.morpho.org/ethereum/variable/0xb4977179610abfecfc8b76255a002c16b33f46d077beb86e5911e1fe9ee6e512/pst-pyusd',
    },
    {
      // Bitwise-curated; the app titles it "AUSD PST", loan first
      name: 'PST / AUSD',
      marketId: '0xe90a6419afa96192cb088f63b779ddcb629a89f9126600d767d9442868087541',
      chainId: 1,
      url: 'https://app.morpho.org/ethereum/variable/0xe90a6419afa96192cb088f63b779ddcb629a89f9126600d767d9442868087541/ausd-pst',
    },
  ],

  /**
   * Collateral totalled across the Blue markets above, as one roll-up row per
   * symbol. Morpho reports a market's TVL as the loan asset supplied — PYUSD,
   * USDC, AUSD — so without this nothing on the tab says how much PST is
   * actually posted against them. Held out of the header totals, since that
   * same PST already backs the market rows.
   */
  morphoCollateral: [{ symbol: 'PST', name: 'PST' }],

  /**
   * Morpho vaults surfaced on the Huma tab. All four are shown but held out of
   * the tab's totals: they are the deposit side that lends *into* the PST
   * markets listed above, so their TVL is the same money those markets report
   * as supplied.
   */
  morphoVaults: [
    { name: 'Sentora Huma PST Main', address: '0x8381a156958711E230f325428B5eb4b6555C75D9', chainId: 1, notInTotal: true, url: morphoUrl('ethereum', '0x8381a156958711E230f325428B5eb4b6555C75D9', 'sentora-huma-pst-main') },
    { name: 'RockawayX USDC Yield', address: '0xE0181090c22579B6A217f1522cbf8c9f1F0C1965', chainId: 1, notInTotal: true, url: morphoUrl('ethereum', '0xE0181090c22579B6A217f1522cbf8c9f1F0C1965', 'rockawayx-usdc-yield') },
    { name: 'Huma USDC Main',       address: '0x8aC91877b93330f52b2979a31a4879506021475c', chainId: 1, notInTotal: true, url: morphoUrl('ethereum', '0x8aC91877b93330f52b2979a31a4879506021475c', 'huma-usdc-main') },
    { name: 'Galaxy USDC Enhanced', address: '0xd95fE7adF5075fad9D6Bf853E0f9Fe53369E8D96', chainId: 1, notInTotal: true, url: morphoUrl('ethereum', '0xd95fE7adF5075fad9D6Bf853E0f9Fe53369E8D96', 'galaxy-usdc-enhanced') },
  ],

  /** Fluid borrow vaults on Ethereum, addressed by their numeric vault id. */
  fluid: [
    { id: 165, chainId: 1, url: 'https://fluid.io/1/borrowing/vaults/165' },
    { id: 166, chainId: 1, url: 'https://fluid.io/1/borrowing/vaults/166' },
    { id: 169, chainId: 1, url: 'https://fluid.io/1/borrowing/vaults/169' },
  ],

  /**
   * Jupiter Lend borrow vaults on Solana. The three smart vaults pair a token
   * with a DEX pair on one side — jup.ag routes those under /borrow/smart/,
   * and the collector reads each vault's `type` rather than being told here.
   */
  juplend: [
    { id: 61, url: 'https://jup.ag/lend/borrow/61/stats' },
    { id: 45, url: 'https://jup.ag/lend/borrow/45/stats' },
    { id: 91, url: 'https://jup.ag/lend/borrow/smart/91/stats' },
    { id: 96, url: 'https://jup.ag/lend/borrow/smart/96/stats' },
    { id: 93, url: 'https://jup.ag/lend/borrow/smart/93/stats' },
  ],

  /** Kamino lending reserves on Solana, both sides of the Huma market. */
  kamino: [
    {
      name: 'PST',
      market: '52FSGeeokLpgvgAMdqxyt5Hoc2TbUYj5b8yxrEdZ37Vf',
      reserve: 'DzgYbR8HFQKf8YLCJ6M3E6ricB1xWAiNGZ2TB7X2KDHz',
      url: 'https://kamino.com/borrow/reserve/52FSGeeokLpgvgAMdqxyt5Hoc2TbUYj5b8yxrEdZ37Vf/DzgYbR8HFQKf8YLCJ6M3E6ricB1xWAiNGZ2TB7X2KDHz',
    },
    {
      // the lending side of the same market: the USDC borrowed against PST,
      // with its own supply and borrow rates. Real money, but not PST, so it
      // is shown and marked rather than added to this tab's totals.
      name: 'USDC',
      market: '52FSGeeokLpgvgAMdqxyt5Hoc2TbUYj5b8yxrEdZ37Vf',
      reserve: '4QKFoFDzNFnvfkzVazABbCEfMwd3y1pZqUVzmpnkCphj',
      url: 'https://kamino.com/borrow/reserve/52FSGeeokLpgvgAMdqxyt5Hoc2TbUYj5b8yxrEdZ37Vf/4QKFoFDzNFnvfkzVazABbCEfMwd3y1pZqUVzmpnkCphj',
      notInTotal: true,
    },
  ],

  /** Orca Whirlpools — concentrated-liquidity AMM pools, no borrow side. */
  orca: [
    {
      name: 'PST / USDC',
      address: 'FCdB84kbytrT8JHsWLrWxPoquetmtcF1NZw7LYcgrQJE',
      url: 'https://www.orca.so/pools/FCdB84kbytrT8JHsWLrWxPoquetmtcF1NZw7LYcgrQJE',
    },
  ],

  /**
   * Totals summed from the rows above rather than from an endpoint. PST paired
   * against a stablecoin, wherever that pair is held: Fluid's and Jupiter's
   * PST-USDC smart-collateral vaults plus Orca's PST/USDC pool. Held out of
   * the tab's totals, since every part of it is already listed.
   */
  composites: [
    {
      id: 'pst-liquidity',
      name: 'Total PST Liquidity',
      symbol: 'PST',
      venue: 'Fluid · Jupiter Lend · Orca',
      parts: ['fluid-1-169', 'juplend-93', 'orca-fcdb84kbyt'],
    },
  ],

  /** Total supplied into Fluid's Ethereum liquidity layer, per token. */
  fluidTokens: [
    { name: 'PST', symbol: 'PST', chainId: 1, url: 'https://fluid.io/1/stats/liquidity?id=PST' },
  ],

  /**
   * Total supplied into Jupiter Lend's liquidity layer, per token. This is a
   * roll-up: it already contains the PST collateral of every vault above, so
   * it is held out of the header totals — see supersededRollups() in
   * lib/derive.ts.
   */
  juplendTokens: [
    {
      name: 'PST',
      mint: '59obFNBzyTBGowrkif5uK7ojS58vsuWz3ZCvg6tfZAGw',
      url: 'https://jup.ag/lend/statistics/liquidity/59obFNBzyTBGowrkif5uK7ojS58vsuWz3ZCvg6tfZAGw',
    },
  ],
}

/** Solana has no EVM chain id; 101 is the conventional stand-in. */
export const SOLANA_CHAIN_ID = 101

/**
 * Maple Related — a second overlay, same idea as HUMA.
 *
 * Everything here is a Maple syrup token (syrupUSDC / syrupUSDT / syrupUSDG)
 * wherever it is supplied or used as collateral, across four protocols and
 * three networks. Entries carry their real network so each collector can
 * address them; the app files them under the pseudo-chain `maple`.
 *
 * The same syrup token is listed on five Aave chains, so rows are told apart by
 * their venue in the sub-label ("Plasma Market", "Core Market") rather than by a
 * suffix on the name, which the name column would only truncate away. Morpho
 * markets carry an explicit `network` for the same reason.
 */
export const MAPLE = {
  /** Aave v3 reserves. All are supply-only collateral: borrowing is disabled. */
  aave: [
    { name: 'syrupUSDT', chain: 'ethereum', chainId: 1,    market: 'AaveV3Ethereum', symbol: 'syrupUSDT' },
    { name: 'syrupUSDT', chain: 'plasma',   chainId: 9745, market: 'AaveV3Plasma',   symbol: 'syrupUSDT' },
    { name: 'syrupUSDC', chain: 'monad',    chainId: 143,  market: 'AaveV3Monad',    symbol: 'syrupUSDC' },
    { name: 'syrupUSDC', chain: 'base',     chainId: 8453, market: 'AaveV3Base',     symbol: 'syrupUSDC' },
    { name: 'syrupUSDT', chain: 'mantle',   chainId: 5000, market: 'AaveV3Mantle',   symbol: 'syrupUSDT' },
  ],

  /**
   * Morpho Blue markets with a syrup token as collateral.
   *
   * Only two of the four ids were recoverable from the source links — three of
   * them pointed at the same rlusd-syrupusdc market — so PYUSD and USDG were
   * found by sweeping every Morpho market for syrup collateral. USDG turned out
   * to live on Robinhood Chain, not Ethereum. Each of these is the market that
   * actually holds size; Morpho carries a long tail of empty duplicates under
   * the same asset pair.
   */
  morphoMarkets: [
    {
      name: 'syrupUSDC / PYUSD',
      marketId: '0xc9629945524f3fde56c7e8854a6c3d48e76b9d97236abbe73c750fcc7aeb8501',
      chainId: 1,
      url: 'https://app.morpho.org/ethereum/variable/0xc9629945524f3fde56c7e8854a6c3d48e76b9d97236abbe73c750fcc7aeb8501/pyusd-syrupusdc',
    },
    {
      name: 'syrupUSDC / RLUSD',
      marketId: '0xc0ae375fd761ff19b3f04de5534c0f1ec110f80e1c2ede27c42c1c43c3040394',
      chainId: 1,
      url: 'https://app.morpho.org/ethereum/variable/0xc0ae375fd761ff19b3f04de5534c0f1ec110f80e1c2ede27c42c1c43c3040394/rlusd-syrupusdc',
    },
    {
      name: 'syrupUSDC / AUSD',
      marketId: '0xab3196447663a41382ba4b4d55eab3fa702ee2cf071db224fd72492953040056',
      chainId: 1,
      url: 'https://app.morpho.org/ethereum/variable/0xab3196447663a41382ba4b4d55eab3fa702ee2cf071db224fd72492953040056/ausd-syrupusdc',
    },
    {
      name: 'syrupUSDG / USDG',
      network: 'Robinhood',
      marketId: '0x919a9b6b94dae7c86620eaf7a08e597aae8a4c3a9e9c7671771fbaf62b6b61c7',
      chainId: 4663,
      url: 'https://app.morpho.org/robinhood-chain/variable/0x919a9b6b94dae7c86620eaf7a08e597aae8a4c3a9e9c7671771fbaf62b6b61c7/usdg-syrupusdg',
    },
  ],

  /** Kamino lending reserves on Solana, addressed by market + reserve pubkey. */
  kamino: [
    {
      name: 'syrupUSDC',
      market: '6WEGfej9B9wjxRs6t4BYpb9iCXd8CpTpJ8fVSNzHCC5y',
      reserve: 'AwCyCPZYJSZ93xcVKNK7jR8e1BHzJXq1D4bReNuh9woY',
      url: 'https://kamino.com/borrow/reserve/6WEGfej9B9wjxRs6t4BYpb9iCXd8CpTpJ8fVSNzHCC5y/AwCyCPZYJSZ93xcVKNK7jR8e1BHzJXq1D4bReNuh9woY',
    },
  ],

  /**
   * Jupiter Lend does not expose a per-token supply total, so this rolls up
   * every borrow vault that takes the mint as collateral — the same figure the
   * protocol's own liquidity page reports for the token.
   */
  juplendTokens: [
    {
      name: 'syrupUSDC',
      mint: 'AvZZF1YaZDziPY2RCK4oJrRVrbN3mTD9NL24hPeaZeUj',
      url: 'https://jup.ag/lend/statistics/liquidity/AvZZF1YaZDziPY2RCK4oJrRVrbN3mTD9NL24hPeaZeUj',
    },
  ],
}

/**
 * Ethena Related — the third overlay.
 *
 * Wherever USDe or its staked form sUSDe is supplied or posted as collateral,
 * across four protocols and four networks. Aave lists both tokens on every
 * chain here; the pair is told apart by name, and the chain by the venue in the
 * row's sub-label.
 */
export const ETHENA = {
  /**
   * Aave v3 reserves. USDe is borrowable; sUSDe is supply-only collateral
   * everywhere it is listed, so its borrow columns stay empty.
   *
   * Only the Ethereum Core market is tracked. Aave's Lido market also lists
   * sUSDe, at a fraction of the size, and mixing the two would double-count.
   */
  aave: [
    { name: 'USDe',  chain: 'ethereum', chainId: 1,    market: 'AaveV3Ethereum', symbol: 'USDe'  },
    { name: 'sUSDe', chain: 'ethereum', chainId: 1,    market: 'AaveV3Ethereum', symbol: 'sUSDe' },
    { name: 'USDe',  chain: 'plasma',   chainId: 9745, market: 'AaveV3Plasma',   symbol: 'USDe'  },
    { name: 'sUSDe', chain: 'plasma',   chainId: 9745, market: 'AaveV3Plasma',   symbol: 'sUSDe' },
    { name: 'USDe',  chain: 'monad',    chainId: 143,  market: 'AaveV3Monad',    symbol: 'USDe'  },
    { name: 'sUSDe', chain: 'monad',    chainId: 143,  market: 'AaveV3Monad',    symbol: 'sUSDe' },
    { name: 'USDe',  chain: 'mantle',   chainId: 5000, market: 'AaveV3Mantle',   symbol: 'USDe'  },
    { name: 'sUSDe', chain: 'mantle',   chainId: 5000, market: 'AaveV3Mantle',   symbol: 'sUSDe' },
  ],

  /** Morpho Blue markets collateralised by USDe or sUSDe. */
  morphoMarkets: [
    {
      name: 'USDe / USDC',
      network: 'Base',
      marketId: '0x54cf9be57fdfa6457a660991907434ff9d295c465a603a50126ff647d50b7354',
      chainId: 8453,
      url: 'https://app.morpho.org/base/variable/0x54cf9be57fdfa6457a660991907434ff9d295c465a603a50126ff647d50b7354/usdc-usde',
    },
    {
      name: 'USDe / USDG',
      network: 'Robinhood',
      marketId: '0xc845da65a020ddca5f132efa8fea79676d8edfdea504226a4c01e7a9e34cddd6',
      chainId: 4663,
      url: 'https://app.morpho.org/robinhood-chain/variable/0xc845da65a020ddca5f132efa8fea79676d8edfdea504226a4c01e7a9e34cddd6/usdg-usde',
    },
    {
      name: 'sUSDe / PYUSD',
      marketId: '0x90ef0c5a0dc7c4de4ad4585002d44e9d411d212d2f6258e94948beecf8b4c0d5',
      chainId: 1,
      url: 'https://app.morpho.org/ethereum/variable/0x90ef0c5a0dc7c4de4ad4585002d44e9d411d212d2f6258e94948beecf8b4c0d5/pyusd-susde',
    },
  ],

  kamino: [
    {
      name: 'USDe',
      market: 'BJnbcRHqvppTyGesLzWASGKnmnF1wq9jZu6ExrjT7wvF',
      reserve: '2erD9GTGcaQbLsVSQweg3HvMpfKxScmz95raWv8H4iPN',
      url: 'https://kamino.com/borrow/reserve/BJnbcRHqvppTyGesLzWASGKnmnF1wq9jZu6ExrjT7wvF/2erD9GTGcaQbLsVSQweg3HvMpfKxScmz95raWv8H4iPN',
    },
  ],

  /**
   * Jupiter Lend runs separate deployments and USDe lives on the `ethena` one,
   * which the default vault list does not contain. Vault ids repeat across
   * deployments, so the market has to be named.
   */
  juplendTokens: [
    {
      name: 'USDe',
      mint: 'DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT',
      market: 'ethena',
      url: 'https://jup.ag/lend/ethena/statistics/liquidity/DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT',
    },
  ],
}

/**
 * Every overlay, in sidebar order. Each collector walks this list and picks out
 * the key it knows how to fetch, so a new overlay is pure configuration: add it
 * here and it appears wherever its protocols are collected.
 *
 * `id` must match a ChainId in src/data/chains.ts, and `label` is only used to
 * line up the collector's log output.
 */
/**
 * Re Related — the fourth overlay.
 *
 * Wherever Re Protocol's reUSD is supplied or posted as collateral. reUSD is
 * collateral-only on the liquidity layers that hold it, so those rows carry a
 * supplied total and no borrow side; the Morpho markets have a real one.
 */
export const RE = {
  morphoMarkets: [
    {
      name: 'reUSD / USDC',
      marketId: '0x4565ac05d38b19374ccbb04c17cca60ca9353cd41824f0803d0fc7704f60eaed',
      chainId: 1,
      url: 'https://app.morpho.org/ethereum/variable/0x4565ac05d38b19374ccbb04c17cca60ca9353cd41824f0803d0fc7704f60eaed/usdc-reusd',
    },
    {
      name: 'reUSD / USDT',
      marketId: '0x9105a5447f3eecdf768f04da12d580a878106e2e6b234312db2ee0f304539e35',
      chainId: 1,
      url: 'https://app.morpho.org/ethereum/variable/0x9105a5447f3eecdf768f04da12d580a878106e2e6b234312db2ee0f304539e35/usdt-reusd',
    },
  ],

  kamino: [
    {
      name: 'reUSD',
      market: '45MBhfB6SNw2rRSWzUwBqG3e9JJnS6UWvDDdQvBsUnds',
      reserve: '8ZTwUgBXoEKUQNV63GS2xaMhsciJMQNLeBSXgZihvp52',
      url: 'https://kamino.com/borrow/reserve/45MBhfB6SNw2rRSWzUwBqG3e9JJnS6UWvDDdQvBsUnds/8ZTwUgBXoEKUQNV63GS2xaMhsciJMQNLeBSXgZihvp52',
    },
  ],

  /** No `market`, so the default `main` Jupiter Lend deployment. */
  juplendTokens: [
    {
      name: 'reUSD',
      mint: '2uxaYT1fVrp6Fg2BrxQcyKSW91hefM6dG9krpbeDiirT',
      url: 'https://jup.ag/lend/statistics/liquidity/2uxaYT1fVrp6Fg2BrxQcyKSW91hefM6dG9krpbeDiirT',
    },
  ],

  fluidTokens: [
    { name: 'reUSD', symbol: 'reUSD', chainId: 1, url: 'https://fluid.io/1/stats/liquidity?id=reUSD' },
  ],
}

/**
 * USDai Related — the fifth overlay.
 *
 * Wherever USDai's staked form sUSDai is supplied or posted as collateral. Note
 * this is a different asset family from RE above: sUSDai is "Staked USDai",
 * while reUSD is the "Re Protocol Deposit Token".
 *
 * Both venues here are on Arbitrum, which is the first overlay to reach for
 * Fluid's liquidity layer on a chain other than Ethereum.
 */
export const USDAI = {
  morphoMarkets: [
    {
      name: 'sUSDai / USDC',
      network: 'Arbitrum',
      marketId: '0x71c2954e00c8f72864600c9d1d1cd70fa15202c4294cd938d80add3be2eced26',
      chainId: 42161,
      url: 'https://app.morpho.org/arbitrum/variable/0x71c2954e00c8f72864600c9d1d1cd70fa15202c4294cd938d80add3be2eced26/usdc-susdai',
    },
  ],

  fluidTokens: [
    {
      name: 'sUSDai',
      symbol: 'sUSDai',
      chainId: 42161,
      url: 'https://fluid.io/42161/stats/liquidity?id=sUSDai',
    },
  ],
}

export const OVERLAYS = [
  { id: 'huma', label: 'Huma', ...HUMA },
  { id: 'maple', label: 'Maple', ...MAPLE },
  { id: 'ethena', label: 'Ethena', ...ETHENA },
  { id: 're', label: 'Re', ...RE },
  { id: 'usdai', label: 'USDai', ...USDAI },
]

/**
 * Stablecoin supply overlook — the chains whose total stablecoin market cap is
 * tracked from DefiLlama, in the order the tab lists them.
 *
 * `slug` is the chain name DefiLlama's stablecoin API expects in the path, not
 * the lowercase name in its page URLs: the page /stablecoins/robinhood-chain is
 * served by /stablecoincharts/Robinhood%20Chain. `all` is the network-wide
 * total rather than a chain.
 */
export const STABLECOINS = [
  { id: 'all',       name: 'All Chains',      slug: 'all',             url: 'https://defillama.com/stablecoins' },
  { id: 'ethereum',  name: 'Ethereum',        slug: 'Ethereum',        url: 'https://defillama.com/stablecoins/ethereum' },
  { id: 'solana',    name: 'Solana',          slug: 'Solana',          url: 'https://defillama.com/stablecoins/solana' },
  { id: 'base',      name: 'Base',            slug: 'Base',            url: 'https://defillama.com/stablecoins/base' },
  { id: 'xrpl',      name: 'XRPL',            slug: 'XRPL',            url: 'https://defillama.com/stablecoins/xrpl' },
  { id: 'plasma',    name: 'Plasma',          slug: 'Plasma',          url: 'https://defillama.com/stablecoins/plasma' },
  { id: 'robinhood', name: 'Robinhood Chain', slug: 'Robinhood Chain', url: 'https://defillama.com/stablecoins/robinhood-chain' },
  { id: 'monad',     name: 'Monad',           slug: 'Monad',           url: 'https://defillama.com/stablecoins/monad' },
  { id: 'bsc',       name: 'BSC',             slug: 'BSC',             url: 'https://defillama.com/stablecoins/bsc' },
  { id: 'tempo',     name: 'Tempo',           slug: 'Tempo',           url: 'https://defillama.com/stablecoins/tempo' },
  { id: 'stellar',   name: 'Stellar',         slug: 'Stellar',         url: 'https://defillama.com/stablecoins/stellar' },
  { id: 'arc',       name: 'Arc',             slug: 'Arc',             url: 'https://defillama.com/stablecoins/arc' },
]

/**
 * Stablecoin protocols — TVL and yield for the products themselves, rather
 * than for the venues that lend against them.
 *
 * Two source shapes, because DefiLlama models these two ways and the tab has to
 * follow whichever page the entry is quoting:
 *
 *   pool     — a DefiLlama yields pool id. Its chart carries both TVL and APY
 *              for that one product, which is what /yields/pool/<id> shows.
 *
 *   protocol — a DefiLlama protocol slug. Its chart carries protocol-wide TVL
 *              only, so the yield comes from the median across that project's
 *              pools for `yieldsSymbol` — the same figure the protocol page's
 *              "median APY" toggle draws. TVL is protocol-wide by construction:
 *              Ondo's $2.5B covers OUSG as well as USDY, exactly as the linked
 *              page reports it.
 *
 * `yieldsProject` and `yieldsSymbol` are resolved against yields.llama.fi/pools
 * at collect time rather than pinned to pool ids, so a project adding a chain
 * is picked up without an edit here.
 */
export const STABLECOIN_PROTOCOLS = [
  // Huma publishes no yields pool on DefiLlama, so this row carries TVL only
  { id: 'huma',     name: 'Huma',      ticker: 'PST',       protocol: 'huma-finance-v2',   url: 'https://defillama.com/protocol/huma-finance-v2?events=false&fees=false' },
  { id: 'sky',      name: 'Sky',       ticker: 'sUSDS',     pool: 'd8c4eff5-c8a9-46fc-a888-057c4c668e72' },
  { id: 'aave',     name: 'Aave',      ticker: 'USDC',      pool: 'aa70268e-4b52-42bf-a116-608b370f9501' },
  { id: 'maple',    name: 'Maple',     ticker: 'syrupUSDC', pool: '43641cf5-a92e-416b-bce9-27113d3c0db6' },
  { id: 'ondo',     name: 'Ondo',      ticker: 'USDY',      protocol: 'ondo-yield-assets', yieldsProject: 'ondo-yield-assets', yieldsSymbol: 'USDY',   url: 'https://defillama.com/protocol/ondo-yield-assets?fees=false&medianApy=true' },
  // USDe itself pays nothing; its yield is the staked sUSDe rate, which is what
  // the protocol page's median APY reports
  { id: 'ethena',   name: 'Ethena',    ticker: 'USDe',      protocol: 'ethena-usde',       yieldsProject: 'ethena-usde',       yieldsSymbol: 'SUSDE',  url: 'https://defillama.com/protocol/ethena-usde?fees=false&medianApy=true' },
  { id: 'spark',    name: 'Spark',     ticker: 'spUSDS',    pool: '0ed981dc-b49d-426d-ade5-6014728b1ef9' },
  { id: 'hastra',   name: 'Hastra',    ticker: 'PRIME',     protocol: 'hastra',            yieldsProject: 'hastra',            yieldsSymbol: 'PRIME',  url: 'https://defillama.com/protocol/hastra?fees=false&medianApy=true' },
  { id: 'onre',     name: 'OnRe',      ticker: 'ONYC',      pool: '7083d6a5-e3cb-4eeb-8204-f1b735e4ecbb' },
  { id: 'reusd',    name: 'Re',        ticker: 'reUSD',     pool: '1c312830-ee96-40c9-b55f-b0f209ca6ebd' },
  { id: 'reusde',   name: 'Re',        ticker: 'reUSDe',    pool: '145810df-dc01-43e7-8033-e0aa5dceb767' },
  { id: 'usd3',     name: '3Jane',     ticker: 'USD3',      pool: 'f8cd444e-d99f-4132-b234-fd3482bf8806' },
  { id: 'susd3',    name: '3Jane',     ticker: 'sUSD3',     pool: 'a99bb965-ebaa-4d98-9ed2-fa18de52c605' },
  { id: 'cap',      name: 'Cap',       ticker: 'stcUSD',    protocol: 'cap',               yieldsProject: 'cap',               yieldsSymbol: 'STCUSD', url: 'https://defillama.com/protocol/cap?fees=false&medianApy=true' },
  { id: 'avant',    name: 'Avant',     ticker: 'savUSD',    protocol: 'avant-avusd',       yieldsProject: 'avant-avusd',       yieldsSymbol: 'SAVUSD', url: 'https://defillama.com/protocol/avant-avusd?fees=false&medianApy=true' },
  { id: 'valos',    name: 'Valos',     ticker: 'vUSD',      pool: '4baffdfd-8015-4713-bad4-10a199b30157' },
  { id: 'fluid',    name: 'Fluid',     ticker: 'USDC',      pool: '4438dabc-7f0c-430b-8136-2722711ae663' },
  { id: 'usdai',    name: 'UsdAI',     ticker: 'sUSDai',    pool: '712ce948-bd9e-4f4a-8916-b72c447f7578' },
  { id: 'tori',     name: 'Tori',      ticker: 'strUSD',    protocol: 'tori-finance',      yieldsProject: 'tori-finance',      yieldsSymbol: 'STRUSD', url: 'https://defillama.com/protocol/tori-finance?usdInflows=false&medianApy=true' },
  { id: 'yuzu',     name: 'Yuzu',      ticker: 'syzUSD',    protocol: 'yuzu-money',        yieldsProject: 'yuzu-money',        yieldsSymbol: 'SYZUSD', url: 'https://defillama.com/protocol/yuzu-money?fees=false&events=false&medianApy=true' },
  { id: 'ember',    name: 'Ember',     ticker: 'PPplus',    pool: '99989c4e-cf3b-5936-89fa-769f7e56cd34' },
]
