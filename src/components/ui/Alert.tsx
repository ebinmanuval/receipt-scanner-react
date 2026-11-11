import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

const tones = {
  error: 'border-red-200 bg-red-50 text-red-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
}

export function Alert({
  tone = 'info',
  children,
  className,
}: {
  tone?: keyof typeof tones
  children: ReactNode
  className?: string
}) {
  return (
    <div role="alert" className={cn('rounded-md border px-3 py-2 text-sm', tones[tone], className)}>
      {children}
    </div>
  )
}
