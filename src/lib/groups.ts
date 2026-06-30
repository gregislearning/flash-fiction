import { createClient } from '@/lib/supabase/server'
import { Group } from '@/types/database'

/**
 * Group resolution helpers — the single place the app turns a URL slug into a
 * group. RLS still enforces the tenant boundary at the database; these helpers
 * are the app-layer counterpart.
 *
 * PR1 scope: read-only resolution + the public directory listing. Membership
 * guards (requireMembership / requireGroupAdmin) arrive in PR2 alongside the
 * group_members table.
 */

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
