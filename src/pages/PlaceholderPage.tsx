import { Card } from '@/components/ui/Card'

/** Stand-in for pages built in later phases. */
export function PlaceholderPage({ title, phase, children }: { title: string; phase: number; children?: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <Card>
        <p className="text-sm text-slate-600">Coming in phase {phase}.</p>
        {children}
      </Card>
    </div>
  )
}
