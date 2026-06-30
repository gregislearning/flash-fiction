import { createClient } from '@/lib/supabase/server'
import { Group } from '@/types/database'

/**
 * Group resolution + membership guards — the single place the app turns a URL
 * slug into a group and answers "who can do what in this group." RLS still
 * enforces the tenant boundary at the database; these helpers are the app-layer
 * counterpart (one audit point, no drift across pages).
 *
 * PR1: read-only resolution + the public directory listing.
 * PR2 (here): membership/role lookups + requireMembership / requireGroupAdmin,
 * backed by the group_members table and matching the DB's is_group_member /
 * is_group_admin semantics (super-admin counts as admin of every group).
 */

export type GroupRole = 'admin' | 'member'

/** Resolve a group by its slug. Returns null if no such group exists. */
export async function getGroupBySlug(slug: string): Promise<Group | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('groups')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  return (data as Group | null) ?? null
}

/** All groups shown in the public `/` directory (name + slug, listed only). */
export async function listListedGroups(): Promise<Pick<Group, 'id' | 'name' | 'slug'>[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('groups')
    .select('id, name, slug')
    .eq('listed', true)
    .order('name', { ascending: true })

  return (data as Pick<Group, 'id' | 'name' | 'slug'>[] | null) ?? []
}

/**
 * The default group — used by the (still single-group) admin flow in PR1 to
 * satisfy prompts.group_id NOT NULL. PR3's group-scoped admin passes its own
 * group instead.
 */
export async function getDefaultGroup(): Promise<Group | null> {
  return getGroupBySlug('flash-fiction')
}

/**
 * The current user's role in a group, or null if they're not a member.
 * Mirrors the DB's is_group_admin: a site-wide super-admin
 * (user_metadata.is_admin) is treated as 'admin' of every group. Returns null
 * for logged-out users.
 */
export async function getGroupRole(groupId: string): Promise<GroupRole | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  if (user.user_metadata?.is_admin === true) return 'admin'

  // Own-row read is permitted by the group_members SELECT policy.
  const { data } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .maybeSingle()

  return (data?.role as GroupRole | undefined) ?? null
}

/** True if the current user participates in (is a member of) the group. */
export async function isGroupMember(groupId: string): Promise<boolean> {
  return (await getGroupRole(groupId)) !== null
}

/** True if the current user is a group admin (or a super-admin). */
export async function isGroupAdmin(groupId: string): Promise<boolean> {
  return (await getGroupRole(groupId)) === 'admin'
}

/**
 * Guard for participation surfaces (submit/vote/comment). Returns the user's
 * role when they may participate; returns null when they may not, so the caller
 * can render the PR3 "join to participate" / pending-invite state. The DB RLS is
 * the hard enforcement — this is the UX-layer gate.
 */
export async function requireMembership(group: Group): Promise<GroupRole | null> {
  return getGroupRole(group.id)
}

/**
 * Guard for group-admin surfaces (prompt management). Returns true when the
 * current user may manage the group. The middleware + DB RLS are the hard
 * enforcement; this keeps server components to a one-liner.
 */
export async function requireGroupAdmin(group: Group): Promise<boolean> {
  return isGroupAdmin(group.id)
}
