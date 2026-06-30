import { redirect } from 'next/navigation'

// Per-group prompt management moved to /g/[slug]/admin (PR3). The only remaining
// /admin surface is the super-admin group directory; send /admin there.
export default function AdminIndexPage() {
  redirect('/admin/groups')
}
