import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { useReconcileSummary, useScanCounts } from '@/api/queries'
import { Button } from './ui/Button'
import { CountBadge } from './ui/Badge'
import { cn } from '@/lib/cn'

interface NavItem {
  to: string
  label: string
  end?: boolean
  badge?: number
  match?: string
}

export function Layout() {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const location = useLocation()

  // Badge errors are ignored: the endpoint may not exist yet on the .NET API.
  const scanCounts = useScanCounts()
  const reconcile = useReconcileSummary()

  const items: NavItem[] = [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/scans', label: 'Scans', badge: scanCounts.data?.pending },
    { to: '/receipts', label: 'Receipts' },
    // { to: '/bank/transactions', label: 'Bank', match: '/bank' },
    // { to: '/reconcile', label: 'Reconcile', badge: reconcile.data?.needs_review },
  ]

  const isActive = (item: NavItem, navActive: boolean) =>
    item.match ? location.pathname.startsWith(item.match) : navActive

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
    } finally {
      setLoggingOut(false)
    }
  }

  const linkClass = (active: boolean) =>
    cn(
      'inline-flex items-center rounded-md px-3 py-2 text-sm font-medium',
      active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100',
    )

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <NavLink to="/" className="shrink-0 font-semibold tracking-tight">
            Receipt Scanner
          </NavLink>

          {/* Desktop nav */}
          <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Main">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}>
                {({ isActive: a }) => (
                  <span className={linkClass(isActive(item, a))}>
                    {item.label}
                    <CountBadge count={item.badge} />
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-3 md:flex">
            <span className="text-sm text-slate-500">{user?.username}</span>
            <Button variant="secondary" onClick={handleLogout} loading={loggingOut}>
              Log out
            </Button>
          </div>

          {/* Mobile toggle */}
          <button
            type="button"
            className="relative ml-auto inline-flex size-9 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 md:hidden"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}>
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              )}
            </svg>
            {!menuOpen && (scanCounts.data?.pending || reconcile.data?.needs_review) ? (
              <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-amber-500" />
            ) : null}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <nav className="border-t border-slate-200 px-4 py-2 md:hidden" aria-label="Main">
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.end} onClick={() => setMenuOpen(false)}>
                    {({ isActive: a }) => (
                      <span className={cn(linkClass(isActive(item, a)), 'flex w-full')}>
                        {item.label}
                        <CountBadge count={item.badge} />
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
              <span className="text-sm text-slate-500">{user?.username}</span>
              <Button variant="secondary" onClick={handleLogout} loading={loggingOut}>
                Log out
              </Button>
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
