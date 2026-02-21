import { SubmissionWithVotes } from '@/types/database'
import VoteButton from './VoteButton'
import ClaimButton from './ClaimButton'

interface SubmissionCardProps {
  submission: SubmissionWithVotes
  promptId: string
  userVotedFor: string | null
  canVote: boolean
  canClaim: boolean
  isOwnSubmission: boolean
  isWinner?: boolean
}

export default function SubmissionCard({
  submission,
  promptId,
  userVotedFor,
  canVote,
  canClaim,
  isOwnSubmission,
  isWinner = false,
}: SubmissionCardProps) {
  const hasVoted = userVotedFor === submission.id

  return (
    <article
      className={`bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-6 border ${
        isWinner
          ? 'border-amber-400 dark:border-amber-500 ring-2 ring-amber-400/20'
          : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      {isWinner && (
        <div className="flex items-center gap-2 mb-4">
          <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            Winner
          </span>
        </div>
      )}

      {isOwnSubmission && (
        <div className="flex items-center gap-2 mb-4">
          <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            Your Submission
          </span>
        </div>
      )}

      <div className="prose prose-zinc dark:prose-invert max-w-none mb-6">
        <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300 leading-relaxed">
          {submission.content}
        </p>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {submission.word_count} words
          </span>
          {submission.claimed && submission.author_email && (
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              by {submission.author_email}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {submission.vote_count} vote{submission.vote_count !== 1 ? 's' : ''}
          </span>
          {canVote && !isOwnSubmission && (
            <VoteButton
              promptId={promptId}
              submissionId={submission.id}
              hasVoted={hasVoted}
              disabled={userVotedFor !== null && !hasVoted}
            />
          )}
          {canVote && isOwnSubmission && (
            <span className="text-sm text-zinc-400 dark:text-zinc-500 italic">
              Can&apos;t vote for yourself
            </span>
          )}
          {canClaim && isOwnSubmission && (
            <ClaimButton
              submissionId={submission.id}
              claimed={submission.claimed}
            />
          )}
        </div>
      </div>
    </article>
  )
}
