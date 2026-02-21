'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface ClaimButtonProps {
  submissionId: string
  claimed: boolean
}

export default function ClaimButton({ submissionId, claimed }: ClaimButtonProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleClaim = async () => {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/auth/signin')
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any

    if (claimed) {
      await client
        .from('submissions')
        .update({ claimed: false, author_email: null })
        .eq('id', submissionId)
    } else {
      await client
        .from('submissions')
        .update({ claimed: true, author_email: user.email })
        .eq('id', submissionId)
    }

    router.refresh()
    setLoading(false)
  }

  return (
    <button
      onClick={handleClaim}
      disabled={loading}
      className={`px-4 py-2 rounded-lg font-medium text-sm transition ${
        claimed
          ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-900/50'
          : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/50'
      } disabled:opacity-50`}
    >
      {loading ? '...' : claimed ? 'Unclaim' : 'Claim'}
    </button>
  )
}
