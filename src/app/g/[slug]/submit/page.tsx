import { createClient } from '@/lib/supabase/server'
import { getCurrentPrompt } from '@/lib/prompts'
import { getGroupBySlug, isGroupMember, getMyPendingInvitations } from '@/lib/groups'
import { getPromptPhase } from '@/lib/utils'
import { redirect, notFound } from 'next/navigation'
import SubmissionForm from '@/components/SubmissionForm'
import AcceptInviteButton from '@/components/AcceptInviteButton'
import Link from 'next/link'
import { Submission } from '@/types/database'
import PromptBadges from '@/components/PromptBadges'

export const dynamic = 'force-dynamic'

export default async function SubmitPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const group = await getGroupBySlug(slug)
  if (!group) notFound()

  const base = `/g/${slug}`
  const supabase = await createClient()

  // Check if user is authenticated
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }

  // Public-read, membership-gated write: a non-member can view the group but
  // can't submit (RLS blocks the insert). Stop here with a read-only state
  // instead of handing them a form that fails on submit. Surface an "Accept
  // invitation" button when a pending invite to this group matches their email.
  if (!(await isGroupMember(group.id))) {
    const pending = (await getMyPendingInvitations()).find((inv) => inv.groupSlug === slug)
    return (
      <main className="min-h-[calc(100vh-65px)] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-8 border border-zinc-200 dark:border-zinc-800">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 mb-4">
            Read only
          </span>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
            You&apos;re not a member of {group.name}
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mb-6">
            You can read this group&apos;s prompts and stories, but only members can submit.
            {pending ? ' You have a pending invitation — accept it to start writing.' : ' Ask an admin to invite you.'}
          </p>
          {pending ? (
            <div className="flex justify-center">
              <AcceptInviteButton token={pending.token} groupSlug={slug} />
            </div>
          ) : (
            <Link
              href={base}
              className="inline-block px-6 py-3 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition font-medium"
            >
              Back to {group.name}
            </Link>
          )}
        </div>
      </main>
    )
  }

  const prompt = await getCurrentPrompt(group.id)

  if (!prompt) {
    return (
      <main className="min-h-[calc(100vh-65px)] flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
            No Active Prompt
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mb-6">
            There&apos;s no prompt to write for at the moment.
          </p>
          <Link
            href={base}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Go back home
          </Link>
        </div>
      </main>
    )
  }

  const phase = getPromptPhase(prompt)

  if (phase !== 'writing') {
    return (
      <main className="min-h-[calc(100vh-65px)] flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
            {phase === 'upcoming'
              ? 'Writing Hasn\'t Started Yet'
              : 'Writing Phase Has Ended'}
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mb-6">
            {phase === 'upcoming'
              ? 'Come back when the writing phase begins!'
              : phase === 'voting'
              ? 'The voting phase is now open. Read and vote for your favorite!'
              : 'Check out the results to see who won!'}
          </p>
          <Link
            href={base}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Go back home
          </Link>
        </div>
      </main>
    )
  }

  // Get user's existing submission if any
  const { data: existingSubmissionData } = await supabase
    .from('submissions')
    .select('*')
    .eq('prompt_id', prompt.id)
    .eq('user_id', user.id)
    .single()

  const existingSubmission = existingSubmissionData as Submission | null

  return (
    <main className="min-h-[calc(100vh-65px)] py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Link
            href={base}
            className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
          >
            &larr; Back to prompt
          </Link>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-8 border border-zinc-200 dark:border-zinc-800 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              Writing Phase
            </span>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {prompt.word_limit} words max
            </span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
            {prompt.title}
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            {prompt.description}
          </p>
          <div className="mt-3">
            <PromptBadges object={prompt.object} location={prompt.location} />
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-8 border border-zinc-200 dark:border-zinc-800">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-6">
            {existingSubmission ? 'Edit Your Story' : 'Write Your Story'}
          </h2>
          <SubmissionForm prompt={prompt} existingSubmission={existingSubmission} homeHref={base} />
        </div>
      </div>
    </main>
  )
}
