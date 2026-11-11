import { cn } from '@/lib/cn'
import { CountBadge } from './Badge'

export interface TabItem<T extends string> {
  value: T
  label: string
  count?: number
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: TabItem<T>[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div role="tablist" className="inline-flex min-w-max gap-1 rounded-lg bg-slate-100 p-1">
        {items.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={t.value === value}
            onClick={() => onChange(t.value)}
            className={cn(
              'inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap',
              t.value === value ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {t.label}
            <CountBadge count={t.count} />
          </button>
        ))}
      </div>
    </div>
  )
}
