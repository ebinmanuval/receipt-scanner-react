import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'info' | 'success' | 'error' | 'warning'

export interface ToastInput {
  title: string
  description?: ReactNode
  tone?: Tone
  /** ms; 0 keeps it until dismissed. Default 5000. */
  duration?: number
  action?: { label: string; onClick: () => void }
}

interface ToastItem extends ToastInput {
  id: number
}

const ToastContext = createContext<((t: ToastInput) => void) | null>(null)

const tones: Record<Tone, string> = {
  info: 'border-slate-200',
  success: 'border-emerald-300',
  error: 'border-red-300',
  warning: 'border-amber-300',
}
const dots: Record<Tone, string> = {
  info: 'bg-slate-400',
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  warning: 'bg-amber-500',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), [])

  const toast = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++
      setItems((xs) => [...xs.slice(-3), { ...t, id }])
      const duration = t.duration ?? 5000
      if (duration > 0) setTimeout(() => dismiss(id), duration)
    },
    [dismiss],
  )

  const value = useMemo(() => toast, [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto w-full max-w-sm rounded-lg border bg-white p-3 shadow-lg',
              tones[t.tone ?? 'info'],
            )}
          >
            <div className="flex items-start gap-3">
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', dots[t.tone ?? 'info'])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.description && <div className="mt-0.5 text-sm text-slate-600">{t.description}</div>}
              </div>
              {t.action && (
                <button
                  className="text-sm font-medium text-slate-900 underline"
                  onClick={() => {
                    t.action!.onClick()
                    dismiss(t.id)
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button
                aria-label="Dismiss"
                className="text-slate-400 hover:text-slate-700"
                onClick={() => dismiss(t.id)}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
