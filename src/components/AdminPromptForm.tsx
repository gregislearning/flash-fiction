'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Database } from '@/types/database'

type PromptInsert = Database['public']['Tables']['prompts']['Insert']

export default function AdminPromptForm() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [wordLimit, setWordLimit] = useState(300)
  const [submissionStart, setSubmissionStart] = useState('')
  const [submissionEnd, setSubmissionEnd] = useState('')
  const [votingEnd, setVotingEnd] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    // Validate dates
    const startDate = new Date(submissionStart)
    const endDate = new Date(submissionEnd)
    const voteEndDate = new Date(votingEnd)

    if (startDate >= endDate) {
      setError('Submission end must be after submission start')
      return
    }

    if (endDate >= voteEndDate) {
      setError('Voting end must be after submission end')
      return
    }

    setLoading(true)

    const promptData: PromptInsert = {
      title,
      description,
      word_limit: wordLimit,
      submission_start: startDate.toISOString(),
      submission_end: endDate.toISOString(),
      voting_end: voteEndDate.toISOString(),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('prompts').insert(promptData)

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
      setTitle('')
      setDescription('')
      setWordLimit(300)
      setSubmissionStart('')
      setSubmissionEnd('')
      setVotingEnd('')
      setLoading(false)
      router.refresh()
    }
  }

  // Helper to get default datetime values
  const getDefaultDateTime = (hoursFromNow: number) => {
    const date = new Date()
    date.setHours(date.getHours() + hoursFromNow)
    return date.toISOString().slice(0, 16)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 p-3 rounded-lg text-sm">
          Prompt created successfully!
        </div>
      )}

      <div>
        <label
          htmlFor="title"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
        >
          Title
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition text-sm"
          placeholder="e.g., The Last Sunset"
        />
      </div>

      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
        >
          Description / Prompt
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition text-sm"
          placeholder="Write a story about..."
        />
      </div>

      <div>
        <label
          htmlFor="wordLimit"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
        >
          Word Limit
        </label>
        <input
          id="wordLimit"
          type="number"
          value={wordLimit}
          onChange={(e) => setWordLimit(parseInt(e.target.value) || 300)}
          required
          min={50}
          max={5000}
          className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="submissionStart"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
        >
          Writing Starts
        </label>
        <input
          id="submissionStart"
          type="datetime-local"
          value={submissionStart}
          onChange={(e) => setSubmissionStart(e.target.value)}
          required
          className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="submissionEnd"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
        >
          Writing Ends / Voting Starts
        </label>
        <input
          id="submissionEnd"
          type="datetime-local"
          value={submissionEnd}
          onChange={(e) => setSubmissionEnd(e.target.value)}
          required
          className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="votingEnd"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
        >
          Voting Ends
        </label>
        <input
          id="votingEnd"
          type="datetime-local"
          value={votingEnd}
          onChange={(e) => setVotingEnd(e.target.value)}
          required
          className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 px-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg font-medium hover:bg-zinc-800 dark:hover:bg-zinc-100 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
      >
        {loading ? 'Creating...' : 'Create Prompt'}
      </button>
    </form>
  )
}
