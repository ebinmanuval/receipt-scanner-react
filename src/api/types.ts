// Types for every response in API.md. The .NET API keeps the same JSON shapes.
//
// Conventions (see API.md "Six things that will bite you"):
//  - Money / quantity / percentage values are strings: `Money`. Never parseFloat them.
//  - `date` fields are calendar dates "yyyy-MM-dd": `CalendarDate`. Never `new Date()` them.
//  - `*_at` fields are UTC instants "2026-09-20T07:16:46Z": `Instant`.

/** Decimal as a string, e.g. "20.10". */
export type Money = string
/** Percentage string with one decimal place, e.g. "-4.5". */
export type Pct = string
/** "yyyy-MM-dd" — no time, no timezone. */
export type CalendarDate = string
/** "yyyy-MM" */
export type YearMonth = string
/** ISO 8601 UTC instant. */
export type Instant = string

// ---------------------------------------------------------------- errors

export type ApiErrorCode =
  | 'not_authenticated'
  | 'token_not_valid'
  | 'invalid_credentials'
  | 'duplicate_receipt'
  | 'validation_error'
  | 'malformed_payload'
  | 'image_too_large'
  | 'match_unavailable'
  | 'not_linked'
  | 'invalid_bucket'
  | 'invalid_image'
  | 'no_file'
  | 'storage_unavailable'
  | 'invalid_state'
  | 'invalid_parameter'
  | 'not_found'
  | 'permission_denied'
  | 'server_error'
  // client-side codes
  | 'network_error'
  | 'unknown_error'
  | (string & {})

export interface ApiErrorBody {
  status: 'error'
  code: ApiErrorCode
  message: string
  errors: Record<string, string[]> | null
  // match_unavailable carries these
  transaction_id?: number
  receipt_id?: number
  // invalid_state on scans carries the current scan
  scan?: Scan
}

// ---------------------------------------------------------------- pagination

export interface Page<T> {
  count: number
  page: number
  pages: number
  page_size?: number
  has_next: boolean
  has_previous?: boolean
  next?: string | null
  previous?: string | null
  results: T[]
}

// ---------------------------------------------------------------- auth

export interface User {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  is_staff: boolean
}

export interface LoginResponse {
  status: 'success'
  access: string
  refresh: string
  access_expires_in: number
  refresh_expires_in: number
  token_type: 'Bearer'
  user: User
}

export interface RefreshResponse {
  status: 'success'
  access: string
  refresh: string
  token_type: 'Bearer'
  access_expires_in?: number
  refresh_expires_in?: number
}

export interface MeResponse {
  status: 'success'
  user: User
}

// ---------------------------------------------------------------- categories

export type CategoryKind = 'expense' | 'income' | 'transfer'
export type CategorySource = 'user' | 'rule' | 'match' | 'model' | 'pair'

export interface CategoryRef {
  id: number
  name: string
  full_name: string
  kind: CategoryKind
  source: CategorySource
}

export interface Category {
  id: number
  name: string
  full_name: string
  parent_id: number | null
  kind: CategoryKind
}

export interface CategoriesResponse {
  results: Category[]
}

// ---------------------------------------------------------------- receipts

export interface ReceiptItem {
  id: number
  item: string
  qty: Money
  /** Line total, NOT a unit price. */
  price: Money
  unit_price: Money | null
}

export interface Receipt {
  id: number
  shop: string
  total: Money
  date: CalendarDate
  client_uuid: string | null
  image_url: string | null
  needs_review: boolean
  review_note: string
  items: ReceiptItem[]
  created_at: Instant
  category?: CategoryRef | null
  bank_transaction_id?: number | null
}

export interface ReceiptTotals {
  stated: Money
  items_sum: Money
  discrepancy: Money
  reconciles: boolean
  note?: string | null
}

export interface CreateReceiptResponse {
  status: 'success'
  receipt_id: number
  receipt_rows: number
  item_rows: number
  image_saved: boolean
  image_note: string | null
  totals: ReceiptTotals
  receipt: Receipt
  bank_match?: BankMatch | null
}

/** Shape not fully specified in API.md; kept loose on purpose. */
export interface BankMatch {
  transaction_id?: number
  confidence?: string
  bucket?: string
  [key: string]: unknown
}

export interface ReceiptListParams {
  page?: number
  page_size?: number
  shop?: string
  item?: string
  q?: string
  since?: CalendarDate
  category?: number | 'none'
}

// ---------------------------------------------------------------- scans

export type ScanStatus =
  | 'queued'
  | 'processing'
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'failed'
  | 'discarded'

export type ExtractionCheck = 'ok' | 'retried' | 'check' | 'mismatch'

export interface ProposedItem {
  item: string
  qty: Money
  /** Line total. */
  price: Money
}

export interface ProposedReceipt {
  shop: string
  date: CalendarDate
  total: Money
  items: ProposedItem[]
  /** Missing for scans extracted before categories existed. */
  category?: CategoryRef | null
}

export interface Extraction {
  proposed: ProposedReceipt | null
  totals: ReceiptTotals | null
  check: ExtractionCheck | null
  notes: string[]
  error: string | null
  attempts: number
  seconds: number | null
  started_at: Instant | null
  extracted_at: Instant | null
  ocr_text?: string | null
}

export interface ScanStored {
  format: string
  width: number
  height: number
  megapixels: number
  bytes: number
  thumbnail: boolean
}

export interface ScanActions {
  approve: boolean
  reject: boolean
  rerun: boolean
}

export interface Scan {
  status?: 'success'
  scan_id: number
  scan_status: ScanStatus
  already_uploaded?: boolean
  possible_duplicate_of?: number | null
  client_uuid: string | null
  captured_at: Instant | null
  uploaded_at: Instant
  note?: string | null
  stored: ScanStored | null
  receipt_id: number | null
  extraction: Extraction
  reviewed_at: Instant | null
  actions: ScanActions
  image_url?: string | null
  thumbnail_url?: string | null
}

export interface ScanCounts {
  status: 'success'
  pending: number
  extracting: number
  by_status: Record<ScanStatus, number>
  total: number
  oldest_pending_at: Instant | null
}

export interface ApproveScanBody {
  shop?: string
  date?: CalendarDate
  total?: Money
  items?: { item: string; qty: Money; price: Money }[]
  category?: number
}

export interface ApproveScanResponse extends CreateReceiptResponse {
  edited: string[]
  scan: Scan
}

// ---------------------------------------------------------------- bank

export interface BankAccountRef {
  id: number
  name: string
  account: string
}

export type MatchConfidence = 'exact' | 'high' | 'possible' | 'manual' | ''

export interface Transaction {
  id: number
  account: BankAccountRef
  date: CalendarDate
  posted_on: CalendarDate
  user_date: CalendarDate | null
  /** Signed: money out is negative. */
  amount: Money
  amount_abs: Money
  trntype: string
  memo: string
  merchant: string
  receipt_id: number | null
  match_method: string
  match_confidence: MatchConfidence
  match_note: string
  matched_at: Instant | null
  category?: CategoryRef | null
  transfer_pair_id?: number | null
}

export interface TransactionListParams {
  page?: number
  page_size?: number
  matched?: 'false' | 'true' | 'all'
  q?: string
  amount?: Money
  since?: CalendarDate
  until?: CalendarDate
  account?: number
  purchases_only?: boolean
  category?: number | 'none'
}

/** Response of POST /api/bank/statements/ — field names per the backend spec; verify. */
export interface StatementImportResult {
  status?: 'success'
  account?: BankAccountRef
  period?: { start: CalendarDate; end: CalendarDate }
  in_file?: number
  created?: number
  duplicate?: number
  conflicted?: number
  [key: string]: unknown
}

// ---------------------------------------------------------------- reconcile

export type ReconcileBucket = 'ambiguous' | 'weak' | 'none'

export interface ReconcileSummary {
  status: 'success'
  auto: number
  ambiguous: number
  weak: number
  none: number
  needs_review: number
  matched: number
  marked_no_match: number
}

export interface QueueReceipt {
  id: number
  shop: string
  total: Money
  date: CalendarDate
  image_url: string | null
  item_count: number
  created_at: Instant
}

export interface Candidate {
  transaction: Transaction
  confidence: 'exact' | 'high' | 'possible'
  /** A sentence meant for display. */
  reason: string
  days_apart: number
  shop_match: string
}

export interface QueueItem {
  receipt: QueueReceipt
  bucket: ReconcileBucket
  needs_choice: boolean
  candidates: Candidate[]
}

export interface ConfirmResponse {
  status: 'success'
  receipt_id: number
  transaction: Transaction
}

export interface UnrejectResponse {
  status: 'success'
  undone: boolean
}

/** POST /api/bank/reconcile/run/ — "counts per bucket". */
export interface ReconcileRunResponse {
  status?: 'success'
  dry_run?: boolean
  [bucket: string]: unknown
}

// ---------------------------------------------------------------- dashboard

export interface DashboardMonth {
  month: YearMonth
  bank: { amount: Money; transactions: number }
  receipts: { amount: Money; count: number }
}

export interface TopCategoryRow {
  category_id: number | null
  category: string
  parent: string | null
  amount: Money
  transactions?: number
  receipts?: number
}

export interface Dashboard {
  generated_on: CalendarDate
  period: { start: CalendarDate; end: CalendarDate; months: number }
  monthly: DashboardMonth[]
  totals: { bank: Money; receipts: Money; receipt_coverage_pct: Pct | null }
  top_shops: {
    month: YearMonth
    bank: { merchant: string; amount: Money; transactions: number }[]
    receipts: { shop: string; amount: Money; receipts: number }[]
  }
  top_categories: {
    month: YearMonth
    bank: TopCategoryRow[]
    receipts: TopCategoryRow[]
  }
  recent: {
    bank: {
      id: number
      date: CalendarDate
      purchase_date: CalendarDate | null
      /** Positive: amount spent. */
      amount: Money
      merchant: string
      description: string
      receipt_id: number | null
    }[]
    receipts: {
      id: number
      date: CalendarDate
      shop: string
      total: Money
      items: number
      needs_review: boolean
      image_url: string | null
      bank_transaction_id: number | null
    }[]
  }
  excluded: string
}

// ---------------------------------------------------------------- insights

export interface Period {
  start: CalendarDate
  end: CalendarDate
}

export type FlowStatus = 'surplus' | 'deficit' | 'break_even'

export interface CashFlowPoint {
  month: YearMonth
  start: CalendarDate
  end: CalendarDate
  /** false for the running month — draw it as partial. */
  complete: boolean
  income: Money
  expenses: Money
  net: Money
  status: FlowStatus
  savings_rate_pct: Pct | null
  transfers: { in: Money; out: Money }
}

export interface CashFlow {
  period: Period & { months: number }
  monthly: CashFlowPoint[]
  totals: {
    income: Money
    expenses: Money
    net: Money
    status: FlowStatus
    savings_rate_pct: Pct | null
    complete_months: number
    deficit_months: number
    average_income: Money | null
    average_expenses: Money | null
    average_net: Money | null
  }
}

export interface MonthToDateFigures {
  month_to_date: Money
  last_month_to_date: Money
  change_pct: Pct | null
  last_month_total: Money
  projected_month_end: Money
  projected_vs_last_month_pct: Pct | null
  /** Cumulative per day of month. null = don't draw a point. */
  by_day: { day: number; this_month: Money | null; last_month: Money | null }[]
}

export interface MonthToDate {
  month: YearMonth
  through: CalendarDate
  days_elapsed: number
  days_in_month: number
  compared_to: { month: YearMonth; through: CalendarDate }
  projection: string
  bank: MonthToDateFigures
  receipts: MonthToDateFigures
}

export interface WeekdaySpend {
  amount: Money
  average_per_day: Money
  share_pct: Pct | null
  transactions?: number
  receipts?: number
}

export interface DayOfWeek {
  period: Period
  /** Always 7, Monday first. weekday is ISO (1 = Monday). */
  days: {
    weekday: number
    name: string
    occurrences: number
    bank: WeekdaySpend
    receipts: WeekdaySpend
  }[]
}

export interface BasketSize {
  period: Period
  previous_period: Period
  category: { id: number; name: string } | null
  excluded_discrepancies: number
  overall: {
    receipts: number
    average_basket: Money | null
    previous_average_basket: Money | null
    change_pct: Pct | null
  }
  shops: {
    shop: string
    visits: number
    total: Money
    average_basket: Money
    largest_basket: Money
    average_items: string | null
    previous_visits: number
    previous_average_basket: Money | null
    change_pct: Pct | null
  }[]
}

export interface TrackedItem {
  item: string
  unit: 'kg' | 'each' | 'qty'
  purchases: number
  first: { date: CalendarDate; unit_price: Money }
  latest: { date: CalendarDate; unit_price: Money }
  change_pct: Pct | null
  min_unit_price: Money
  max_unit_price: Money
  average_unit_price: Money
  cheapest_shop: string | null
  by_shop: {
    shop: string
    purchases: number
    average_unit_price: Money
    latest_unit_price: Money
  }[]
  history: {
    date: CalendarDate
    shop: string
    qty: Money
    unit_price: Money
    receipt_id: number
  }[]
}

export interface PriceTracker {
  period: Period
  filter: string | null
  min_purchases: number
  skipped: { discrepancies: number; unknown_weight: number }
  items: TrackedItem[]
}

export interface Insights {
  generated_on: CalendarDate
  cash_flow: CashFlow
  month_to_date: MonthToDate
  day_of_week: DayOfWeek
  basket_size: BasketSize
  price_tracker: PriceTracker
  excluded: string
}

export interface HealthResponse {
  status: 'ok'
}
