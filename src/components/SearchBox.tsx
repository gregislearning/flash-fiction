'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { groupSlugFromPathname } from '@/lib/utils'

export default function SearchBox() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const [q, setQ] = useState('')

  // Search is scoped to the group you're currently viewing.
  const slug = groupSlugFromPathname(pathname)

  // Keep input synced with URL on back/forward navigation
  useEffect(() => {
    setQ(searchParams.get('q') ?? '')
  }, [searchParams])

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = q.trim()
    if (!trimmed || !slug) return
    router.push(`/g/${slug}/search?q=${encodeURIComponent(trimmed)}`)
  }

  // No active group (e.g. the directory) → nothing to search yet.
  if (!slug) return null

  return (
    <form onSubmit={onSubmit} className="hidden sm:block">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search submissions…"
        aria-label="Search submissions"
        className="w-56 px-3 py-2 text-sm rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700"
      />
    </form>
  )
}
