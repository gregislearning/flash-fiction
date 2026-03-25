'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { SubmissionComment } from '@/types/database'

interface CommentSectionProps {
  submissionId: string
}

export default function CommentSection({ submissionId }: CommentSectionProps) {
  const [comments, setComments] = useState<SubmissionComment[]>([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any

  useEffect(() => {
    fetchComments()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId])

  async function fetchComments() {
    setLoading(true)
    const { data } = await client
      .from('submission_comments')
      .select('*')
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: true })

    setComments(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!newComment.trim()) return

    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/auth/signin')
      return
    }

    await client.from('submission_comments').insert({
      submission_id: submissionId,
      user_id: user.id,
      author_email: user.email,
      content: newComment.trim(),
    })

    setNewComment('')
    setSubmitting(false)
    fetchComments()
  }

  async function handleUpdate(commentId: string) {
    if (!editContent.trim()) return

    await client
      .from('submission_comments')
      .update({ content: editContent.trim() })
      .eq('id', commentId)

    setEditingId(null)
    setEditContent('')
    fetchComments()
  }

  async function handleDelete(commentId: string) {
    await client
      .from('submission_comments')
      .delete()
      .eq('id', commentId)

    fetchComments()
  }

  function startEditing(comment: SubmissionComment) {
    setEditingId(comment.id)
    setEditContent(comment.content)
  }

  const [expanded, setExpanded] = useState(false)
  const commentCount = comments.length

  return (
    <div className="mt-5 pt-4 border-t border-dashed border-zinc-300 dark:border-zinc-700">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition"
      >
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {loading
          ? 'Comments'
          : commentCount === 0
          ? 'Comments'
          : `${commentCount} comment${commentCount !== 1 ? 's' : ''}`}
      </button>

      {expanded && (
        <div className="mt-3 ml-2 pl-4 border-l-2 border-zinc-200 dark:border-zinc-700">
          {loading ? (
            <p className="text-xs text-zinc-400">Loading...</p>
          ) : (
            <>
              {comments.length > 0 && (
                <div className="space-y-4 mb-4">
                  {comments.map((comment) => (
                    <div key={comment.id}>
                      {editingId === comment.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-zinc-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleUpdate(comment.id)}
                              className="text-xs px-3 py-1 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-xs px-3 py-1 rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-600 transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                              {comment.author_email}
                            </span>
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-600">
                              {new Date(comment.created_at).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">
                            {comment.content}
                          </p>
                          {userId === comment.user_id && (
                            <div className="flex gap-2 mt-1">
                              <button
                                onClick={() => startEditing(comment)}
                                className="text-[10px] text-zinc-400 hover:text-blue-500 dark:hover:text-blue-400 transition"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(comment.id)}
                                className="text-[10px] text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {userId && (
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    className="flex-1 text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-1.5 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={submitting || !newComment.trim()}
                    className="text-xs px-3 py-1.5 rounded-md font-medium bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition disabled:opacity-50"
                  >
                    {submitting ? '...' : 'Post'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
