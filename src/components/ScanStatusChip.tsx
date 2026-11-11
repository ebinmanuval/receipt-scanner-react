import type { ScanStatus } from '@/api/types'
import { cn } from '@/lib/cn'
import { Spinner } from './ui/Spinner'

const styles: Record<ScanStatus, { label: string; cls: string }> = {
  queued: { label: 'Queued', cls: 'bg-slate-100 text-slate-700' },
  processing: { label: 'Reading', cls: 'bg-sky-100 text-sky-800' },
  pending: { label: 'Ready for review', cls: 'bg-amber-100 text-amber-900' },
  accepted: { label: 'Accepted', cls: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'Rejected', cls: 'bg-slate-200 text-slate-700' },
  failed: { label: 'Failed', cls: 'bg-red-100 text-red-800' },
  discarded: { label: 'Discarded', cls: 'bg-slate-100 text-slate-500' },
}

export function ScanStatusChip({ status }: { status: ScanStatus }) {
  const s = styles[status] ?? { label: status, cls: 'bg-slate-100 text-slate-700' }
  const busy = status === 'queued' || status === 'processing'
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', s.cls)}>
      {busy && <Spinner className="size-3 border-current/30 border-t-current" />}
      {s.label}
    </span>
  )
}
