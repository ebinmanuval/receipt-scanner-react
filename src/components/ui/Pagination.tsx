import { Button } from './Button'

export function Pagination({
  page,
  pages,
  count,
  onPage,
}: {
  page: number
  pages: number
  count: number
  onPage: (p: number) => void
}) {
  if (pages <= 1) return <p className="text-sm text-slate-500">{count} total</p>
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm text-slate-500">
        Page {page} of {pages} · {count} total
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  )
}
