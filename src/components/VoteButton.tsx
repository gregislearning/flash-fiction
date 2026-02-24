'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useToast } from './Toast'

interface VoteButtonProps {
  promptId: string
  submissionId: string
  hasVoted: boolean
  disabled: boolean
  votesUsed: number
}

export default function VoteButton({
  promptId,
  submissionId,
  hasVoted,
  disabled,
  votesUsed,
}: VoteButtonProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const showToast = useToast()

  const handleVote = async () => {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/auth/signin')
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any

    await client.from('votes').insert({
      prompt_id: promptId,
      submission_id: submissionId,
      user_id: user.id,
    })

    const remaining = 2 - (votesUsed + 1)
    showToast(
      remaining > 0
        ? `Vote cast! You have ${remaining} vote${remaining !== 1 ? 's' : ''} remaining.`
        : "Vote cast! You've used both votes."
    )

    router.refresh()
    setLoading(false)
  }

  const handleUndo = async () => {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/auth/signin')
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any

    await client
      .from('votes')
      .delete()
      .eq('prompt_id', promptId)
      .eq('user_id', user.id)
      .eq('submission_id', submissionId)

    const remaining = 2 - (votesUsed - 1)
    showToast(`Vote removed. You have ${remaining} vote${remaining !== 1 ? 's' : ''} remaining.`)

    router.refresh()
    setLoading(false)
  }

  if (hasVoted) {
    return (
      <button
        onClick={handleUndo}
        disabled={loading}
        className="px-4 py-2 rounded-lg font-medium text-sm transition bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
      >
        {loading ? '...' : 'Undo'}
      </button>
    )
  }

  return (
    <button
      onClick={handleVote}
      disabled={loading || disabled}
      className={`px-4 py-2 rounded-lg font-medium text-sm transition ${
        disabled
          ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-purple-100 dark:hover:bg-purple-900/30 hover:text-purple-700 dark:hover:text-purple-300'
      } disabled:opacity-50`}
    >
      {loading ? '...' : 'Vote'}
    </button>
  )
}
