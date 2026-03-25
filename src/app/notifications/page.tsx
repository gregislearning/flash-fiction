'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { Notification } from '@/types/database'

export default function NotificationsPage() {
  const supabase = createClient()
  const router = useRouter()

  const [user, setUser] = useState<User | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)
  const [markingId, setMarkingId] = useState<string | null>(null)

  const unreadCount = useMemo(
    () => notifications.filter((n) => n.unread).length,
    [notifications],
  )

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) {
        router.push('/auth/signin')
        return
      }

      const currentUser = authData.user ?? null
      setUser(currentUser)
      if (!currentUser) {
        router.push('/auth/signin')
        return
      }

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })

      if (!error) {
        setNotifications((data as Notification[]) || [])
      } else {
        setNotifications([])
      }

      setLoading(false)
    }

    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  async function refresh() {
    if (!user) return
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error) setNotifications((data as Notification[]) || [])
  }

  async function markAsRead(id: string) {
    if (!user) return
    setMarkingId(id)

    const readAt = new Date().toISOString()
    await supabase
      .from('notifications')
      .update({ unread: false, read_at: readAt })
      .eq('id', id)
      .eq('user_id', user.id)

    setMarkingId(null)
    await refresh()
  }

  async function markAllRead() {
    if (!user) return
    setMarkingAll(true)

    const readAt = new Date().toISOString()
    await supabase
      .from('notifications')
      .update({ unread: false, read_at: readAt })
      .eq('user_id', user.id)
      .eq('unread', true)

    setMarkingAll(false)
    await refresh()
  }

  const ordered = useMemo(() => {
    const unread = notifications.filter((n) => n.unread)
    const read = notifications.filter((n) => !n.unread)
    return [...unread, ...read]
  }, [notifications])

  return (
    <main className="min-h-[calc(100vh-65px)] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
          >
            &larr; Back
          </button>

          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mt-4">
            Notifications
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
              : 'All caught up.'}
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-6 border border-zinc-200 dark:border-zinc-800 mb-6">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              disabled={markingAll}
              className="text-sm px-4 py-2 rounded-lg font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition disabled:opacity-50"
            >
              {markingAll ? 'Marking…' : 'Mark all as read'}
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-sm text-zinc-400">Loading notifications...</div>
        ) : ordered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-zinc-600 dark:text-zinc-400">
              You have no notifications yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {ordered.map((n) => (
              <div
                key={n.id}
                className={`p-5 rounded-2xl border ${
                  n.unread
                    ? 'border-amber-300/60 bg-amber-50/40 dark:bg-amber-900/20'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-semibold ${
                        n.unread
                          ? 'text-amber-800 dark:text-amber-300'
                          : 'text-zinc-800 dark:text-zinc-200'
                      }`}
                    >
                      {n.message}
                    </p>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">
                      {n.comment_preview}
                    </p>
                    <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-600">
                      {timeAgo(n.created_at)}
                      {n.unread ? ' • unread' : ''}
                    </p>
                  </div>

                  {n.unread && (
                    <button
                      onClick={() => markAsRead(n.id)}
                      disabled={markingId === n.id}
                      className="shrink-0 text-xs px-3 py-2 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition disabled:opacity-50"
                    >
                      {markingId === n.id ? '...' : 'Mark read'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

