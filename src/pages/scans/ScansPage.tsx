import { Link, useSearchParams } from 'react-router-dom'
import { scanThumbnailUrl, useScans } from '@/api/scans'
import { useScanCounts } from '@/api/queries'
import { MAX_POLLS } from '@/api/polling'
import type { Scan } from '@/api/types'
import { AuthImage } from '@/components/AuthImage'
import { ScanStatusChip } from '@/components/ScanStatusChip'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { Tabs } from '@/components/ui/Tabs'
import { formatDate, formatInstant, formatMoney } from '@/lib/format'

type Tab = 'pending' | 'progress' | 'failed' | 'accepted'

const TAB_STATUS: Record<Tab, string> = {
  pending: 'pending',
  progress: 'queued,processing',
  failed: 'failed,rejected',
  accepted: 'accepted',
}

const EMPTY: Record<Tab, string> = {
  pending: 'Nothing waiting for review.',
  progress: 'Nothing being read right now.',
  failed: 'No failed or rejected scans.',
  accepted: 'No accepted scans yet.',
}

function tabFromParam(v: string | null): Tab {
  if (v === 'progress' || v === 'failed' || v === 'accepted') return v
  return 'pending'
}

export function ScansPage() {
  const [params, setParams] = useSearchParams()
  const tab = tabFromParam(params.get('status'))
  const page = Math.max(1, Number(params.get('page')) || 1)

  const counts = useScanCounts().data
  const { query, stalled, checkAgain } = useScans(TAB_STATUS[tab], page)

  const setTab = (t: Tab) => setParams({ status: t })
  const setPage = (p: number) => setParams({ status: tab, page: String(p) })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Scans</h1>
        <Link to="/scans/upload">
          <Button>Upload</Button>
        </Link>
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { value: 'pending', label: 'Pending review', count: counts?.pending },
          { value: 'progress', label: 'In progress', count: counts?.extracting },
          { value: 'failed', label: 'Failed / Rejected' },
          { value: 'accepted', label: 'Accepted' },
        ]}
      />

      {stalled && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
          <span className="text-slate-600">Some scans are still being read. Auto-refresh paused after {MAX_POLLS} checks.</span>
          <Button variant="secondary" loading={query.isFetching} onClick={() => checkAgain()}>
            Check again
          </Button>
        </div>
      )}

      <Card className="p-0 sm:p-0">
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          isPastEnd(query.error) && page > 1 ? (
            <EmptyState title="That page doesn't exist any more.">
              <button className="underline" onClick={() => setPage(1)}>
                Go to the first page
              </button>
            </EmptyState>
          ) : (
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          )
        ) : query.data.results.length === 0 ? (
          <EmptyState title={EMPTY[tab]}>
            {tab === 'pending' && (
              <Link to="/scans/upload" className="underline">
                Upload receipts
              </Link>
            )}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {query.data.results.map((scan) => (
              <ScanRow key={scan.scan_id} scan={scan} />
            ))}
          </ul>
        )}
      </Card>

      {query.data && query.data.results.length > 0 && (
        <Pagination page={query.data.page} pages={query.data.pages} count={query.data.count} onPage={setPage} />
      )}
    </div>
  )
}

function isPastEnd(e: unknown) {
  return typeof e === 'object' && e !== null && 'status' in e && (e as { status: number }).status === 404
}

function ScanRow({ scan }: { scan: Scan }) {
  const proposed = scan.extraction?.proposed
  return (
    <li>
      <Link to={`/scans/${scan.scan_id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
        <AuthImage
          src={scanThumbnailUrl(scan)}
          alt=""
          className="size-14 shrink-0 rounded-md border border-slate-200 object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {proposed?.shop || <span className="text-slate-400">Scan #{scan.scan_id}</span>}
          </p>
          <p className="truncate text-xs text-slate-500">
            {proposed?.date ? `${formatDate(proposed.date)} · ` : ''}
            Uploaded {formatInstant(scan.uploaded_at)}
          </p>
          {scan.scan_status === 'failed' && scan.extraction?.error && (
            <p className="truncate text-xs text-red-700">{scan.extraction.error}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {proposed?.total && <span className="text-sm font-medium tabular-nums">{formatMoney(proposed.total)}</span>}
          <ScanStatusChip status={scan.scan_status} />
        </div>
      </Link>
    </li>
  )
}
