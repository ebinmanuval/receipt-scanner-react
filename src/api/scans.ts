import { useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post, upload } from './client'
import { queryKeys } from './queries'
import { useLimitedPolling } from './polling'
import type { ApproveScanBody, ApproveScanResponse, Page, Scan, ScanStatus } from './types'

export const scanKeys = {
  all: ['scans'] as const,
  list: (status: string, page: number) => ['scans', 'list', status, page] as const,
  detail: (id: number) => ['scans', 'detail', id] as const,
}

export const isExtracting = (s: ScanStatus) => s === 'queued' || s === 'processing'

/** Thumbnail URL for a scan (derived JPEG — the original is often HEIC). */
export function scanThumbnailUrl(scan: Scan): string | null {
  if (scan.thumbnail_url !== undefined) return scan.thumbnail_url
  return scan.stored?.thumbnail ? `/api/scans/${scan.scan_id}/thumbnail/` : null
}

export function scanImageUrl(scan: Scan): string | null {
  if (scan.image_url !== undefined) return scan.image_url
  return scan.stored ? `/api/scans/${scan.scan_id}/image/` : null
}

/** Polls every 30 s while anything visible is still being read; stops after 5 checks. */
export function useScans(status: string, page: number) {
  return useLimitedPolling({
    queryKey: scanKeys.list(status, page),
    queryFn: () => get<Page<Scan>>('/api/scans/', { status, page }),
    keepPrevious: true,
    isActive: (d) => !!d?.results.some((s) => isExtracting(s.scan_status)),
  })
}

/** Polls every 30 s while the scan is queued/processing; stops after 5 checks. */
export function useScan(id: number) {
  return useLimitedPolling({
    queryKey: scanKeys.detail(id),
    queryFn: () => get<Scan>(`/api/scans/${id}/`),
    isActive: (d) => !!d && isExtracting(d.scan_status),
  })
}

export function uploadScan(file: File, clientUuid: string): Promise<Scan> {
  const form = new FormData()
  form.append('image', file, file.name)
  form.append('client_uuid', clientUuid)
  if (file.lastModified) form.append('captured_at', new Date(file.lastModified).toISOString())
  return upload<Scan>('/api/scans/', form)
}

/** First pending scan other than `exceptId`, for "go to next". */
export async function findNextPending(exceptId: number): Promise<number | null> {
  const page = await get<Page<Scan>>('/api/scans/', { status: 'pending', page_size: 5 })
  return page.results.find((s) => s.scan_id !== exceptId)?.scan_id ?? null
}

function useInvalidateScans() {
  const qc = useQueryClient()
  return (scan?: Scan) => {
    if (scan?.scan_id && scan.extraction) qc.setQueryData(scanKeys.detail(scan.scan_id), scan)
    else qc.invalidateQueries({ queryKey: ['scans', 'detail'] })
    qc.invalidateQueries({ queryKey: ['scans', 'list'] })
    qc.invalidateQueries({ queryKey: queryKeys.scanCounts })
  }
}

export function useApproveScan(id: number) {
  const invalidate = useInvalidateScans()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ApproveScanBody) => post<ApproveScanResponse>(`/api/scans/${id}/approve/`, body),
    onSuccess: (res) => {
      invalidate(res.scan)
      qc.invalidateQueries({ queryKey: ['receipts'] })
      qc.invalidateQueries({ queryKey: ['reconcile'] })
    },
  })
}

export function useRejectScan(id: number) {
  const invalidate = useInvalidateScans()
  return useMutation({
    mutationFn: (rerun: boolean) => post<Scan>(`/api/scans/${id}/reject/`, rerun ? { rerun: true } : {}),
    onSuccess: (scan) => invalidate(scan),
    onError: () => invalidate(),
  })
}

export function useRerunScan(id: number) {
  const invalidate = useInvalidateScans()
  return useMutation({
    mutationFn: () => post<Scan>(`/api/scans/${id}/rerun/`),
    onSuccess: (scan) => invalidate(scan),
    onError: () => invalidate(),
  })
}
