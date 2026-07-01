'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { GroupInvitation } from '@/types/database'

interface GroupInviteManagerProps {
  groupId: string
  /** Open (unaccepted) invitations, newest first. */
  initialInvitations: GroupInvitation[]
}

/**
 * Group-admin invite-by-email UI (no email infra in v1): create an invitation,
 * then share the copy/paste `/invite/[token]` link manually. Inserts/lists/
 * revokes go through the group_invitations admin RLS policies (migration 011).
 */
export default function GroupInviteManager({ groupId, initialInvitations }: GroupInviteManagerProps) {
  const supabase = createClient()
  const [invitations, setInvitations] = useState<GroupInvitation[]>(initialInvitations)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'admin'>('member')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const inviteUrl = (token: string) =>
    typeof window === 'undefined' ? `/invite/${token}` : `${window.location.origin}/invite/${token}`

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const normalized = email.trim().toLowerCase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Your session expired — please sign in again.')
      setLoading(false)
      return
    }

    const { data, error: insertError } = await supabase
      .from('group_invitations')
      .insert({ group_id: groupId, email: normalized, role, invited_by: user.id })
      .select('*')
      .single()

    if (insertError) {
      // The partial unique index rejects a second open invite for the same email.
      setError(
        insertError.code === '23505'
          ? 'There is already a pending invitation for that email.'
          : insertError.message
      )
      setLoading(false)
      return
    }

    setInvitations((prev) => [data as GroupInvitation, ...prev])
    setEmail('')
    setRole('member')
    setLoading(false)
  }

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this invitation? The link will stop working.')) return
    const { error: deleteError } = await supabase.from('group_invitations').delete().eq('id', id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setInvitations((prev) => prev.filter((inv) => inv.id !== id))
  }

  const handleCopy = async (token: string) => {
    await navigator.clipboard.writeText(inviteUrl(token))
    setCopiedToken(token)
    setTimeout(() => setCopiedToken((t) => (t === token ? null : t)), 2000)
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleInvite} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="writer@example.com"
            className="flex-1 px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'member' | 'admin')}
            className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-medium hover:bg-zinc-800 dark:hover:bg-zinc-100 transition disabled:opacity-50"
          >
            {loading ? 'Inviting…' : 'Invite'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </form>

      <div>
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
          Pending invitations
        </h3>
        {invitations.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No pending invitations.</p>
        ) : (
          <ul className="space-y-2">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800"
              >
                <div className="min-w-0">
                  <span className="text-sm text-zinc-900 dark:text-white break-all">{inv.email}</span>
                  <span className="ml-2 text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {inv.role}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopy(inv.token)}
                    className="text-xs px-3 py-1.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition"
                  >
                    {copiedToken === inv.token ? 'Copied!' : 'Copy link'}
                  </button>
                  <button
                    onClick={() => handleRevoke(inv.id)}
                    className="text-xs px-3 py-1.5 rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition"
                  >
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
