import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { isApiError } from '@/api/client'
import { useDeleteReceipt, useReceipt } from '@/api/receipts'
import type { Receipt } from '@/api/types'
import { AuthImage, openAuthImage } from '@/components/AuthImage'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { formatDate, formatInstant, formatMoney } from '@/lib/format'
import { diffMoney, isNegative, isZero, sumMoney, trimQty } from '@/lib/money'

export function ReceiptDetailPage() {
  const id = Number(useParams().id)
  const query = useReceipt(id)

  if (query.isPending) return <LoadingState />
  if (query.isError) {
    if (isApiError(query.error) && query.error.code === 'not_found') {
      return (
        <EmptyState title="Receipt not found.">
          <Link to="/receipts" className="underline">
            Back to receipts
          </Link>
        </EmptyState>
      )
    }
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  }
  return <ReceiptDetail r={query.data} />
}

function ReceiptDetail({ r }: { r: Receipt }) {
  const navigate = useNavigate()
  const toast = useToast()
  const del = useDeleteReceipt(r.id)
  const [confirming, setConfirming] = useState(false)

  const sum = sumMoney(r.items.map((i) => i.price))
  const diff = diffMoney(sum, r.total)

  const onDelete = async () => {
    try {
      await del.mutateAsync()
      setConfirming(false)
      toast({ title: `Deleted receipt #${r.id}`, tone: 'success' })
      navigate('/receipts', { replace: true })
    } catch (e) {
      setConfirming(false)
      toast({ title: 'Delete failed', description: isApiError(e) ? e.message : undefined, tone: 'error' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/receipts" className="text-sm text-slate-600 underline">
          ← Receipts
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold tracking-tight">{r.shop}</h1>
        <Button variant="secondary" className="text-red-700" onClick={() => setConfirming(true)}>
          Delete
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card className="self-start p-3 sm:p-3">
          {r.image_url ? (
            <>
              <AuthImage
                src={r.image_url}
                alt={`Receipt from ${r.shop}`}
                className="mx-auto h-auto max-h-[75vh] w-full rounded-md object-contain"
              />
              <button
                className="mt-2 text-xs text-slate-500 underline"
                onClick={() => openAuthImage(r.image_url!).catch(() => toast({ title: 'Could not open the photo', tone: 'error' }))}
              >
                Open full size
              </button>
            </>
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-slate-400">No photo</div>
          )}
        </Card>

        <div className="min-w-0 space-y-4">
          {r.needs_review && (
            <Alert tone="warning">
              <p className="font-medium">Needs review</p>
              {r.review_note && <p className="mt-1">{r.review_note}</p>}
            </Alert>
          )}

          <Card>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-slate-500">Date</dt>
                <dd className="font-medium">{formatDate(r.date)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Total</dt>
                <dd className="font-medium tabular-nums">{formatMoney(r.total)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Category</dt>
                <dd className="font-medium">{r.category?.full_name ?? '—'}</dd>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-slate-500">Bank transaction</dt>
                <dd className="font-medium">
                  {r.bank_transaction_id ? `Linked to transaction #${r.bank_transaction_id}` : 'Not linked'}
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="p-0 sm:p-0">
            <h2 className="px-4 pt-4 font-medium">Items</h2>
            {r.items.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-500">No line items.</p>
            ) : (
              <table className="mt-2 w-full table-fixed text-sm">
                <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Item</th>
                    <th className="w-16 px-2 py-2 text-right font-medium">Qty</th>
                    <th className="hidden w-24 px-2 py-2 text-right font-medium sm:table-cell">Unit</th>
                    <th className="w-24 px-4 py-2 text-right font-medium">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {r.items.map((i) => (
                    <tr key={i.id}>
                      <td className="px-4 py-2 break-words">{i.item}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{trimQty(i.qty)}</td>
                      <td className="hidden px-2 py-2 text-right text-slate-500 tabular-nums sm:table-cell">
                        {i.unit_price ? formatMoney(i.unit_price) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatMoney(i.price)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200 text-sm">
                  <tr>
                    <td className="px-4 py-2 text-slate-500" colSpan={2}>
                      Items sum
                    </td>
                    <td className="hidden sm:table-cell" />
                    <td className="px-4 py-2 text-right font-medium tabular-nums">{formatMoney(sum)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
            {r.items.length > 0 && diff !== null && !isZero(diff) && (
              <p className="mx-4 mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Items are {formatMoney(diff.replace('-', ''))} {isNegative(diff) ? 'less' : 'more'} than the total.
              </p>
            )}
          </Card>

          <p className="text-xs text-slate-400">
            Receipt #{r.id} · added {formatInstant(r.created_at)}
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Delete this receipt?"
        confirmLabel="Delete"
        danger
        loading={del.isPending}
        onConfirm={onDelete}
        onCancel={() => setConfirming(false)}
      >
        {r.shop}, {formatDate(r.date)}, {formatMoney(r.total)}. The line items are deleted too. This can't be undone.
      </ConfirmDialog>
    </div>
  )
}
