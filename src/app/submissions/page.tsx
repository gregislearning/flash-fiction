import { createClient } from '@/lib/supabase/server'
import { getPromptPhase } from '@/lib/utils'
import { redirect } from 'next/navigation'
import SubmissionCard from '@/components/SubmissionCard'
import Link from 'next/link'
import { Prompt, Submission, SubmissionWithVotes } from '@/types/database'

export const dynamic = 'force-dynamic'
export const revalidate = 30 // Revalidate every 30 seconds

async function getVotingData() {
  const supabase = await createClient()

  // Get the current prompt
  const { data: promptData } = await supabase
    .from('prompts')
    .select('*')
    .order('submission_start', { ascending: false })
    .limit(1)
    .single()

  const prompt = promptData as Prompt | null

  if (!prompt) {
    return { prompt: null, phase: null, user: null, submissions: [], userVotedFor: null }
  }

  const phase = getPromptPhase(prompt)

  if (phase === 'upcoming' || phase === 'writing') {
    return { prompt, phase, user: null, submissions: [], userVotedFor: null }
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()

  // Get all submissions for this prompt
  const { data: submissionsData } = await supabase
    .from('submissions')
    .select('*')
    .eq('prompt_id', prompt.id)
    .order('created_at', { ascending: true })

  const submissions = (submissionsData || []) as Submission[]

  // Get vote counts for each submission
  const { data: voteCounts } = await supabase
    .from('votes')
    .select('submission_id')
    .eq('prompt_id', prompt.id)

  // Get user's vote if any
  let userVotedFor: string | null = null
  if (user) {
    const { data: userVote } = await supabase
      .from('votes')
      .select('submission_id')
      .eq('prompt_id', prompt.id)
      .eq('user_id', user.id)
      .single()
    
    userVotedFor = (userVote as { submission_id: string } | null)?.submission_id || null
  }

  // Calculate vote counts
  const voteCountMap = new Map<string, number>()
  ;(voteCounts as { submission_id: string }[] | null)?.forEach((vote) => {
    const count = voteCountMap.get(vote.submission_id) || 0
    voteCountMap.set(vote.submission_id, count + 1)
  })

  const submissionsWithVotes: SubmissionWithVotes[] = submissions.map((sub) => ({
    ...sub,
    vote_count: voteCountMap.get(sub.id) || 0,
  }))

  return { prompt, phase, user, submissions: submissionsWithVotes, userVotedFor }
}

export default async function SubmissionsPage() {
  const { prompt, phase, user, submissions, userVotedFor } = await getVotingData()

  if (!prompt) {
    return (
      <main className="min-h-[calc(100vh-65px)] flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
            No Active Prompt
          </h1>
          <Link
            href="/"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Go back home
          </Link>
        </div>
      </main>
    )
  }

  if (phase === 'upcoming' || phase === 'writing') {
    return (
      <main className="min-h-[calc(100vh-65px)] flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
            Voting Hasn&apos;t Started Yet
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mb-6">
            {phase === 'upcoming'
              ? 'The writing phase hasn\'t started yet.'
              : 'The writing phase is still open. Come back when voting begins!'}
          </p>
          <Link
            href="/"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Go back home
          </Link>
        </div>
      </main>
    )
  }

  if (phase === 'results') {
    redirect('/results')
  }

  return (
    <main className="min-h-[calc(100vh-65px)] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
          >
            &larr; Back to prompt
          </Link>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">
            Vote for Your Favorite
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Read the anonymous submissions and cast your vote
          </p>
          {!user && (
            <p className="mt-4 text-sm text-amber-600 dark:text-amber-400">
              <Link href="/auth/signin" className="underline">Sign in</Link> to vote
            </p>
          )}
          {user && userVotedFor && (
            <p className="mt-4 text-sm text-green-600 dark:text-green-400">
              You&apos;ve cast your vote! You can change it until voting ends.
            </p>
          )}
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-6 border border-zinc-200 dark:border-zinc-800 mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
              Voting Phase
            </span>
          </div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
            {prompt.title}
          </h2>
        </div>

        {submissions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-zinc-600 dark:text-zinc-400">
              No submissions yet.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {submissions.map((submission) => (
              <SubmissionCard
                key={submission.id}
                submission={submission}
                promptId={prompt.id}
                userVotedFor={userVotedFor}
                canVote={!!user}
                canClaim={false}
                isOwnSubmission={user?.id === submission.user_id}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
