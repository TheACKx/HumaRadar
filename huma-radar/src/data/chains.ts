import type { Chain, ChainId } from '../types'

export const CHAINS: Chain[] = [
  { id: 'ethereum', name: 'Ethereum',     short: 'ETH',  color: '#8A92F5', live: true  },
  { id: 'base',     name: 'Base',         short: 'BASE', color: '#4C7DFF', live: true  },
  { id: 'arbitrum', name: 'Arbitrum',     short: 'ARB',  color: '#3FA9F5', live: true  },
  { id: 'mantle',   name: 'Mantle',       short: 'MNT',  color: '#4FD6B8', live: true  },
  { id: 'plasma',   name: 'Plasma',       short: 'XPL',  color: '#B7F84A', live: true  },
  { id: 'monad',    name: 'Monad',        short: 'MON',  color: '#A974F1', live: true  },
  { id: 'tempo',    name: 'Tempo',        short: 'TEMPO',color: '#F2C14E', live: true  },
  { id: 'robinhood',name: 'Robinhood',    short: 'RHC',  color: '#8FE04A', live: true  },
  { id: 'huma',     name: 'Huma Related', short: 'HUMA', color: '#C4A2F7', live: true  },
  { id: 'maple',    name: 'Maple Related',short: 'MPL',  color: '#FF7A45', live: true  },
  { id: 'ethena',   name: 'Ethena Related',short:'ENA',  color: '#E879F9', live: true  },
  { id: 're',       name: 'Re Related',   short: 'RE',   color: '#22D3EE', live: true  },
  { id: 'usdai',    name: 'USDai Related',short: 'USDAI',color:'#F4B942', live: true  },
]

export const CHAIN_MAP: Record<ChainId, Chain> = Object.fromEntries(
  CHAINS.map((c) => [c.id, c]),
) as Record<ChainId, Chain>
