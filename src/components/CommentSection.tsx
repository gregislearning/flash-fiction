'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { SubmissionComment } from '@/types/database'

interface CommentSectionProps {
  submissionId: string
}

export default function CommentSection({ submissionId }: CommentSectionProps) {
  const [comments, setComments] = useState<(SubmissionComment & { email?: string })[]>([])
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

  return (
    <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
      <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
        {commentCount === 0
          ? 'Comments'
          : `${commentCount} comment${commentCount !== 1 ? 's' : ''}`}
      </h4>

      {loading ? (
        <p className="text-sm text-zinc-400">Loading comments...</p>
      ) : (
        <>
          {comments.length > 0 && (
            <div className="space-y-3 mb-4">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="text-sm bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3"
                >
                  {editingId === comment.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full text-sm bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg p-2 text-zinc-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      <p className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                        {comment.content}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-zinc-400">
                          {new Date(comment.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                        {userId === comment.user_id && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => startEditing(comment)}
                              className="text-xs text-zinc-400 hover:text-blue-500 dark:hover:text-blue-400 transition"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(comment.id)}
                              className="text-xs text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
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
                className="flex-1 text-sm bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={submitting || !newComment.trim()}
                className="text-sm px-4 py-2 rounded-lg font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition disabled:opacity-50"
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
