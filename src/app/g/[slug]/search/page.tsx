import { createClient } from '@/lib/supabase/server'
import { getGroupBySlug } from '@/lib/groups'
import { SearchResult } from '@/types/database'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Escape user content but preserve our own <mark> tags from ts_headline.
// ts_headline only emits <mark>/<mark> because we configured StartSel/StopSel
// that way in the RPC — everything else is raw user content and must be escaped.
function renderSnippet(raw: string): string {
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .replace(/&lt;mark&gt;/g, '<mark>')
    .replace(/&lt;\/mark&gt;/g, '</mark>')
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ q?: string }>
}) {
  const { slug } = await params
  const group = await getGroupBySlug(slug)
  if (!group) notFound()

  const base = `/g/${slug}`
  const { q } = await searchParams
  const query = (q ?? '').trim()

  return (
    <main className="min-h-[calc(100vh-65px)] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <Link
            href={base}
            className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
          >
            &larr; Back to home
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">
          Search
        </h1>

        {!query ? (
          <p className="text-zinc-600 dark:text-zinc-400 mt-4">
            Enter a keyword in the search box above to find submissions.
          </p>
        ) : (
          <Results query={query} base={base} groupId={group.id} />
        )}
      </div>
    </main>
  )
}

async function Results({ query, base, groupId }: { query: string; base: string; groupId: string }) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('search_submissions', {
    p_group_id: groupId,
    q: query,
    lim: 50,
  })

  if (error) {
    return (
      <p className="text-red-600 dark:text-red-400 mt-4">
        Something went wrong. Please try again.
      </p>
    )
  }

  const results = (data ?? []) as SearchResult[]

  if (results.length === 0) {
    return (
      <p className="text-zinc-600 dark:text-zinc-400 mt-4">
        No submissions matched <strong>&ldquo;{query}&rdquo;</strong>.
      </p>
    )
  }

  return (
    <>
      <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-2 mb-6">
        {results.length} result{results.length === 1 ? '' : 's'} for{' '}
        <strong>&ldquo;{query}&rdquo;</strong>
      </p>
      <ul className="space-y-4">
        {results.map((r) => (
          <li
            key={r.id}
            className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm p-6 border border-zinc-200 dark:border-zinc-800"
          >
            <Link
              href={`${base}/past/${r.prompt_id}`}
              className="text-lg font-bold text-zinc-900 dark:text-white hover:underline"
            >
              {r.prompt_title}
            </Link>
            <p
              className="text-zinc-700 dark:text-zinc-300 mt-2 text-sm leading-relaxed [&_mark]:bg-amber-200 [&_mark]:dark:bg-amber-700/40 [&_mark]:rounded [&_mark]:px-0.5"
              dangerouslySetInnerHTML={{ __html: renderSnippet(r.snippet) }}
            />
            <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-3">
              {r.claimed && r.author_email ? `By ${r.author_email}` : 'Anonymous'}
              {' · '}
              {r.prompt_phase === 'voting' ? 'Voting open' : 'Completed'}
            </p>
          </li>
        ))}
      </ul>
    </>
  )
}
