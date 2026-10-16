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

  // Mobile only: which drop-down panel under the header is open. One at a
  // time, since the search bar and the hamburger menu share the same spot.
  const [openPanel, setOpenPanel] = useState<'search' | 'menu' | null>(null)
  const closePanels = () => setOpenPanel(null)

  // Collapse any open panel when the user navigates elsewhere. Adjusting state
  // during render (instead of in an effect) avoids an extra render pass.
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setOpenPanel(null)
  }

  useEffect(() => {
    if (!openPanel) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenPanel(null) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openPanel])

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

  const groupSwitcher = (className: string) => (
    <select
      aria-label="Switch group"
      value={activeSlug && groups.some((g) => g.slug === activeSlug) ? activeSlug : ''}
      onChange={(e) => { if (e.target.value) router.push(`/g/${e.target.value}`) }}
      className={`text-sm font-medium px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-none focus:ring-2 focus:ring-zinc-400 ${className}`}
    >
      <option value="" disabled>Switch group…</option>
      {groups.map((g) => (
        <option key={g.id} value={g.slug}>{g.name}</option>
      ))}
    </select>
  )

  const menuLinkClass =
    'flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition'

  return (
    <>
      {/* Mobile: tapping anywhere outside an open panel closes it. Sits below
          the header (z-30) so header buttons stay tappable. */}
      {openPanel && (
        <div className="sm:hidden fixed inset-0 z-20" onClick={closePanels} aria-hidden />
      )}
      <header className="relative z-30 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-zinc-900 dark:text-white">
            Flash Fiction
          </Link>

          <div className="flex items-center gap-2 sm:gap-4">
            <Suspense fallback={null}>
              <SearchBox
                mobileOpen={openPanel === 'search'}
                onMobileOpenChange={(open) => setOpenPanel(open ? 'search' : null)}
              />
            </Suspense>

            <nav className="hidden sm:flex items-center gap-4">
              {user && groups.length > 0 && groupSwitcher('')}
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
                  <span className="text-sm text-zinc-500 dark:text-zinc-500">
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

            {/* Mobile: everything in the desktop nav moves into this menu. */}
            <button
              type="button"
              onClick={() => setOpenPanel(openPanel === 'menu' ? null : 'menu')}
              aria-label={
                openPanel === 'menu'
                  ? 'Close menu'
                  : unreadCount > 0 ? `Open menu (${unreadCount} unread notifications)` : 'Open menu'
              }
              aria-expanded={openPanel === 'menu'}
              aria-controls="mobile-menu"
              className="sm:hidden relative p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
            >
              {openPanel === 'menu' ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
              {unreadCount > 0 && openPanel !== 'menu' && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500 border-2 border-white dark:border-zinc-900" />
              )}
            </button>
          </div>
        </div>

        {openPanel === 'menu' && (
          <div
            id="mobile-menu"
            className="sm:hidden absolute inset-x-0 top-full px-4 py-3 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shadow-sm"
          >
            {loading ? (
              <div className="h-10 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
            ) : (
              <nav className="flex flex-col gap-1">
                {user && groups.length > 0 && groupSwitcher('w-full mb-2')}
                {activeSlug && (
                  <Link href={`/g/${activeSlug}/past`} onClick={closePanels} className={menuLinkClass}>
                    Past Submissions
                  </Link>
                )}
                {user ? (
                  <>
                    <Link href="/notifications" onClick={closePanels} className={menuLinkClass}>
                      Notifications
                      {unreadCount > 0 && (
                        <span className="min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">
                          {unreadCount}
                        </span>
                      )}
                    </Link>
                    {canManageActiveGroup && (
                      <Link href={`/g/${activeSlug}/admin`} onClick={closePanels} className={menuLinkClass}>
                        Manage group
                      </Link>
                    )}
                    {isSuperAdmin && (
                      <Link href="/admin/groups" onClick={closePanels} className={menuLinkClass}>
                        Groups
                      </Link>
                    )}
                    <div className="border-t border-zinc-200 dark:border-zinc-800 my-2" />
                    <p className="px-3 py-1 text-xs text-zinc-500 dark:text-zinc-500 truncate">
                      Signed in as {user.email}
                    </p>
                    <button
                      type="button"
                      onClick={() => { closePanels(); handleSignOut() }}
                      className={`${menuLinkClass} text-left`}
                    >
                      Sign Out
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/auth/signin" onClick={closePanels} className={menuLinkClass}>
                      Sign In
                    </Link>
                    <Link
                      href="/auth/signup"
                      onClick={closePanels}
                      className="mt-2 text-sm text-center px-4 py-2.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition"
                    >
                      Sign Up
                    </Link>
                  </>
                )}
              </nav>
            )}
          </div>
        )}
      </header>
    </>
  )
}
