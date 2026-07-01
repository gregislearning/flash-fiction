import { createClient } from '@/lib/supabase/server'
import { Group, GroupInvitation } from '@/types/database'

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

// ───────────────────────────────────────────────────────────────────────────
// PR3: group management, invites, and the membership write path.
// Membership/group writes that RLS blocks for the caller go through the
// migration 011 SECURITY DEFINER functions (create_group / accept_invitation /
// claim_my_invitations / my_pending_invitations); admin-managed invitation rows
// go through ordinary RLS (the group_invitations admin policies).
// ───────────────────────────────────────────────────────────────────────────

/** The groups the current user belongs to — powers the Header switcher. */
export async function getUserGroups(): Promise<Pick<Group, 'id' | 'name' | 'slug'>[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('group_members')
    .select('groups(id, name, slug)')
    .eq('user_id', user.id)

  const groups = (data ?? [])
    .map((row) => (row as unknown as { groups: Pick<Group, 'id' | 'name' | 'slug'> | null }).groups)
    .filter((g): g is Pick<Group, 'id' | 'name' | 'slug'> => g !== null)

  return groups.sort((a, b) => a.name.localeCompare(b.name))
}

export type CreateGroupResult = { slug: string; adminInviteToken: string | null }

/**
 * Super-admin only (enforced in the DB function). Creates a group and assigns
 * its first admin by email — an existing account becomes an admin member,
 * otherwise an admin invitation is created and its token returned so the caller
 * can surface the copy/paste accept link.
 */
export async function createGroup(
  name: string,
  slug: string,
  adminEmail: string
): Promise<CreateGroupResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_group', {
    p_name: name,
    p_slug: slug,
    p_admin_email: adminEmail,
  })
  if (error) throw new Error(error.message)
  const result = data as { slug: string; admin_invite_token: string | null }
  return { slug: result.slug, adminInviteToken: result.admin_invite_token }
}

/** Open (unaccepted) invitations for a group — group-admin view. */
export async function listGroupInvitations(groupId: string): Promise<GroupInvitation[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('group_invitations')
    .select('*')
    .eq('group_id', groupId)
    .is('accepted_at', null)
    .order('created_at', { ascending: false })

  return (data as GroupInvitation[] | null) ?? []
}

export type InvitationView = {
  groupName: string
  groupSlug: string
  email: string
  role: GroupRole
  accepted: boolean
}

/** Public invite details for the /invite/[token] accept page (or null). */
export async function getInvitationByToken(token: string): Promise<InvitationView | null> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('get_invitation_by_token', { p_token: token })
  if (!data) return null
  const r = data as {
    group_name: string; group_slug: string; email: string; role: GroupRole; accepted: boolean
  }
  return {
    groupName: r.group_name,
    groupSlug: r.group_slug,
    email: r.email,
    role: r.role,
    accepted: r.accepted,
  }
}

export type PendingInvitation = { token: string; groupName: string; groupSlug: string; role: GroupRole }

/** Invitations awaiting the current (verified) user — powers the empty state. */
export async function getMyPendingInvitations(): Promise<PendingInvitation[]> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('my_pending_invitations')
  return ((data as { token: string; group_name: string; group_slug: string; role: GroupRole }[] | null) ?? [])
    .map((r) => ({ token: r.token, groupName: r.group_name, groupSlug: r.group_slug, role: r.role }))
}

export type GroupMember = { userId: string; email: string; role: GroupRole; joinedAt: string }

/**
 * A group's member roster (email + role), for the group-admin UI. Returns rows
 * only when the caller is a group admin / super-admin (gated in the DB function,
 * which also crosses the auth.users email boundary via SECURITY DEFINER).
 */
export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('get_group_members', { p_group_id: groupId })
  return ((data as { user_id: string; email: string; role: GroupRole; joined_at: string }[] | null) ?? [])
    .map((r) => ({ userId: r.user_id, email: r.email, role: r.role, joinedAt: r.joined_at }))
}
