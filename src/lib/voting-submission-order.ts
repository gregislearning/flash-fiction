import { createHash } from 'node:crypto'

/** Stable pseudo-random order for anonymous voting: same for every user, independent of submit time. */
const ORDER_SALT = 'flash-fiction-voting-order-v1'

function votingOrderKey(promptId: string, submissionId: string): string {
  return createHash('sha256')
    .update(`${ORDER_SALT}\0${promptId}\0${submissionId}`)
    .digest('hex')
}

export function sortSubmissionsForVotingPhase<T extends { id: string }>(
  submissions: T[],
  promptId: string
): T[] {
  return [...submissions].sort((a, b) =>
    votingOrderKey(promptId, a.id).localeCompare(votingOrderKey(promptId, b.id))
  )
}
