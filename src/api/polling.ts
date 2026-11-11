// Limits on background traffic.
//  - Scan status is polled every POLL_MS while a scan is being read.
//  - After MAX_POLLS checks, auto-polling stops and the UI offers "Check again".
//  - Any failing request is tried at most MAX_ATTEMPTS times in total (see main.tsx).

import { useReducer, useRef } from 'react'
import { keepPreviousData, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'

export const POLL_MS = 30_000
export const MAX_POLLS = 5
export const MAX_ATTEMPTS = 5

interface Counted {
  dataUpdateCount: number
  errorUpdateCount: number
}

const fetchCount = (s: Counted) => s.dataUpdateCount + s.errorUpdateCount
const keyOf = (k: QueryKey) => JSON.stringify(k)

/**
 * Tracks how many checks each query has had since polling started.
 * Polling "starts" the first time the query is seen active; it restarts when
 * the query goes inactive and active again (e.g. a re-run), or on checkAgain().
 */
export class PollBudget {
  private bases = new Map<string, number>()

  /** For refetchInterval: POLL_MS while active and under budget, otherwise false. */
  interval(key: QueryKey, state: Counted, active: boolean): number | false {
    const k = keyOf(key)
    if (!active) {
      this.bases.delete(k)
      return false
    }
    if (!this.bases.has(k)) this.bases.set(k, fetchCount(state))
    return fetchCount(state) - this.bases.get(k)! < MAX_POLLS ? POLL_MS : false
  }

  /** True when the query is still active but auto-polling has used its budget. */
  stalled(key: QueryKey, state: Counted, active: boolean): boolean {
    const base = this.bases.get(keyOf(key))
    return active && base !== undefined && fetchCount(state) - base >= MAX_POLLS
  }

  /** Grant a fresh budget. The manual refetch that follows doesn't count against it. */
  reset(key: QueryKey, state: Counted) {
    this.bases.set(keyOf(key), fetchCount(state) + 1)
  }
}

/**
 * useQuery that polls every POLL_MS while `isActive(data)`, stops after MAX_POLLS
 * checks, and exposes `stalled` + `checkAgain()` for a manual retry button.
 */
export function useLimitedPolling<T>(opts: {
  queryKey: QueryKey
  queryFn: () => Promise<T>
  isActive: (data: T | undefined) => boolean
  /** Keep showing the previous key's data while the next loads (paged lists). */
  keepPrevious?: boolean
}) {
  const qc = useQueryClient()
  const budget = useRef(new PollBudget()).current
  const [, rerender] = useReducer((x: number) => x + 1, 0)

  const query = useQuery({
    queryKey: opts.queryKey,
    queryFn: opts.queryFn,
    placeholderData: opts.keepPrevious ? keepPreviousData : undefined,
    refetchInterval: (q) => budget.interval(q.queryKey, q.state, opts.isActive(q.state.data)),
  })

  // Subscribe to fetch completions: identical data doesn't re-render otherwise,
  // and `stalled` must be re-evaluated after every check.
  void query.dataUpdatedAt
  void query.errorUpdatedAt
  // The observer result has no update counts; read them from the cache.
  const state = qc.getQueryState(opts.queryKey)
  const counts = { dataUpdateCount: state?.dataUpdateCount ?? 0, errorUpdateCount: state?.errorUpdateCount ?? 0 }
  const stalled = !query.isPlaceholderData && budget.stalled(opts.queryKey, counts, opts.isActive(query.data))

  const checkAgain = () => {
    budget.reset(opts.queryKey, counts)
    rerender()
    return query.refetch()
  }

  return { query, stalled, checkAgain }
}
