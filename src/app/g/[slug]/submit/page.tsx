import { createClient } from '@/lib/supabase/server'
import { getCurrentPrompt } from '@/lib/prompts'
import { getGroupBySlug } from '@/lib/groups'
import { getPromptPhase } from '@/lib/utils'
import { redirect, notFound } from 'next/navigation'
import SubmissionForm from '@/components/SubmissionForm'
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
