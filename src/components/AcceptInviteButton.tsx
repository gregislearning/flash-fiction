'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface AcceptInviteButtonProps {
  token: string
  groupSlug: string
}

/**
 * Accepts an invitation via the migration 011 accept_invitation() function
 * (verified-email + email-match gated, idempotent). On success, routes to the
 * group. Surfaces the DB's gate messages (wrong email, unverified) inline.
 */
export default function AcceptInviteButton({ token, groupSlug }: AcceptInviteButtonProps) {
  const supabase = createClient()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleAccept = async () => {
    setError(null)
    setLoading(true)
    const { error: rpcError } = await supabase.rpc('accept_invitation', { p_token: token })
    if (rpcError) {
      setError(rpcError.message)
      setLoading(false)
      return
    }
    router.push(`/g/${groupSlug}`)
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleAccept}
        disabled={loading}
        className="px-8 py-4 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition font-medium text-lg disabled:opacity-50"
      >
        {loading ? 'Joining…' : 'Accept invitation'}
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
