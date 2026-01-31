'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface VoteButtonProps {
  promptId: string
  submissionId: string
  hasVoted: boolean
  disabled: boolean
}

export default function VoteButton({
  promptId,
  submissionId,
  hasVoted,
  disabled,
}: VoteButtonProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleVote = async () => {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/auth/signin')
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any
    
    if (hasVoted) {
      // Remove vote
      await client
        .from('votes')
        .delete()
        .eq('prompt_id', promptId)
        .eq('user_id', user.id)
    } else {
      // Cast vote
      await client.from('votes').insert({
        prompt_id: promptId,
        submission_id: submissionId,
        user_id: user.id,
      })
    }

    router.refresh()
    setLoading(false)
  }

  return (
    <button
      onClick={handleVote}
      disabled={loading || disabled}
      className={`px-4 py-2 rounded-lg font-medium text-sm transition ${
        hasVoted
          ? 'bg-purple-600 text-white hover:bg-purple-700'
          : disabled
          ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-purple-100 dark:hover:bg-purple-900/30 hover:text-purple-700 dark:hover:text-purple-300'
      } disabled:opacity-50`}
    >
      {loading ? '...' : hasVoted ? 'Voted' : 'Vote'}
    </button>
  )
}
