import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { apiFetch, apiUrl, ApiError } from '@/api/client'
import { cn } from '@/lib/cn'

// Image endpoints need the Authorization header, so <img src> can't load them.
// Bytes behind an image URL never change, so blobs are cached by URL for the session.
const cache = new Map<string, Promise<Blob>>()

export function fetchImageBlob(url: string): Promise<Blob> {
  const key = apiUrl(url)
  let p = cache.get(key)
  if (!p) {
    p = apiFetch(url, { headers: { Accept: 'image/*' } }).then(async (res) => {
      if (!res.ok) throw new ApiError(res.status, null, `Image failed to load (${res.status})`)
      return res.blob()
    })
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}

/** Opens an authenticated image (e.g. the original scan) in a new tab. */
export async function openAuthImage(url: string) {
  const win = window.open('', '_blank')
  try {
    const blob = await fetchImageBlob(url)
    const objectUrl = URL.createObjectURL(blob)
    if (win) win.location.href = objectUrl
    else window.location.href = objectUrl
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  } catch {
    win?.close()
    throw new Error('Could not load the original image.')
  }
}

interface AuthImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string | null | undefined
  /** Shown when there's no src or loading failed. */
  fallback?: React.ReactNode
}

export function AuthImage({ src, fallback, className, alt = '', ...props }: AuthImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setObjectUrl(null)
    setFailed(false)
    if (!src) return
    let cancelled = false
    let created: string | null = null
    fetchImageBlob(src)
      .then((blob) => {
        if (cancelled) return
        created = URL.createObjectURL(blob)
        setObjectUrl(created)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [src])

  if (!src || failed) {
    return (
      <>
        {fallback ?? (
          <div className={cn('flex items-center justify-center bg-slate-100 text-xs text-slate-400', className)}>
            No image
          </div>
        )}
      </>
    )
  }
  if (!objectUrl) {
    return <div className={cn('animate-pulse bg-slate-100', className)} aria-label="Loading image" />
  }
  return <img src={objectUrl} alt={alt} className={className} {...props} />
}
