interface AccessBadgeProps {
  /** True when the current user is a member and can participate (write/vote/comment). */
  canWrite: boolean
  className?: string
}

/**
 * Small pill showing the current user's access level in a group. Everyone can
 * read (public-read); membership gates participation, so the badge distinguishes
 * "Read & write" (member) from "Read only" (non-member / logged-out).
 */
export default function AccessBadge({ canWrite, className = '' }: AccessBadgeProps) {
  return (
    <span
      className={
        (canWrite
          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
          : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400') +
        ' inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' +
        className
      }
    >
      {canWrite ? 'Read & write' : 'Read only'}
    </span>
  )
}
