import { createClient } from '@/lib/supabase/server'
import { listListedGroups, getUserGroups, getMyPendingInvitations } from '@/lib/groups'
import PendingInvitesBanner from '@/components/PendingInvitesBanner'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function DirectoryPage() {
  const groups = await listListedGroups()

  // For a signed-in user, surface pending invites and a "no group yet" hint.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const [pendingInvitations, myGroups] = user
    ? await Promise.all([getMyPendingInvitations(), getUserGroups()])
    : [[], []]
  const showNoGroupHint = !!user && myGroups.length === 0 && pendingInvitations.length === 0

  return (
    <main className="min-h-[calc(100vh-65px)] py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">
            Flash Fiction
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Pick a group to read its prompt and submissions.
          </p>
        </div>

        <PendingInvitesBanner invitations={pendingInvitations} />

        {showNoGroupHint && (
          <div className="mb-8 text-center py-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <p className="text-zinc-600 dark:text-zinc-400">
              You&apos;re not in a group yet — ask an admin to invite you.
            </p>
          </div>
        )}

        {groups.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
            <p className="text-zinc-600 dark:text-zinc-400">
              No groups yet. Check back soon!
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {groups.map((group) => (
              <li key={group.id}>
                <Link
                  href={`/g/${group.slug}`}
                  className="block bg-white dark:bg-zinc-900 rounded-2xl shadow-sm p-6 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition"
                >
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                    {group.name}
                  </h2>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
