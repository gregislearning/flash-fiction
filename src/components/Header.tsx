'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState, Suspense } from 'react'
import { User } from '@supabase/supabase-js'
import SearchBox from './SearchBox'
import { groupSlugFromPathname } from '@/lib/utils'

type SwitcherGroup = { id: string; name: string; slug: string; role: 'admin' | 'member' }

export default function Header() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [groups, setGroups] = useState<SwitcherGroup[]>([])
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  // The group currently being viewed (null on the `/` directory and auth pages).
  const activeSlug = groupSlugFromPathname(pathname)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }
    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  // The user's groups, for the switcher + the active-group admin link.
  useEffect(() => {
    const loadGroups = async () => {
      if (!user) {
        setGroups([])
        return
      }
      const { data } = await supabase
        .from('group_members')
        .select('role, groups(id, name, slug)')
        .eq('user_id', user.id)

      const list = (data ?? [])
        .map((row) => {
          const r = row as unknown as { role: 'admin' | 'member'; groups: { id: string; name: string; slug: string } | null }
          return r.groups ? { ...r.groups, role: r.role } : null
        })
        .filter((g): g is SwitcherGroup => g !== null)
        .sort((a, b) => a.name.localeCompare(b.name))

      setGroups(list)
    }
    loadGroups()
    // Re-fetch on navigation too: joining a group (invite accept) changes
    // membership without changing user.id, so key on the path to keep the
    // switcher fresh once the user lands in the newly-joined group.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, pathname])

  useEffect(() => {
    const loadUnreadCount = async () => {
      if (!user) {
        setUnreadCount(0)
        return
      }

      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('unread', true)

      if (!error) {
        setUnreadCount(count ?? 0)
      }
    }

    loadUnreadCount()

    if (!user) return

    const channel = supabase
      .channel('header-notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => { loadUnreadCount() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const isSuperAdmin = user?.user_metadata?.is_admin === true
  const activeGroupRole = groups.find((g) => g.slug === activeSlug)?.role
  // Can manage the group currently in the URL (super-admin manages any).
  const canManageActiveGroup = !!activeSlug && (isSuperAdmin || activeGroupRole === 'admin')

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-zinc-900 dark:text-white">
          Flash Fiction
        </Link>

        <nav className="flex items-center gap-4">
          <Suspense fallback={null}>
            <SearchBox />
          </Suspense>
          {user && groups.length > 0 && (
            <select
              aria-label="Switch group"
              value={activeSlug && groups.some((g) => g.slug === activeSlug) ? activeSlug : ''}
              onChange={(e) => { if (e.target.value) router.push(`/g/${e.target.value}`) }}
              className="text-sm font-medium px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-none focus:ring-2 focus:ring-zinc-400"
            >
              <option value="" disabled>Switch group…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.slug}>{g.name}</option>
              ))}
            </select>
          )}
          {activeSlug && (
            <Link
              href={`/g/${activeSlug}/past`}
              className="text-sm font-medium px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
            >
              Past Submissions
            </Link>
          )}
          {loading ? (
            <div className="w-20 h-8 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
          ) : user ? (
            <>
              <Link
                href="/notifications"
                className="relative text-sm font-medium px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
              >
                Notifications
                {unreadCount > 0 && (
                  <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center border-2 border-white dark:border-zinc-900">
                    {unreadCount}
                  </span>
                )}
              </Link>
              {canManageActiveGroup && (
                <Link
                  href={`/g/${activeSlug}/admin`}
                  className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition"
                >
                  Manage group
                </Link>
              )}
              {isSuperAdmin && (
                <Link
                  href="/admin/groups"
                  className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition"
                >
                  Groups
                </Link>
              )}
              <span className="text-sm text-zinc-500 dark:text-zinc-500 hidden sm:inline">
                {user.email}
              </span>
              <button
                onClick={handleSignOut}
                className="text-sm px-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
              >
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/auth/signin"
                className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition"
              >
                Sign In
              </Link>
              <Link
                href="/auth/signup"
                className="text-sm px-4 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition"
              >
                Sign Up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
