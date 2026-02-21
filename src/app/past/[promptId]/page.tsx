import { createClient } from '@/lib/supabase/server'
import { getPromptPhase } from '@/lib/utils'
import SubmissionCard from '@/components/SubmissionCard'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Prompt, SubmissionWithVotes } from '@/types/database'

export const dynamic = 'force-dynamic'
export const revalidate = 60

async function getPastPromptData(promptId: string) {
  const supabase = await createClient()

  const { data: promptData } = await supabase
    .from('prompts')
    .select('*')
    .eq('id', promptId)
    .single()

  const prompt = promptData as Prompt | null
  if (!prompt || getPromptPhase(prompt) !== 'results') {
    return null
  }

  const { data: { user } } = await supabase.auth.getUser()

  const { data: submissionsData } = await supabase
    .from('submissions')
    .select('*')
    .eq('prompt_id', prompt.id)
    .order('created_at', { ascending: true })

  const submissions = (submissionsData || []) as Array<{
    id: string
    prompt_id: string
    user_id: string
    content: string
    word_count: number
    claimed: boolean
    author_email: string | null
    created_at: string
  }>

  const { data: voteCounts } = await supabase
    .from('votes')
    .select('submission_id')
    .eq('prompt_id', prompt.id)

  const voteCountMap = new Map<string, number>()
  ;(voteCounts as { submission_id: string }[] | null)?.forEach((vote) => {
    const count = voteCountMap.get(vote.submission_id) || 0
    voteCountMap.set(vote.submission_id, count + 1)
  })

  const submissionsWithVotes: SubmissionWithVotes[] = submissions.map((sub) => ({
    ...sub,
    vote_count: voteCountMap.get(sub.id) || 0,
  }))

  submissionsWithVotes.sort((a, b) => b.vote_count - a.vote_count)

  const maxVotes = submissionsWithVotes[0]?.vote_count || 0
  const winners = submissionsWithVotes.filter(
    (s) => s.vote_count === maxVotes && maxVotes > 0
  )

  return { prompt, user, submissionsWithVotes, winners }
}

export default async function PastPromptPage({
  params,
}: {
  params: Promise<{ promptId: string }>
}) {
  const { promptId } = await params
  const data = await getPastPromptData(promptId)

  if (!data) {
    notFound()
  }

  const { prompt, user, submissionsWithVotes, winners } = data

  return (
    <main className="min-h-[calc(100vh-65px)] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <Link
            href="/past"
            className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
          >
            &larr; Back to past submissions
          </Link>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">
            {prompt.title}
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Past prompt — authors may claim their submissions below.
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-6 border border-zinc-200 dark:border-zinc-800 mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              Completed
            </span>
          </div>
          <p className="text-zinc-600 dark:text-zinc-400">
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
                  canClaim={true}
                  isOwnSubmission={user?.id === submission.user_id}
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
                    canClaim={true}
                    isOwnSubmission={user?.id === submission.user_id}
                  />
                ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
