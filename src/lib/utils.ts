import { Prompt, PromptPhase } from '@/types/database'

export function getPromptPhase(prompt: Prompt): PromptPhase {
  const now = new Date()
  const submissionStart = new Date(prompt.submission_start)
  const submissionEnd = new Date(prompt.submission_end)
  const votingEnd = new Date(prompt.voting_end)

  if (now < submissionStart) return 'upcoming'
  if (now < submissionEnd) return 'writing'
  if (now < votingEnd) return 'voting'
  return 'results'
}

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function getTimeRemaining(targetDate: string): string {
  const now = new Date()
  const target = new Date(targetDate)
  const diff = target.getTime() - now.getTime()

  if (diff <= 0) return 'Ended'

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (days > 0) return `${days}d ${hours}h remaining`
  if (hours > 0) return `${hours}h ${minutes}m remaining`
  return `${minutes}m remaining`
}

export function getPhaseEndDate(prompt: Prompt, phase: PromptPhase): string {
  switch (phase) {
    case 'upcoming':
      return prompt.submission_start
    case 'writing':
      return prompt.submission_end
    case 'voting':
      return prompt.voting_end
    default:
      return prompt.voting_end
  }
}

export function getPhaseLabel(phase: PromptPhase): string {
  switch (phase) {
    case 'upcoming':
      return 'Starting Soon'
    case 'writing':
      return 'Writing Phase'
    case 'voting':
      return 'Voting Phase'
    case 'results':
      return 'Results'
  }
}

export function getPhaseColor(phase: PromptPhase): string {
  switch (phase) {
    case 'upcoming':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    case 'writing':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case 'voting':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
    case 'results':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
  }
}
