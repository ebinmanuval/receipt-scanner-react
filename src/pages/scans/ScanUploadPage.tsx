import { useCallback, useReducer, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { get, isApiError } from '@/api/client'
import { isExtracting, scanKeys, uploadScan } from '@/api/scans'
import { queryKeys } from '@/api/queries'
import { MAX_POLLS, PollBudget } from '@/api/polling'
import type { Scan } from '@/api/types'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { ScanStatusChip } from '@/components/ScanStatusChip'
import { newUuid } from '@/lib/uuid'
import { cn } from '@/lib/cn'

const MAX_BYTES = 15 * 1024 * 1024
const ACCEPT = '.jpg,.jpeg,.png,.heic,.heif,.webp,image/jpeg,image/png,image/heic,image/heif,image/webp'
const OK_EXT = /\.(jpe?g|png|heic|heif|webp)$/i
const OK_TYPE = /^image\/(jpeg|png|heic|heif|webp)$/i

type RowState =
  | { kind: 'uploading' }
  | { kind: 'uploaded'; scanId: number; alreadyUploaded: boolean; duplicateOf: number | null }
  | { kind: 'error'; message: string; retryable: boolean }

interface Row {
  key: string
  file: File
  /** Stable per file so a retry can't store a second copy. */
  clientUuid: string
  state: RowState
}

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function validate(file: File): string | null {
  if (!OK_TYPE.test(file.type) && !OK_EXT.test(file.name)) return 'Not a JPEG, PNG, HEIC or WEBP image.'
  if (file.size > MAX_BYTES) return `Too large (${formatBytes(file.size)}). Max 15 MB.`
  if (file.size === 0) return 'The file is empty.'
  return null
}

function errorMessage(e: unknown): { message: string; retryable: boolean } {
  if (isApiError(e)) {
    switch (e.code) {
      case 'image_too_large':
        return { message: 'Too large for the server (max 15 MB).', retryable: false }
      case 'invalid_image':
        return { message: "The server couldn't read this image.", retryable: false }
      case 'no_file':
        return { message: 'No file was received.', retryable: true }
      case 'storage_unavailable':
        return { message: 'Server storage is unavailable. Try again later.', retryable: true }
      case 'network_error':
        return { message: 'Network error.', retryable: true }
      default:
        return { message: e.message, retryable: e.status >= 500 || e.status === 0 }
    }
  }
  return { message: 'Upload failed.', retryable: true }
}

export function ScanUploadPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const update = (key: string, state: RowState) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, state } : r)))

  const send = useCallback(
    async (row: Row) => {
      update(row.key, { kind: 'uploading' })
      try {
        const scan = await uploadScan(row.file, row.clientUuid)
        qc.setQueryData(scanKeys.detail(scan.scan_id), scan)
        update(row.key, {
          kind: 'uploaded',
          scanId: scan.scan_id,
          alreadyUploaded: !!scan.already_uploaded,
          duplicateOf: scan.possible_duplicate_of ?? null,
        })
        qc.invalidateQueries({ queryKey: ['scans', 'list'] })
        qc.invalidateQueries({ queryKey: queryKeys.scanCounts })
      } catch (e) {
        update(row.key, { kind: 'error', ...errorMessage(e) })
      }
    },
    [qc],
  )

  const addFiles = (files: FileList | File[]) => {
    const added: Row[] = Array.from(files).map((file) => {
      const problem = validate(file)
      return {
        key: newUuid(),
        file,
        clientUuid: newUuid(),
        state: problem ? { kind: 'error', message: problem, retryable: false } : { kind: 'uploading' },
      }
    })
    setRows((rs) => [...added, ...rs])
    // Upload a few at a time; originals can be several MB each.
    const queue = added.filter((r) => r.state.kind === 'uploading')
    const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length) await send(queue.shift()!)
    })
    void Promise.all(workers)
  }

  // Poll each uploaded scan every 30 s until extraction finishes; at most 5 checks each.
  const budget = useRef(new PollBudget()).current
  const [, rerender] = useReducer((x: number) => x + 1, 0)
  const uploadedIds = rows.flatMap((r) => (r.state.kind === 'uploaded' ? [r.state.scanId] : []))
  const scanQueries = useQueries({
    queries: uploadedIds.map((id) => ({
      queryKey: scanKeys.detail(id),
      queryFn: () => get<Scan>(`/api/scans/${id}/`),
      refetchInterval: (q: { queryKey: readonly unknown[]; state: { data?: Scan; dataUpdateCount: number; errorUpdateCount: number } }) =>
        budget.interval(q.queryKey, q.state, !!q.state.data && isExtracting(q.state.data.scan_status)),
    })),
  })
  const scanById = new Map<number, Scan>()
  scanQueries.forEach((q, i) => {
    // Subscribe to fetch completions so `stalled` is re-evaluated even when data is unchanged.
    void q.dataUpdatedAt
    void q.errorUpdatedAt
    if (q.data) scanById.set(uploadedIds[i], q.data)
  })

  const isStalled = (scan?: Scan) => {
    if (!scan || !isExtracting(scan.scan_status)) return false
    const state = qc.getQueryState(scanKeys.detail(scan.scan_id))
    return !!state && budget.stalled(scanKeys.detail(scan.scan_id), state, true)
  }
  const checkAgain = (scanId: number) => {
    const key = scanKeys.detail(scanId)
    const state = qc.getQueryState(key)
    if (state) budget.reset(key, state)
    rerender()
    void qc.refetchQueries({ queryKey: key, exact: true })
  }

  const readyCount = [...scanById.values()].filter((s) => s.scan_status === 'pending').length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Upload receipts</h1>
        <Link to="/scans" className="text-sm text-slate-600 underline">
          All scans
        </Link>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
        }}
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-12 text-center transition-colors',
          dragging ? 'border-slate-900 bg-slate-100' : 'border-slate-300 bg-white',
        )}
      >
        <p className="font-medium">Drop receipt photos here</p>
        <p className="mt-1 text-sm text-slate-500">JPEG, PNG, HEIC or WEBP · up to 15 MB each · sent as-is</p>
        <Button className="mt-4" onClick={() => inputRef.current?.click()}>
          Choose files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {rows.length > 0 && (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => (
              <UploadRow
                key={row.key}
                row={row}
                scan={row.state.kind === 'uploaded' ? scanById.get(row.state.scanId) : undefined}
                stalled={row.state.kind === 'uploaded' && isStalled(scanById.get(row.state.scanId))}
                onRetry={() => send(row)}
                onCheckAgain={() => row.state.kind === 'uploaded' && checkAgain(row.state.scanId)}
              />
            ))}
          </ul>
        </Card>
      )}

      {readyCount > 0 && (
        <div className="flex justify-end">
          <Link to="/scans?status=pending">
            <Button>Review {readyCount} ready</Button>
          </Link>
        </div>
      )}
    </div>
  )
}

function UploadRow({
  row,
  scan,
  stalled,
  onRetry,
  onCheckAgain,
}: {
  row: Row
  scan?: Scan
  stalled: boolean
  onRetry: () => void
  onCheckAgain: () => void
}) {
  const { state } = row
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{row.file.name}</p>
        <p className="text-xs text-slate-500">{formatBytes(row.file.size)}</p>
        {state.kind === 'uploaded' && state.duplicateOf && (
          <p className="mt-1 text-xs text-amber-700">
            Looks identical to{' '}
            <Link to={`/scans/${state.duplicateOf}`} className="underline">
              scan #{state.duplicateOf}
            </Link>
            . Kept anyway — reject one if it's a duplicate.
          </p>
        )}
        {state.kind === 'uploaded' && state.alreadyUploaded && (
          <p className="mt-1 text-xs text-emerald-700">Already uploaded — using the existing scan.</p>
        )}
        {state.kind === 'error' && <p className="mt-1 text-xs text-red-700">{state.message}</p>}
        {stalled && (
          <p className="mt-1 text-xs text-amber-700">Still reading after {MAX_POLLS} checks — automatic checking stopped.</p>
        )}
        {scan?.scan_status === 'failed' && scan.extraction.error && (
          <p className="mt-1 text-xs text-red-700">{scan.extraction.error}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {state.kind === 'uploading' && (
          <span className="inline-flex items-center gap-2 text-xs text-slate-600">
            <Spinner className="size-3" /> Uploading
          </span>
        )}
        {state.kind === 'error' && state.retryable && (
          <Button variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        )}
        {stalled && (
          <Button variant="secondary" onClick={onCheckAgain}>
            Check again
          </Button>
        )}
        {state.kind === 'uploaded' && (scan ? <ScanStatusChip status={scan.scan_status} /> : <Spinner className="size-3" />)}
        {state.kind === 'uploaded' && scan?.scan_status === 'pending' && (
          <Link to={`/scans/${scan.scan_id}`} className="text-sm font-medium underline">
            Review
          </Link>
        )}
        {state.kind === 'uploaded' && scan && scan.scan_status !== 'pending' && !isExtracting(scan.scan_status) && (
          <Link to={`/scans/${scan.scan_id}`} className="text-sm underline">
            Open
          </Link>
        )}
      </div>
    </li>
  )
}
