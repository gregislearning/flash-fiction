import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import AcceptInviteButton from '@/components/AcceptInviteButton'
import { getInvitationByToken } from '@/lib/groups'

export const dynamic = 'force-dynamic'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-[calc(100vh-65px)] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-8 border border-zinc-200 dark:border-zinc-800">
        {children}
      </div>
    </main>
  )
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invitation = await getInvitationByToken(token)

  if (!invitation) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">Invitation not found</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          This invite link is invalid or has been revoked.
        </p>
      </Shell>
    )
  }

  if (invitation.accepted) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
          Already accepted
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mb-6">
          This invitation to <strong>{invitation.groupName}</strong> has already been used.
        </p>
        <Link
          href={`/g/${invitation.groupSlug}`}
          className="inline-block px-6 py-3 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition font-medium"
        >
          Go to {invitation.groupName}
        </Link>
      </Shell>
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const next = `/invite/${token}`

  return (
    <Shell>
      <p className="text-sm uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
        You&apos;re invited
      </p>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
        Join {invitation.groupName}
      </h1>
      <p className="text-zinc-600 dark:text-zinc-400 mb-6">
        Invited as <strong>{invitation.role}</strong> · {invitation.email}
      </p>

      {user ? (
        <div className="flex flex-col items-center">
          <AcceptInviteButton token={token} groupSlug={invitation.groupSlug} />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Sign in or create an account with <strong>{invitation.email}</strong> to accept.
          </p>
          <div className="flex gap-3 justify-center">
            <Link
              href={`/auth/signup?next=${encodeURIComponent(next)}`}
              className="px-5 py-2.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition font-medium"
            >
              Sign up
            </Link>
            <Link
              href={`/auth/signin?next=${encodeURIComponent(next)}`}
              className="px-5 py-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition font-medium"
            >
              Sign in
            </Link>
          </div>
        </div>
      )}
    </Shell>
  )
}
