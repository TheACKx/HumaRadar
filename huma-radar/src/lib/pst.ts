import type { PstSection, ViewId } from '../types'

/** The PST Deep Dive tab's pages, in the order the user numbered them. */
export const PST_SECTIONS: { id: PstSection; label: string }[] = [
  { id: 'pst-funding', label: '1 · PST funding sources' },
  { id: 'pst-tenure', label: '2 · Tenure analysis' },
  { id: 'pst-wallets', label: '3 · Top Wallets' },
]

export const isPstSection = (v: ViewId): v is PstSection => v.startsWith('pst-')
