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

  const commentCount = comments.length

  function getInitial(email: string) {
    return email.charAt(0).toUpperCase()
  }

  function timeAgo(dateStr: string) {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  return (
    <div className="mt-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-1 h-6 rounded-full bg-amber-500" />
        <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
          Comments
        </h3>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-400">Loading comments...</p>
      ) : (
        <>
          {comments.length > 0 && (
            <div className="space-y-5 mb-5">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-300 dark:bg-zinc-700 flex items-center justify-center">
                    <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300">
                      {getInitial(comment.author_email)}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    {editingId === comment.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg p-2.5 text-zinc-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUpdate(comment.id)}
                            className="text-xs px-3 py-1 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition font-medium"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs px-3 py-1 rounded-md bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                            {comment.author_email.split('@')[0]}
                          </span>
                          <span className="text-xs text-zinc-400 dark:text-zinc-600">
                            {timeAgo(comment.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">
                          {comment.content}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          {userId === comment.user_id && (
                            <>
                              <button
                                onClick={() => startEditing(comment)}
                                className="text-xs font-medium uppercase tracking-wider text-zinc-400 hover:text-amber-500 dark:hover:text-amber-400 transition"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(comment.id)}
                                className="text-xs font-medium uppercase tracking-wider text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {commentCount === 0 && (
            <p className="text-sm text-zinc-400 dark:text-zinc-600 mb-4">
              No comments yet. Be the first to share your thoughts.
            </p>
          )}

          {userId && (
            <form onSubmit={handleSubmit} className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-300 dark:bg-zinc-700 flex items-center justify-center">
                <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300">?</span>
              </div>
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                type="submit"
                disabled={submitting || !newComment.trim()}
                className="text-sm px-4 py-2 rounded-lg font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition disabled:opacity-50"
              >
                {submitting ? '...' : 'Post'}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  )
}
