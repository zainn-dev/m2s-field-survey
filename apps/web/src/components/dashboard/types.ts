import type { ClusterItem } from '../../types/survey';

export type ClusterCoverage = 'completed' | 'pending' | 'empty';

export interface ClusterStat extends ClusterItem {
  /** Approved (completed) surveys */
  done: number;
  /** Submitted, awaiting review */
  submitted: number;
  /** done / target, capped at 100 */
  pct: number;
  coverage: ClusterCoverage;
}

export interface TrendPoint {
  label: string;
  count: number;
}

export interface Indicator {
  label: string;
  range: string;
  pct: number;
  color: string;
}
