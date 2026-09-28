import { createContext } from 'react'
import type { ReportSeries } from '../types'

/**
 * What a report's trend cells need from the page around them: the report's
 * frozen TVL series, and a way to open the larger chart. Null while the series
 * is loading, or for a report written before the graphs existed.
 */
export interface ReportCharts {
  series: ReportSeries
  open: (id: string) => void
}

export const ReportChartsContext = createContext<ReportCharts | null>(null)
