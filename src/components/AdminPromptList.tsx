'use client'

import { Prompt } from '@/types/database'
import { getPromptPhase, getPhaseLabel, getPhaseColor, formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface AdminPromptListProps {
  prompts: Prompt[]
}

export default function AdminPromptList({ prompts }: AdminPromptListProps) {
  const [deleting, setDeleting] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleDelete = async (promptId: string) => {
    if (!confirm('Are you sure you want to delete this prompt? This will also delete all submissions and votes.')) {
      return
    }

    setDeleting(promptId)

    const { error } = await supabase
      .from('prompts')
      .delete()
      .eq('id', promptId)

    if (error) {
      alert('Failed to delete prompt: ' + error.message)
    } else {
      router.refresh()
    }

    setDeleting(null)
  }

  if (prompts.length === 0) {
    return (
      <p className="text-zinc-500 dark:text-zinc-400 text-sm">
        No prompts created yet.
      </p>
    )
  }

  return (
    <div className="space-y-4 max-h-[600px] overflow-y-auto">
      {prompts.map((prompt) => {
        const phase = getPromptPhase(prompt)
        return (
          <div
            key={prompt.id}
            className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-medium text-zinc-900 dark:text-white text-sm">
                {prompt.title}
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPhaseColor(phase)}`}>
                {getPhaseLabel(phase)}
              </span>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3 line-clamp-2">
              {prompt.description}
            </p>
            <div className="text-xs text-zinc-500 dark:text-zinc-500 space-y-1">
              <p>Word limit: {prompt.word_limit}</p>
              <p>Writing: {formatDate(prompt.submission_start)} - {formatDate(prompt.submission_end)}</p>
              <p>Voting ends: {formatDate(prompt.voting_end)}</p>
            </div>
            <button
              onClick={() => handleDelete(prompt.id)}
              disabled={deleting === prompt.id}
              className="mt-3 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50"
            >
              {deleting === prompt.id ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
