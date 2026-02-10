import { createClient } from '@/lib/supabase/server'
import { getPromptPhase } from '@/lib/utils'
import Link from 'next/link'
import { Prompt } from '@/types/database'

export const dynamic = 'force-dynamic'
export const revalidate = 60

async function getPastPrompts(): Promise<Prompt[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('prompts')
    .select('*')
    .order('voting_end', { ascending: false })

  const prompts = (data || []) as Prompt[]
  return prompts.filter((p) => getPromptPhase(p) === 'results')
}

export default async function PastPage() {
  const pastPrompts = await getPastPrompts()

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

        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">
            Past Submissions
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Browse completed prompts and read the submissions (authors stay anonymous).
          </p>
        </div>

        {pastPrompts.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
            <p className="text-zinc-600 dark:text-zinc-400">
              No past prompts yet. Check back after the first round ends!
            </p>
            <Link
              href="/"
              className="inline-block mt-4 text-blue-600 dark:text-blue-400 hover:underline"
            >
              Go to current prompt
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {pastPrompts.map((prompt) => (
              <li key={prompt.id}>
                <Link
                  href={`/past/${prompt.id}`}
                  className="block bg-white dark:bg-zinc-900 rounded-2xl shadow-sm p-6 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                      Completed
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                    {prompt.title}
                  </h2>
                  <p className="text-zinc-600 dark:text-zinc-400 mt-1 line-clamp-2">
                    {prompt.description}
                  </p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-3">
                    Ended {new Date(prompt.voting_end).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
