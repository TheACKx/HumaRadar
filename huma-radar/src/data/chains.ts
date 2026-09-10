import type { Chain, ChainGroup, ChainId } from '../types'

/**
 * Declaration order is display order, and `group` decides which sidebar
 * section a tab lands in — so the sidebar and the mobile rail can never
 * disagree about where something belongs.
 */
export const CHAINS: Chain[] = [
  { id: 'huma',     name: 'Huma Related',  short: 'HUMA', color: '#C4A2F7', live: true, group: 'overview' },

  { id: 'ethereum', name: 'Ethereum',      short: 'ETH',  color: '#8A92F5', live: true, group: 'network'  },
  { id: 'base',     name: 'Base',          short: 'BASE', color: '#4C7DFF', live: true, group: 'network'  },
  { id: 'arbitrum', name: 'Arbitrum',      short: 'ARB',  color: '#3FA9F5', live: true, group: 'network'  },
  { id: 'mantle',   name: 'Mantle',        short: 'MNT',  color: '#4FD6B8', live: true, group: 'network'  },
  { id: 'plasma',   name: 'Plasma',        short: 'XPL',  color: '#B7F84A', live: true, group: 'network'  },
  { id: 'monad',    name: 'Monad',         short: 'MON',  color: '#A974F1', live: true, group: 'network'  },
  { id: 'tempo',    name: 'Tempo',         short: 'TEMPO',color: '#F2C14E', live: true, group: 'network'  },
  { id: 'robinhood',name: 'Robinhood',     short: 'RHC',  color: '#8FE04A', live: true, group: 'network'  },

  { id: 'maple',    name: 'Maple Related', short: 'MPL',  color: '#FF7A45', live: true, group: 'project'  },
  { id: 'ethena',   name: 'Ethena Related',short: 'ENA',  color: '#E879F9', live: true, group: 'project'  },
  { id: 're',       name: 'Re Related',    short: 'RE',   color: '#22D3EE', live: true, group: 'project'  },
  { id: 'usdai',    name: 'USDai Related', short: 'USDAI',color: '#F4B942', live: true, group: 'project'  },
]

export const CHAIN_MAP: Record<ChainId, Chain> = Object.fromEntries(
  CHAINS.map((c) => [c.id, c]),
) as Record<ChainId, Chain>

export const chainsIn = (group: ChainGroup): Chain[] => CHAINS.filter((c) => c.group === group)

export const NETWORKS = chainsIn('network')
export const PROJECTS = chainsIn('project')
