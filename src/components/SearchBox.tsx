'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'

export default function SearchBox() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [q, setQ] = useState('')

  // Keep input synced with URL on back/forward navigation
  useEffect(() => {
    setQ(searchParams.get('q') ?? '')
  }, [searchParams])

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = q.trim()
    if (!trimmed) return
    router.push(`/search?q=${encodeURIComponent(trimmed)}`)
  }

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
