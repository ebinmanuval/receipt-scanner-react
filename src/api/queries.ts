import { useQuery } from '@tanstack/react-query'
import { get } from './client'
import type { ReconcileSummary, ScanCounts } from './types'

export const queryKeys = {
  me: ['auth', 'me'] as const,
  scanCounts: ['scans', 'pending-counts'] as const,
  reconcileSummary: ['reconcile', 'summary'] as const,
}

/** Badge counts for the nav. Errors are swallowed by the caller (badge just hides). */
export function useScanCounts() {
  return useQuery({
    queryKey: queryKeys.scanCounts,
    queryFn: () => get<ScanCounts>('/api/scans/pending/'),
    // Stop polling a badge whose endpoint is failing (e.g. not deployed yet).
    refetchInterval: (q) => (q.state.status === 'error' ? false : 60_000),
    retry: false,
  })
}

export function useReconcileSummary() {
  return useQuery({
    queryKey: queryKeys.reconcileSummary,
    queryFn: () => get<ReconcileSummary>('/api/bank/reconcile/summary/'),
    // Stop polling a badge whose endpoint is failing (e.g. not deployed yet).
    refetchInterval: (q) => (q.state.status === 'error' ? false : 60_000),
    retry: false,
  })
}
