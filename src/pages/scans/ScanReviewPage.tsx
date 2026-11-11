import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useFieldArray, useForm, useWatch, type Control, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { isApiError, type ApiError } from '@/api/client'
import { MAX_POLLS } from '@/api/polling'
import {
  findNextPending,
  isExtracting,
  scanImageUrl,
  scanKeys,
  scanThumbnailUrl,
  useApproveScan,
  useRejectScan,
  useRerunScan,
  useScan,
} from '@/api/scans'
import type { ApproveScanBody, ApproveScanResponse, ExtractionCheck, ProposedReceipt, Scan } from '@/api/types'
import { AuthImage, openAuthImage } from '@/components/AuthImage'
import { ScanStatusChip } from '@/components/ScanStatusChip'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { formatDate, formatInstant, formatMoney } from '@/lib/format'
import { diffMoney, isNegative, isZero, sameNumber, sumMoney, trimQty } from '@/lib/money'

// ---------------------------------------------------------------- form schema

const money = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Use an amount like 12.50')
const qty = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/, 'Use a number like 1 or 0.616')

const schema = z.object({
  shop: z.string().trim().min(1, 'Enter the shop'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  total: money,
  items: z.array(
    z.object({
      item: z.string().trim().min(1, 'Enter the item'),
      qty,
      price: money,
    }),
  ),
})
type FormValues = z.infer<typeof schema>

function defaultsFrom(p: ProposedReceipt): FormValues {
  return {
    shop: p.shop ?? '',
    date: p.date ?? '',
    total: p.total ?? '',
    items: (p.items ?? []).map((i) => ({ item: i.item, qty: trimQty(i.qty), price: i.price })),
  }
}

/** Only the fields the user changed. `items` replaces the whole list, so send all of it if any line changed. */
function changedFields(v: FormValues, p: ProposedReceipt): ApproveScanBody {
  const body: ApproveScanBody = {}
  if (v.shop.trim() !== (p.shop ?? '').trim()) body.shop = v.shop.trim()
  if (v.date !== p.date) body.date = v.date
  if (!sameNumber(v.total, p.total)) body.total = v.total.trim()
  const pi = p.items ?? []
  const itemsChanged =
    v.items.length !== pi.length ||
    v.items.some(
      (it, i) =>
        it.item.trim() !== pi[i].item.trim() || !sameNumber(it.qty, pi[i].qty) || !sameNumber(it.price, pi[i].price),
    )
  if (itemsChanged) {
    body.items = v.items.map((it) => ({ item: it.item.trim(), qty: it.qty.trim(), price: it.price.trim() }))
  }
  return body
}

/** "items[0].price" / "items.0.price" → "items.0.price" */
function toFieldPath(key: string): string {
  return key.replace(/\[(\d+)\]/g, '.$1')
}

// ---------------------------------------------------------------- page

export function ScanReviewPage() {
  const id = Number(useParams().id)
  const { query, stalled, checkAgain } = useScan(id)

  if (!Number.isFinite(id)) return <ErrorState error={new Error('Bad scan id')} />
  if (query.isPending) return <LoadingState />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />

  const scan = query.data
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/scans" className="text-sm text-slate-600 underline">
          ← Scans
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">Scan #{scan.scan_id}</h1>
        <ScanStatusChip status={scan.scan_status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <PhotoPanel scan={scan} />
        <div className="min-w-0 space-y-4">
          <ScanBody scan={scan} stalled={stalled} checking={query.isFetching} onCheckAgain={checkAgain} />
        </div>
      </div>
    </div>
  )
}

function ScanBody({
  scan,
  stalled,
  checking,
  onCheckAgain,
}: {
  scan: Scan
  stalled: boolean
  checking: boolean
  onCheckAgain: () => void
}) {
  const ex = scan.extraction

  if (isExtracting(scan.scan_status)) {
    return (
      <Card className="flex flex-wrap items-center gap-3">
        {stalled ? <span className="size-5 rounded-full bg-amber-400" /> : <Spinner />}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{scan.scan_status === 'queued' ? 'Waiting to be read…' : 'Reading the receipt…'}</p>
          <p className="text-sm text-slate-500">
            {stalled
              ? `Still not finished after ${MAX_POLLS} checks, so automatic checking has stopped.`
              : 'Usually 20 s – 3 min. Checked every 30 s.'}
            {ex.attempts > 0 && ` Attempt ${ex.attempts + 1}.`}
          </p>
        </div>
        <div className="flex gap-2">
          {stalled && (
            <Button type="button" loading={checking} onClick={onCheckAgain}>
              Check again
            </Button>
          )}
          {scan.actions.rerun && <RerunButton scan={scan} label="Restart" />}
        </div>
      </Card>
    )
  }

  if (scan.scan_status === 'accepted') {
    return (
      <Card>
        <p className="font-medium">Accepted{scan.reviewed_at ? ` ${formatInstant(scan.reviewed_at)}` : ''}.</p>
        {scan.receipt_id && (
          <Link to={`/receipts/${scan.receipt_id}`} className="mt-2 inline-block text-sm underline">
            Open receipt #{scan.receipt_id}
          </Link>
        )}
      </Card>
    )
  }

  if (scan.scan_status === 'pending' && ex.proposed) {
    return (
      <ReviewForm
        // Re-mount with fresh defaults when a new extraction lands.
        key={`${scan.scan_id}-${ex.extracted_at ?? ''}-${ex.attempts}`}
        scan={scan}
        proposed={ex.proposed}
      />
    )
  }

  // failed / rejected / discarded
  return (
    <Card className="space-y-3">
      {scan.scan_status === 'failed' && (
        <Alert tone="error">
          <p className="font-medium">Extraction failed.</p>
          {ex.error && <p className="mt-1">{ex.error}</p>}
        </Alert>
      )}
      {scan.scan_status === 'rejected' && <p className="text-sm text-slate-600">The proposal was rejected. The photo is kept.</p>}
      {scan.scan_status === 'discarded' && <p className="text-sm text-slate-600">This scan was discarded.</p>}
      {scan.actions.rerun && <RerunButton scan={scan} label="Re-run extraction" />}
    </Card>
  )
}

// ---------------------------------------------------------------- photo

function PhotoPanel({ scan }: { scan: Scan }) {
  const [zoomed, setZoomed] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const thumb = scanThumbnailUrl(scan)
  const original = scanImageUrl(scan)

  return (
    <Card className="space-y-3 self-start p-3 sm:p-3 lg:sticky lg:top-20">
      <div
        className={cn(
          'overflow-auto rounded-md bg-slate-100',
          zoomed ? 'max-h-[75vh] cursor-zoom-out' : 'max-h-[60vh] cursor-zoom-in lg:max-h-[75vh]',
        )}
        onClick={() => setZoomed((z) => !z)}
      >
        <AuthImage
          src={thumb ?? original}
          alt={`Receipt photo for scan ${scan.scan_id}`}
          className={cn(zoomed ? 'w-[200%] max-w-none' : 'mx-auto h-auto max-h-[60vh] w-full object-contain lg:max-h-[75vh]')}
          fallback={<div className="flex h-64 items-center justify-center text-sm text-slate-400">No photo</div>}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {scan.stored
            ? `${scan.stored.format} ${scan.stored.width}×${scan.stored.height} · ${scan.stored.megapixels} MP`
            : 'No stored image'}
        </span>
        <div className="flex gap-3">
          <button className="underline" onClick={() => setZoomed((z) => !z)}>
            {zoomed ? 'Fit' : 'Zoom'}
          </button>
          {original && (
            <button
              className="underline"
              onClick={() => {
                setOpenError(null)
                openAuthImage(original).catch((e: Error) => setOpenError(e.message))
              }}
            >
              View original
            </button>
          )}
        </div>
      </div>
      {openError && <p className="text-xs text-red-700">{openError}</p>}
    </Card>
  )
}

// ---------------------------------------------------------------- review form

const CHECK_TEXT: Record<ExtractionCheck, { tone: 'success' | 'info' | 'warning'; text: string }> = {
  ok: { tone: 'success', text: 'Items added up to the total first time.' },
  retried: { tone: 'info', text: 'Items add up after the model re-read the receipt.' },
  check: { tone: 'warning', text: 'The re-read "fixed" it by changing the total — check the total closely.' },
  mismatch: { tone: 'warning', text: "The items still don't add up to the total." },
}

function ReviewForm({ scan, proposed }: { scan: Scan; proposed: ProposedReceipt }) {
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const approve = useApproveScan(scan.scan_id)
  const reject = useRejectScan(scan.scan_id)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaultsFrom(proposed) })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  const ex = scan.extraction
  const check = ex.check
  const emphasise = (check && check !== 'ok') || ex.notes.length > 0

  const handleStale = (e: ApiError) => {
    if (e.body?.scan) qc.setQueryData(scanKeys.detail(scan.scan_id), e.body.scan)
    else qc.invalidateQueries({ queryKey: scanKeys.detail(scan.scan_id) })
    toast({ title: 'This scan changed — refreshed.', tone: 'info' })
  }

  const onApprove = async (values: FormValues) => {
    setFormError(null)
    try {
      const res = await approve.mutateAsync(changedFields(values, proposed))
      toast({ title: `Saved receipt #${res.receipt_id}`, tone: 'success', description: approveSummary(res), duration: 8000 })
      const next = await findNextPending(scan.scan_id).catch(() => null)
      if (next) navigate(`/scans/${next}`)
      else {
        toast({ title: 'All caught up — nothing else to review.', tone: 'info' })
        navigate('/scans?status=pending')
      }
    } catch (e) {
      if (!isApiError(e)) return setFormError('Something went wrong.')
      if (e.code === 'invalid_state') return handleStale(e)
      if (e.code === 'validation_error' && e.errors) {
        const leftover: string[] = []
        for (const [key, msgs] of Object.entries(e.errors)) {
          const path = toFieldPath(key)
          if (/^(shop|date|total|items(\.\d+(\.(item|qty|price))?)?)$/.test(path)) {
            setError(path as FieldPath<FormValues>, { message: msgs.join(' ') })
            if (path === 'items') leftover.push(`Items: ${msgs.join(' ')}`)
          } else {
            leftover.push(`${key}: ${msgs.join(' ')}`)
          }
        }
        setFormError(leftover.length ? leftover.join(' ') : e.message)
        return
      }
      setFormError(e.message)
    }
  }

  const onReject = async (rerun: boolean) => {
    setFormError(null)
    try {
      await reject.mutateAsync(rerun)
      toast({ title: rerun ? 'Rejected — reading it again.' : 'Rejected. The photo is kept.', tone: 'info' })
    } catch (e) {
      if (isApiError(e) && e.code === 'invalid_state') return handleStale(e)
      setFormError(isApiError(e) ? e.message : 'Something went wrong.')
    }
  }

  const busy = approve.isPending || reject.isPending

  return (
    <form onSubmit={handleSubmit(onApprove)} noValidate className="space-y-4">
      {check && (
        <Alert tone={CHECK_TEXT[check].tone} className={cn(emphasise && 'border-2')}>
          <p className={cn(check !== 'ok' && 'font-medium')}>{CHECK_TEXT[check].text}</p>
          {ex.notes.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {ex.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      {!check && ex.notes.length > 0 && (
        <Alert tone="warning">
          <ul className="list-disc pl-5">
            {ex.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Alert>
      )}
      {formError && <Alert tone="error">{formError}</Alert>}

      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Shop" htmlFor="shop" error={errors.shop?.message}>
              <Input id="shop" invalid={!!errors.shop} {...register('shop')} />
            </Field>
          </div>
          <Field label="Date" htmlFor="date" error={errors.date?.message}>
            <Input id="date" type="date" invalid={!!errors.date} {...register('date')} />
          </Field>
          <Field label="Total" htmlFor="total" error={errors.total?.message}>
            <Input id="total" inputMode="decimal" invalid={!!errors.total} className="tabular-nums" {...register('total')} />
          </Field>
        </div>
        {proposed.category && (
          <p className="text-sm text-slate-600">
            Category: <span className="font-medium text-slate-900">{proposed.category.full_name}</span>{' '}
            <span className="text-xs text-slate-400">({proposed.category.source === 'rule' ? 'shop rule' : 'suggested'})</span>
          </p>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Items</h2>
          <span className="text-xs text-slate-500">Price is the line total</span>
        </div>

        {fields.length === 0 && <p className="text-sm text-slate-500">No items.</p>}

        <div className="hidden grid-cols-[minmax(0,1fr)_5rem_7rem_2rem] gap-2 text-xs font-medium text-slate-500 sm:grid">
          <span>Item</span>
          <span>Qty</span>
          <span>Price</span>
          <span />
        </div>
        <ul className="space-y-3 sm:space-y-2">
          {fields.map((f, i) => {
            const e = errors.items?.[i]
            return (
              <li
                key={f.id}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] gap-2 border-b border-slate-100 pb-3 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_2rem] sm:border-0 sm:pb-0"
              >
                <div className="col-span-3 sm:col-span-1">
                  <Input aria-label={`Item ${i + 1}`} invalid={!!e?.item} {...register(`items.${i}.item`)} />
                  {e?.item && <p className="mt-1 text-xs text-red-600">{e.item.message}</p>}
                </div>
                <div>
                  <Input
                    aria-label={`Quantity ${i + 1}`}
                    placeholder="Qty"
                    inputMode="decimal"
                    className="tabular-nums"
                    invalid={!!e?.qty}
                    {...register(`items.${i}.qty`)}
                  />
                  {e?.qty && <p className="mt-1 text-xs text-red-600">{e.qty.message}</p>}
                </div>
                <div>
                  <Input
                    aria-label={`Line total ${i + 1}`}
                    placeholder="Line total"
                    inputMode="decimal"
                    className="tabular-nums"
                    invalid={!!e?.price}
                    {...register(`items.${i}.price`)}
                  />
                  {e?.price && <p className="mt-1 text-xs text-red-600">{e.price.message}</p>}
                </div>
                <button
                  type="button"
                  aria-label={`Remove item ${i + 1}`}
                  className="h-9 rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-600"
                  onClick={() => remove(i)}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
        {errors.items?.root?.message && <p className="text-sm text-red-600">{errors.items.root.message}</p>}
        {errors.items?.message && <p className="text-sm text-red-600">{errors.items.message}</p>}

        <Button type="button" variant="secondary" onClick={() => append({ item: '', qty: '1', price: '' })}>
          Add item
        </Button>

        <TotalsCheck control={control} />
      </Card>

      <div className="flex flex-wrap gap-2">
        {scan.actions.approve && (
          <Button type="submit" loading={approve.isPending} disabled={busy}>
            Approve
          </Button>
        )}
        {scan.actions.reject && (
          <>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => onReject(false)}>
              Reject
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => onReject(true)}>
              Reject &amp; re-run
            </Button>
          </>
        )}
        {scan.actions.rerun && <RerunButton scan={scan} label="Re-run" />}
      </div>

      <p className="text-xs text-slate-400">
        Read in {ex.seconds ?? '—'} s · {ex.attempts} attempt{ex.attempts === 1 ? '' : 's'}
        {ex.extracted_at ? ` · ${formatInstant(ex.extracted_at)}` : ''}
        {proposed.date ? ` · receipt dated ${formatDate(proposed.date)}` : ''}
      </p>
    </form>
  )
}

/** Live: sum of line totals vs the total. */
function TotalsCheck({ control }: { control: Control<FormValues> }) {
  const items = useWatch({ control, name: 'items' }) ?? []
  const total = useWatch({ control, name: 'total' })
  const sum = sumMoney(items.map((i) => i?.price))
  const diff = diffMoney(sum, total)

  if (items.length === 0) return null
  if (diff === null) return <p className="text-sm text-slate-500">Items sum to {formatMoney(sum)}.</p>
  if (isZero(diff)) {
    return <p className="text-sm text-emerald-700">Items sum to {formatMoney(sum)} — matches the total.</p>
  }
  const abs = diff.replace('-', '')
  return (
    <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
      Items sum to <strong>{formatMoney(sum)}</strong>, total says <strong>{formatMoney(total)}</strong> —{' '}
      {formatMoney(abs)} {isNegative(diff) ? 'less' : 'more'} than the total.
    </p>
  )
}

function approveSummary(res: ApproveScanResponse) {
  const parts: string[] = []
  if (res.edited?.length) parts.push(`Corrected: ${res.edited.join(', ')}.`)
  if (res.totals && !res.totals.reconciles) parts.push(res.totals.note || "Items don't add up to the total.")
  if (res.bank_match) {
    const m = res.bank_match
    if (typeof m.transaction_id === 'number') parts.push(`Matched to bank transaction #${m.transaction_id}.`)
    else if (typeof m.bucket === 'string') parts.push(`Bank match: ${m.bucket}.`)
    else parts.push('Bank match checked.')
  }
  return parts.length ? parts.join(' ') : undefined
}

function RerunButton({ scan, label }: { scan: Scan; label: string }) {
  const rerun = useRerunScan(scan.scan_id)
  const toast = useToast()
  const qc = useQueryClient()
  return (
    <Button
      type="button"
      variant="secondary"
      loading={rerun.isPending}
      onClick={async () => {
        try {
          await rerun.mutateAsync()
          toast({ title: 'Queued for another read.', tone: 'info' })
        } catch (e) {
          if (isApiError(e) && e.code === 'invalid_state') {
            if (e.body?.scan) qc.setQueryData(scanKeys.detail(scan.scan_id), e.body.scan)
            toast({ title: 'This scan changed — refreshed.', tone: 'info' })
          } else {
            toast({ title: 'Re-run failed', description: isApiError(e) ? e.message : undefined, tone: 'error' })
          }
        }
      }}
    >
      {label}
    </Button>
  )
}
