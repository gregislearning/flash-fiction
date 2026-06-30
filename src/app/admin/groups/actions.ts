'use server'

import { revalidatePath } from 'next/cache'
import { createGroup } from '@/lib/groups'

export type CreateGroupState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'success'; slug: string; adminInviteToken: string | null }

/**
 * Super-admin group creation. Authorization is enforced in the DB function
 * (create_group rejects non-super-admins); this action just relays the form and
 * surfaces the slug + optional admin-invite token back to the form.
 */
export async function createGroupAction(
  _prev: CreateGroupState,
  formData: FormData
): Promise<CreateGroupState> {
  const name = String(formData.get('name') ?? '').trim()
  const slug = String(formData.get('slug') ?? '').trim()
  const adminEmail = String(formData.get('adminEmail') ?? '').trim()

  if (!name || !slug || !adminEmail) {
    return { status: 'error', message: 'All fields are required.' }
  }

  try {
    const { slug: createdSlug, adminInviteToken } = await createGroup(name, slug, adminEmail)
    revalidatePath('/admin/groups')
    revalidatePath('/')
    return { status: 'success', slug: createdSlug, adminInviteToken }
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'Could not create group.' }
  }
}
