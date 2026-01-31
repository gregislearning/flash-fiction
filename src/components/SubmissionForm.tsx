'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { countWords } from '@/lib/utils'
import { Prompt, Submission } from '@/types/database'

interface SubmissionFormProps {
  prompt: Prompt
  existingSubmission: Submission | null
}

export default function SubmissionForm({ prompt, existingSubmission }: SubmissionFormProps) {
  const [content, setContent] = useState(existingSubmission?.content || '')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const wordCount = countWords(content)
  const isOverLimit = wordCount > prompt.word_limit
  const isEmpty = wordCount === 0

  useEffect(() => {
    setSaved(false)
  }, [content])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (isEmpty) {
      setError('Please write something before submitting')
      return
    }

    if (isOverLimit) {
      setError(`Your story exceeds the ${prompt.word_limit} word limit`)
      return
    }

    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      setError('You must be signed in to submit')
      setLoading(false)
      return
    }

    if (existingSubmission) {
      // Update existing submission
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('submissions')
        .update({
          content,
          word_count: wordCount,
        })
        .eq('id', existingSubmission.id)

      if (error) {
        setError(error.message)
        setLoading(false)
      } else {
        setSaved(true)
        setLoading(false)
      }
    } else {
      // Create new submission
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('submissions')
        .insert({
          prompt_id: prompt.id,
          user_id: user.id,
          content,
          word_count: wordCount,
        })

      if (error) {
        setError(error.message)
        setLoading(false)
      } else {
        router.push('/')
        router.refresh()
      }
    }
  }

  const handleDelete = async () => {
    if (!existingSubmission) return
    
    if (!confirm('Are you sure you want to delete your submission?')) {
      return
    }

    setLoading(true)
    
    const { error } = await supabase
      .from('submissions')
      .delete()
      .eq('id', existingSubmission.id)

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg">
          {error}
        </div>
      )}

      {saved && (
        <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 p-4 rounded-lg">
          Your changes have been saved!
        </div>
      )}

      <div>
        <div className="flex justify-between items-center mb-2">
          <label
            htmlFor="content"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Your Story
          </label>
          <span
            className={`text-sm font-medium ${
              isOverLimit
                ? 'text-red-600 dark:text-red-400'
                : wordCount > prompt.word_limit * 0.9
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            {wordCount} / {prompt.word_limit} words
          </span>
        </div>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={16}
          className={`w-full px-4 py-3 rounded-lg border ${
            isOverLimit
              ? 'border-red-300 dark:border-red-700 focus:ring-red-500'
              : 'border-zinc-300 dark:border-zinc-700 focus:ring-blue-500'
          } bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:border-transparent outline-none transition font-mono text-sm leading-relaxed`}
          placeholder="Begin your story here..."
        />
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Write your flash fiction based on the prompt above. Be creative and concise!
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <button
          type="submit"
          disabled={loading || isEmpty}
          className="flex-1 py-3 px-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg font-medium hover:bg-zinc-800 dark:hover:bg-zinc-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading
            ? 'Saving...'
            : existingSubmission
            ? 'Save Changes'
            : 'Submit Story'}
        </button>

        {existingSubmission && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="py-3 px-4 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg font-medium hover:bg-red-200 dark:hover:bg-red-900/40 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  )
}
