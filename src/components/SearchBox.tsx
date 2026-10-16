'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { groupSlugFromPathname } from '@/lib/utils'

const inputClassName =
  'px-3 py-2 text-sm rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700'

// The mobile search panel's open state lives in Header, so opening it can
// close the hamburger menu (both panels drop down from the same spot).
export default function SearchBox({
  mobileOpen,
  onMobileOpenChange,
}: {
  mobileOpen: boolean
  onMobileOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const [q, setQ] = useState('')
  const mobileInputRef = useRef<HTMLInputElement>(null)

  // Search is scoped to the group you're currently viewing.
  const slug = groupSlugFromPathname(pathname)

  // Keep input synced with URL on back/forward navigation. Adjusting state
  // during render (instead of in an effect) avoids an extra render pass.
  const [prevSearchParams, setPrevSearchParams] = useState<typeof searchParams | null>(null)
  if (searchParams !== prevSearchParams) {
    setPrevSearchParams(searchParams)
    setQ(searchParams.get('q') ?? '')
  }

  useEffect(() => {
    if (mobileOpen) mobileInputRef.current?.focus()
  }, [mobileOpen])

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = q.trim()
    if (!trimmed || !slug) return
    onMobileOpenChange(false)
    router.push(`/g/${slug}/search?q=${encodeURIComponent(trimmed)}`)
  }

  // No active group (e.g. the directory) → nothing to search yet.
  if (!slug) return null

  return (
    <>
      <form onSubmit={onSubmit} className="hidden sm:block">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search submissions…"
          aria-label="Search submissions"
          className={`w-56 ${inputClassName}`}
        />
      </form>

      {/* Mobile: icon toggles a full-width search panel under the header row. */}
      <button
        type="button"
        onClick={() => onMobileOpenChange(!mobileOpen)}
        aria-label={mobileOpen ? 'Close search' : 'Search submissions'}
        aria-expanded={mobileOpen}
        aria-controls="mobile-search"
        className="sm:hidden p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
      >
        {mobileOpen ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
          </svg>
        )}
      </button>

      {mobileOpen && (
        <form
          id="mobile-search"
          onSubmit={onSubmit}
          className="sm:hidden absolute inset-x-0 top-full px-4 py-3 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shadow-sm"
        >
          <input
            ref={mobileInputRef}
            type="search"
            enterKeyHint="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search submissions…"
            aria-label="Search submissions"
            className={`w-full ${inputClassName}`}
          />
        </form>
      )}
    </>
  )
}
