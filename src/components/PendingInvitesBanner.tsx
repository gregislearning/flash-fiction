'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { PendingInvitation } from '@/lib/groups'

interface PendingInvitesBannerProps {
  invitations: PendingInvitation[]
}

/**
 * Pending-invite-aware empty state: surfaces "Accept invitation to {group}" for
 * a signed-in user with open invites. Accept goes through accept_invitation()
 * (idempotent), then routes into the group. The backstop if the callback
 * auto-claim ever misses.
 */
export default function PendingInvitesBanner({ invitations }: PendingInvitesBannerProps) {
  const supabase = createClient()
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (invitations.length === 0) return null

  const accept = async (token: string, slug: string) => {
    setError(null)
    setPending(token)
    const { error: rpcError } = await supabase.rpc('accept_invitation', { p_token: token })
    if (rpcError) {
      setError(rpcError.message)
      setPending(null)
      return
    }
    router.push(`/g/${slug}`)
    router.refresh()
  }

  return (
    <div className="mb-8 rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 p-6">
      <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-3">
        You have {invitations.length === 1 ? 'an invitation' : 'invitations'}
      </h2>
      <ul className="space-y-2">
        {invitations.map((inv) => (
          <li key={inv.token} className="flex items-center justify-between gap-3">
            <span className="text-amber-900 dark:text-amber-100">
              {inv.groupName} <span className="text-xs uppercase tracking-wide opacity-70">({inv.role})</span>
            </span>
            <button
              onClick={() => accept(inv.token, inv.groupSlug)}
              disabled={pending === inv.token}
              className="text-sm px-4 py-2 rounded-lg bg-amber-500 dark:bg-amber-400 text-white dark:text-zinc-900 font-medium hover:bg-amber-600 dark:hover:bg-amber-500 transition disabled:opacity-50 whitespace-nowrap"
            >
              {pending === inv.token ? 'Joining…' : `Accept invitation`}
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
