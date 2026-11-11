import { tokens } from './tokens'
import type { ApiErrorBody, ApiErrorCode, RefreshResponse } from './types'

/** Empty in production and in dev (Vite proxies /api). Set it to call another origin directly. */
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

// ---------------------------------------------------------------- errors

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  readonly errors: Record<string, string[]> | null
  readonly body: Partial<ApiErrorBody> | null

  constructor(status: number, body: Partial<ApiErrorBody> | null, fallbackMessage?: string) {
    super(body?.message || fallbackMessage || `Request failed (${status})`)
    this.name = 'ApiError'
    this.status = status
    this.code = body?.code ?? (status === 0 ? 'network_error' : 'unknown_error')
    this.errors = body?.errors ?? null
    this.body = body
  }

  /** `match_unavailable` / `invalid_state` mean "refresh the data", not an error toast. */
  get isStale() {
    return this.code === 'match_unavailable' || this.code === 'invalid_state'
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError
}

// ---------------------------------------------------------------- auth failure hook

type Listener = () => void
const authFailureListeners = new Set<Listener>()

/** Called when the session is over (refresh rejected). AuthProvider subscribes. */
export function onAuthFailure(fn: Listener) {
  authFailureListeners.add(fn)
  return () => {
    authFailureListeners.delete(fn)
  }
}

function signalAuthFailure() {
  tokens.clear()
  authFailureListeners.forEach((fn) => fn())
}

// ---------------------------------------------------------------- urls

/**
 * Accepts "/api/..." paths, or absolute URLs the API hands out (e.g. `image_url`).
 * Absolute URLs pointing at /api/ are re-rooted on API_BASE so they go through
 * the same origin / dev proxy as every other call.
 */
export function apiUrl(pathOrUrl: string, query?: Record<string, unknown>): string {
  let path = pathOrUrl
  if (/^https?:\/\//i.test(pathOrUrl)) {
    const u = new URL(pathOrUrl)
    path = u.pathname.startsWith('/api/') ? u.pathname + u.search : pathOrUrl
    if (path === pathOrUrl) return withQuery(pathOrUrl, query)
  }
  return withQuery(API_BASE + path, query)
}

function withQuery(url: string, query?: Record<string, unknown>) {
  if (!query) return url
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue
    params.set(k, String(v))
  }
  const qs = params.toString()
  if (!qs) return url
  return url + (url.includes('?') ? '&' : '?') + qs
}

// ---------------------------------------------------------------- refresh (serialised)

let inflightRefresh: Promise<boolean> | null = null

/**
 * One in-flight refresh shared by every caller. Resolves true when a new pair
 * was stored, false when the session is over (tokens cleared).
 * Throws ApiError on network/server failure (tokens kept, so a retry can work).
 */
export function refreshTokens(): Promise<boolean> {
  if (!inflightRefresh) {
    inflightRefresh = doRefresh().finally(() => {
      inflightRefresh = null
    })
  }
  return inflightRefresh
}

async function doRefresh(): Promise<boolean> {
  const refresh = tokens.getRefresh()
  if (!refresh) return false

  let res: Response
  try {
    res = await fetch(apiUrl('/api/auth/refresh/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refresh }),
    })
  } catch {
    throw new ApiError(0, null, 'Network error — could not reach the server.')
  }

  if (res.ok) {
    const data = (await res.json()) as RefreshResponse
    tokens.set(data.access, data.refresh)
    return true
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    tokens.clear()
    return false
  }
  throw new ApiError(res.status, await readErrorBody(res))
}

// ---------------------------------------------------------------- requests

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** JSON body; sets Content-Type. */
  json?: unknown
  /** FormData / Blob / string body, sent as-is. */
  body?: BodyInit | null
  query?: Record<string, unknown>
  /** Set false for endpoints that must not trigger refresh (login). Default true. */
  auth?: boolean
}

/**
 * Low-level fetch: attaches the bearer token, refreshes once on 401, retries once.
 * Returns the raw Response (use for images/blobs). Non-2xx is NOT thrown here.
 */
export async function apiFetch(pathOrUrl: string, opts: RequestOptions = {}): Promise<Response> {
  const { json, query, auth = true, headers, body, ...init } = opts
  const url = apiUrl(pathOrUrl, query)

  // No access token yet but a refresh token exists (e.g. after reload): refresh first.
  if (auth && !tokens.getAccess() && tokens.getRefresh()) {
    await refreshTokens()
  }

  const send = () => {
    const h = new Headers(headers)
    if (!h.has('Accept')) h.set('Accept', 'application/json')
    if (json !== undefined) h.set('Content-Type', 'application/json')
    const access = tokens.getAccess()
    if (auth && access) h.set('Authorization', `Bearer ${access}`)
    return {
      sentWith: access,
      promise: fetch(url, {
        ...init,
        headers: h,
        body: json !== undefined ? JSON.stringify(json) : body,
      }),
    }
  }

  let attempt = send()
  let res: Response
  try {
    res = await attempt.promise
  } catch {
    throw new ApiError(0, null, 'Network error — could not reach the server.')
  }

  if (res.status === 401 && auth) {
    // If another request already rotated the token while this one was in flight,
    // just retry with the new one instead of refreshing again.
    const current = tokens.getAccess()
    const ok = current && current !== attempt.sentWith ? true : await refreshTokens()
    if (!ok) {
      signalAuthFailure()
      return res
    }
    attempt = send()
    try {
      res = await attempt.promise
    } catch {
      throw new ApiError(0, null, 'Network error — could not reach the server.')
    }
    if (res.status === 401) signalAuthFailure()
  }

  return res
}

async function readErrorBody(res: Response): Promise<Partial<ApiErrorBody> | null> {
  try {
    const text = await res.text()
    return text ? (JSON.parse(text) as Partial<ApiErrorBody>) : null
  } catch {
    return null
  }
}

/** JSON request. Throws ApiError on non-2xx. 204 resolves to undefined. */
export async function api<T>(pathOrUrl: string, opts: RequestOptions = {}): Promise<T> {
  const res = await apiFetch(pathOrUrl, opts)
  if (!res.ok) throw new ApiError(res.status, await readErrorBody(res), res.statusText)
  if (res.status === 204) return undefined as T
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export const get = <T>(path: string, query?: Record<string, unknown>) =>
  api<T>(path, { method: 'GET', query })

export const post = <T>(path: string, json?: unknown) =>
  api<T>(path, { method: 'POST', json: json ?? {} })

export const patch = <T>(path: string, json: unknown) => api<T>(path, { method: 'PATCH', json })

export const del = <T = void>(path: string) => api<T>(path, { method: 'DELETE' })

/** Multipart upload (scans, statements). Don't set Content-Type — the browser adds the boundary. */
export const upload = <T>(path: string, form: FormData) =>
  api<T>(path, { method: 'POST', body: form })
