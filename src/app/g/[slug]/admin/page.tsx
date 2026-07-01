import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import AdminPromptForm from '@/components/AdminPromptForm'
import AdminPromptList from '@/components/AdminPromptList'
import GroupInviteManager from '@/components/GroupInviteManager'
import { getGroupBySlug, requireGroupAdmin, listGroupInvitations, getGroupMembers } from '@/lib/groups'

export const dynamic = 'force-dynamic'

export default async function GroupAdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const group = await getGroupBySlug(slug)
  if (!group) notFound()

  // Middleware already gates this route; re-check here as defense-in-depth and
  // to handle the auth edge (expired session between middleware and render).
  if (!(await requireGroupAdmin(group))) {
    redirect(`/g/${slug}`)
  }

  const supabase = await createClient()
  const { data: prompts } = await supabase
    .from('prompts')
    .select('*')
    .eq('group_id', group.id)
    .order('created_at', { ascending: false })

  const invitations = await listGroupInvitations(group.id)
  const members = await getGroupMembers(group.id)

  return (
    <main className="min-h-[calc(100vh-65px)] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            <Link href={`/g/${slug}`} className="hover:underline">{group.name}</Link> · Admin
          </p>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">
            Manage {group.name}
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Create prompts and invite writers to this group.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-6 border border-zinc-200 dark:border-zinc-800">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-6">
              Create New Prompt
            </h2>
            <AdminPromptForm groupId={group.id} />
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-6 border border-zinc-200 dark:border-zinc-800">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-6">
              Existing Prompts
            </h2>
            <AdminPromptList prompts={prompts || []} />
          </div>
        </div>

        <div className="mt-8 bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-6 border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Members</h2>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {members.length} {members.length === 1 ? 'member' : 'members'}
            </span>
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No members yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between py-3">
                  <span className="text-sm text-zinc-900 dark:text-white break-all">{m.email}</span>
                  <span
                    className={
                      m.role === 'admin'
                        ? 'text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                        : 'text-xs font-medium px-2 py-1 rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                    }
                  >
                    {m.role}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
            Super-admins can manage any group and may not appear here unless they&apos;re also a member.
          </p>
        </div>

        <div className="mt-8 bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-6 border border-zinc-200 dark:border-zinc-800">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-6">
            Invite Writers
          </h2>
          <GroupInviteManager groupId={group.id} initialInvitations={invitations} />
        </div>
      </div>
    </main>
  )
}
