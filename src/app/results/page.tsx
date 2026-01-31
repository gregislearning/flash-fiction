import { createClient } from '@/lib/supabase/server'
import { getPromptPhase } from '@/lib/utils'
import SubmissionCard from '@/components/SubmissionCard'
import Link from 'next/link'
import { Prompt, SubmissionWithVotes } from '@/types/database'

export const dynamic = 'force-dynamic'
export const revalidate = 60

async function getResultsData() {
  const supabase = await createClient()

  // Get the most recent prompt that has ended voting
  const { data: prompts } = await supabase
    .from('prompts')
    .select('*')
    .order('voting_end', { ascending: false })

  const prompt = (prompts || []).find((p) => getPromptPhase(p) === 'results') as Prompt | undefined

  if (!prompt) {
    return { prompt: null, user: null, submissionsWithVotes: [], winners: [] }
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()

  // Get all submissions with user info
  const { data: submissionsData } = await supabase
    .from('submissions')
    .select('*, user:user_id(email)')
    .eq('prompt_id', prompt.id)
    .order('created_at', { ascending: true })

  type SubmissionWithUser = {
    id: string
    prompt_id: string
    user_id: string
    content: string
    word_count: number
    created_at: string
    user: { email: string } | null
  }

  const submissions = (submissionsData || []) as SubmissionWithUser[]

  // Get vote counts for each submission
  const { data: voteCounts } = await supabase
    .from('votes')
    .select('submission_id')
    .eq('prompt_id', prompt.id)

  // Calculate vote counts
  const voteCountMap = new Map<string, number>()
  ;(voteCounts as { submission_id: string }[] | null)?.forEach((vote) => {
    const count = voteCountMap.get(vote.submission_id) || 0
    voteCountMap.set(vote.submission_id, count + 1)
  })

  // Add vote counts and author info to submissions
  const submissionsWithVotes: SubmissionWithVotes[] = submissions.map((sub) => ({
    id: sub.id,
    prompt_id: sub.prompt_id,
    user_id: sub.user_id,
    content: sub.content,
    word_count: sub.word_count,
    created_at: sub.created_at,
    vote_count: voteCountMap.get(sub.id) || 0,
    author_email: sub.user?.email || 'Anonymous',
  }))

  // Sort by vote count (highest first)
  submissionsWithVotes.sort((a, b) => b.vote_count - a.vote_count)

  // Find winner(s) - could be a tie
  const maxVotes = submissionsWithVotes[0]?.vote_count || 0
  const winners = submissionsWithVotes.filter((s) => s.vote_count === maxVotes && maxVotes > 0)

  return { prompt, user, submissionsWithVotes, winners }
}

export default async function ResultsPage() {
  const { prompt, user, submissionsWithVotes, winners } = await getResultsData()

  if (!prompt) {
    return (
      <main className="min-h-[calc(100vh-65px)] flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
            No Results Yet
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mb-6">
            Check back after the voting phase ends!
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

  return (
    <main className="min-h-[calc(100vh-65px)] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
          >
            &larr; Back to home
          </Link>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">
            Results
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            The votes are in! See who won.
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-6 border border-zinc-200 dark:border-zinc-800 mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              Completed
            </span>
          </div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
            {prompt.title}
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">
            {prompt.description}
          </p>
        </div>

        {winners.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-4 text-center">
              {winners.length === 1 ? 'Winner' : 'Winners (Tie)'}
            </h2>
            <div className="space-y-6">
              {winners.map((submission) => (
                <SubmissionCard
                  key={submission.id}
                  submission={submission}
                  promptId={prompt.id}
                  userVotedFor={null}
                  canVote={false}
                  isOwnSubmission={user?.id === submission.user_id}
                  showAuthor={true}
                  isWinner={true}
                />
              ))}
            </div>
          </div>
        )}

        {submissionsWithVotes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-zinc-600 dark:text-zinc-400">
              No submissions were made for this prompt.
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-4 text-center">
              All Submissions
            </h2>
            <div className="space-y-6">
              {submissionsWithVotes
                .filter((s) => !winners.some((w) => w.id === s.id))
                .map((submission) => (
                  <SubmissionCard
                    key={submission.id}
                    submission={submission}
                    promptId={prompt.id}
                    userVotedFor={null}
                    canVote={false}
                    isOwnSubmission={user?.id === submission.user_id}
                    showAuthor={true}
                  />
                ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
