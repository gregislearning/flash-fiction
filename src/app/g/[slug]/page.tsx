import { createClient } from '@/lib/supabase/server'
import { getCurrentPrompt } from '@/lib/prompts'
import { getGroupBySlug } from '@/lib/groups'
import { getPromptPhase } from '@/lib/utils'
import PromptCard from '@/components/PromptCard'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

async function getUserSubmission(promptId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return null

  const { data: submission } = await supabase
    .from('submissions')
    .select('*')
    .eq('prompt_id', promptId)
    .eq('user_id', user.id)
    .single()

  return submission
}

async function getUserVote(promptId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return null

  const { data: vote } = await supabase
    .from('votes')
    .select('*')
    .eq('prompt_id', promptId)
    .eq('user_id', user.id)
    .single()

  return vote
}

export default async function Home({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const group = await getGroupBySlug(slug)
  if (!group) notFound()

  const base = `/g/${slug}`
  const prompt = await getCurrentPrompt(group.id)

  if (!prompt) {
    return (
      <main className="min-h-[calc(100vh-65px)] flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-4">
            No Active Prompt
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Check back soon for the next flash fiction challenge!
          </p>
        </div>
      </main>
    )
  }

  const phase = getPromptPhase(prompt)
  const userSubmission = await getUserSubmission(prompt.id)
  const userVote = await getUserVote(prompt.id)

  return (
    <main className="min-h-[calc(100vh-65px)] py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">
            Current Challenge
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Write a short story based on the prompt below
          </p>
        </div>

        <PromptCard prompt={prompt} phase={phase} />

        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
          {phase === 'upcoming' && (
            <div className="text-center text-zinc-500 dark:text-zinc-400">
              Writing begins soon. Get ready!
            </div>
          )}

          {phase === 'writing' && (
            <>
              {userSubmission ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    You&apos;ve submitted your story!
                  </span>
                  <Link
                    href={`${base}/submit`}
                    className="px-6 py-3 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition font-medium"
                  >
                    Edit Submission
                  </Link>
                </div>
              ) : (
                <Link
                  href={`${base}/submit`}
                  className="px-8 py-4 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition font-medium text-lg text-center"
                >
                  Start Writing
                </Link>
              )}
            </>
          )}

          {phase === 'voting' && (
            <>
              {userVote ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-purple-600 dark:text-purple-400 font-medium">
                    You&apos;ve cast your vote!
                  </span>
                  <Link
                    href={`${base}/submissions`}
                    className="px-6 py-3 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition font-medium"
                  >
                    View Submissions
                  </Link>
                </div>
              ) : (
                <Link
                  href={`${base}/submissions`}
                  className="px-8 py-4 rounded-xl bg-purple-600 dark:bg-purple-500 text-white hover:bg-purple-700 dark:hover:bg-purple-600 transition font-medium text-lg text-center"
                >
                  Read &amp; Vote
                </Link>
              )}
            </>
          )}

          {phase === 'results' && (
            <Link
              href={`${base}/results`}
              className="px-8 py-4 rounded-xl bg-amber-500 dark:bg-amber-400 text-white dark:text-zinc-900 hover:bg-amber-600 dark:hover:bg-amber-500 transition font-medium text-lg text-center"
            >
              View Results
            </Link>
          )}
        </div>
      </div>
    </main>
  )
}
