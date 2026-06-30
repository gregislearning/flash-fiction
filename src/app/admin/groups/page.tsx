import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import CreateGroupForm from '@/components/CreateGroupForm'
import { Group } from '@/types/database'

export const dynamic = 'force-dynamic'

// Super-admin only (enforced by middleware on /admin/* and by create_group in
// the DB). Cross-group surface — stays outside /g/[slug].
export default async function AdminGroupsPage() {
  const supabase = await createClient()
  const { data: groups } = await supabase
    .from('groups')
    .select('id, name, slug')
    .order('name', { ascending: true })

  const groupList = (groups as Pick<Group, 'id' | 'name' | 'slug'>[] | null) ?? []

  return (
    <main className="min-h-[calc(100vh-65px)] py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">Groups</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Create groups and assign each group&apos;s first admin.
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-6 border border-zinc-200 dark:border-zinc-800 mb-8">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-6">New group</h2>
          <CreateGroupForm />
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-6 border border-zinc-200 dark:border-zinc-800">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-4">All groups</h2>
          {groupList.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No groups yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {groupList.map((g) => (
                <li key={g.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-white">{g.name}</p>
                    <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400">/g/{g.slug}</p>
                  </div>
                  <Link
                    href={`/g/${g.slug}/admin`}
                    className="text-sm px-3 py-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
                  >
                    Manage
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  )
}
