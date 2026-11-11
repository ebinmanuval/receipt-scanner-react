// Formatting rules from the spec:
//  - money stays a string; Intl.NumberFormat formats the string exactly (no parseFloat)
//  - `date` is a calendar date — format the string, never pass it through new Date()

import type { CalendarDate, Instant, Money } from '@/api/types'

const currency = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })

export function formatMoney(value: Money | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  // format() accepts a decimal string and formats it without float conversion.
  return currency.format(value as unknown as number)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2025-12-20" → "20 Dec 2025" (string only — no timezone shift possible). */
export function formatDate(value: CalendarDate | null | undefined): string {
  if (!value) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return value
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
}

/** "2026-09" → "Sep 2026" */
export function formatMonth(value: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(value)
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : value
}

const instantFmt = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' })

/** UTC instant shown in local time — fine, it's a moment, not a date. */
export function formatInstant(value: Instant | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : instantFmt.format(d)
}
