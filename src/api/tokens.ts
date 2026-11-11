// Access token lives in memory only. Refresh token lives in localStorage
// (single-user app; can move to an httpOnly cookie later).

const REFRESH_KEY = 'receipt-scanner.refresh'

let accessToken: string | null = null

function readStorage(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY)
  } catch {
    return null
  }
}

function writeStorage(value: string | null) {
  try {
    if (value) localStorage.setItem(REFRESH_KEY, value)
    else localStorage.removeItem(REFRESH_KEY)
  } catch {
    /* storage unavailable (private mode etc.) — session lasts until reload */
  }
}

let refreshFallback: string | null = null

export const tokens = {
  getAccess: () => accessToken,
  getRefresh: () => readStorage() ?? refreshFallback,

  /** Store both values every time — a refresh rotates the refresh token. */
  set(access: string, refresh: string) {
    accessToken = access
    refreshFallback = refresh
    writeStorage(refresh)
  },

  clear() {
    accessToken = null
    refreshFallback = null
    writeStorage(null)
  },
}
