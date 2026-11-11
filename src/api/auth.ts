import { api, post } from './client'
import { tokens } from './tokens'
import type { LoginResponse, MeResponse, User } from './types'

export async function login(username: string, password: string): Promise<User> {
  // auth:false — a 401 here is invalid_credentials, not an expired token.
  const data = await api<LoginResponse>('/api/auth/login/', {
    method: 'POST',
    json: { username, password },
    auth: false,
  })
  tokens.set(data.access, data.refresh)
  return data.user
}

export async function fetchMe(): Promise<User> {
  const data = await api<MeResponse>('/api/auth/me/')
  return data.user
}

/** Blacklists the refresh token server-side; clears local tokens whatever happens. */
export async function logout(): Promise<void> {
  const refresh = tokens.getRefresh()
  try {
    if (refresh && tokens.getAccess()) {
      await post('/api/auth/logout/', { refresh })
    }
  } catch {
    /* already logged out / offline — local clear is what matters */
  } finally {
    tokens.clear()
  }
}
