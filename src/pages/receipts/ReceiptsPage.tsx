import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { isApiError } from '@/api/client'
import { useReceipts } from '@/api/receipts'
import type { Receipt } from '@/api/types'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { Spinner } from '@/components/ui/Spinner'
import { formatDate, formatMoney } from '@/lib/format'
import { useDebounce } from '@/lib/useDebounce'

export function ReceiptsPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const q = params.get('q') ?? ''
  const since = params.get('since') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)

  // Search box is local state; the URL follows after a short pause.
  const [search, setSearch] = useState(q)
  const debounced = useDebounce(search, 350)
  useEffect(() => {
    if (debounced.trim() === q) return
    setParams(build({ q: debounced.trim(), since }), { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const query = useReceipts({ q: q || undefined, since: since || undefined, page })

  const pastEnd = query.isError && isApiError(query.error) && query.error.status === 404 && page > 1

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Receipts</h1>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="q" className="mb-1 block text-sm font-medium text-slate-700">
            Search shop or item
          </label>
          <Input
            id="q"
            type="search"
            placeholder="e.g. coles, milk"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="sm:w-48">
          <label htmlFor="since" className="mb-1 block text-sm font-medium text-slate-700">
            Since
          </label>
          <Input
            id="since"
            type="date"
            value={since}
            onChange={(e) => setParams(build({ q, since: e.target.value }))}
          />
        </div>
        {(q || since) && (
          <button
            className="h-9 text-sm text-slate-600 underline"
            onClick={() => {
              setSearch('')
              setParams({})
            }}
          >
            Clear
          </button>
        )}
      </div>

      <Card className="relative p-0 sm:p-0">
        {query.isFetching && !query.isPending && (
          <Spinner className="absolute top-3 right-3 size-4" />
        )}
        {query.isPending ? (
          <LoadingState />
        ) : pastEnd ? (
          <EmptyState title="That page doesn't exist any more.">
            <button className="underline" onClick={() => setParams(build({ q, since }))}>
              Go to the first page
            </button>
          </EmptyState>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : query.data.results.length === 0 ? (
          <EmptyState title={q || since ? 'No receipts match.' : 'No receipts yet.'}>
            {!q && !since && (
              <Link to="/scans/upload" className="underline">
                Upload some
              </Link>
            )}
          </EmptyState>
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
              <tr>
                <th className="w-28 px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Shop</th>
                <th className="hidden w-20 px-4 py-2 text-right font-medium sm:table-cell">Items</th>
                <th className="w-28 px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {query.data.results.map((r) => (
                <ReceiptRow key={r.id} r={r} q={q} onOpen={() => navigate(`/receipts/${r.id}`)} />
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {query.data && query.data.results.length > 0 && (
        <Pagination
          page={query.data.page}
          pages={query.data.pages}
          count={query.data.count}
          onPage={(p) => setParams(build({ q, since, page: p }))}
        />
      )}
    </div>
  )
}

function build({ q, since, page }: { q: string; since: string; page?: number }) {
  const out: Record<string, string> = {}
  if (q) out.q = q
  if (since) out.since = since
  if (page && page > 1) out.page = String(page)
  return out
}

function ReceiptRow({ r, q, onOpen }: { r: Receipt; q: string; onOpen: () => void }) {
  const needle = q.toLowerCase()
  const matched = needle ? r.items.filter((i) => i.item.toLowerCase().includes(needle)).slice(0, 3) : []
  return (
    <tr className="cursor-pointer hover:bg-slate-50" onClick={onOpen}>
      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDate(r.date)}</td>
      <td className="px-4 py-3">
        <Link to={`/receipts/${r.id}`} className="block truncate font-medium" onClick={(e) => e.stopPropagation()}>
          {r.shop}
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          {r.needs_review && (
            <span
              title={r.review_note || 'Needs review'}
              className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
            >
              Review
            </span>
          )}
          {r.category && <span className="truncate text-xs text-slate-500">{r.category.name}</span>}
          <span className="text-xs text-slate-400 sm:hidden">{r.items.length} items</span>
        </div>
        {matched.length > 0 && (
          <p className="truncate text-xs text-slate-500">{matched.map((i) => i.item).join(' · ')}</p>
        )}
      </td>
      <td className="hidden px-4 py-3 text-right text-slate-600 tabular-nums sm:table-cell">{r.items.length}</td>
      <td className="px-4 py-3 text-right font-medium whitespace-nowrap tabular-nums">{formatMoney(r.total)}</td>
    </tr>
  )
}
