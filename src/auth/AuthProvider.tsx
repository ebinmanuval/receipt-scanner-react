import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { onAuthFailure, refreshTokens } from '@/api/client'
import { fetchMe, login as apiLogin, logout as apiLogout } from '@/api/auth'
import { tokens } from '@/api/tokens'
import type { User } from '@/api/types'

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: User }
  | { status: 'anonymous'; user: null }

interface AuthContextValue {
  state: AuthState
  user: User | null
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Module-level so React StrictMode's double effect doesn't refresh twice.
let bootstrap: Promise<User | null> | null = null

function bootstrapSession(): Promise<User | null> {
  if (!bootstrap) {
    bootstrap = (async () => {
      if (!tokens.getRefresh()) return null
      try {
        const ok = await refreshTokens()
        if (!ok) return null
        return await fetchMe()
      } catch {
        // Network down or server error: keep the refresh token, show login for now.
        return null
      }
    })().finally(() => {
      bootstrap = null
    })
  }
  return bootstrap
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null })

  useEffect(() => {
    let cancelled = false
    bootstrapSession().then((user) => {
      if (cancelled) return
      setState(user ? { status: 'authenticated', user } : { status: 'anonymous', user: null })
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Refresh rejected anywhere in the app → session over → back to /login.
  useEffect(
    () =>
      onAuthFailure(() => {
        queryClient.clear()
        setState({ status: 'anonymous', user: null })
      }),
    [queryClient],
  )

  const login = useCallback(async (username: string, password: string) => {
    const user = await apiLogin(username, password)
    setState({ status: 'authenticated', user })
  }, [])

  const logout = useCallback(async () => {
    await apiLogout()
    queryClient.clear()
    setState({ status: 'anonymous', user: null })
  }, [queryClient])

  const value = useMemo(
    () => ({ state, user: state.user, login, logout }),
    [state, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
