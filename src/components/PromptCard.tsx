import { Prompt, PromptPhase } from '@/types/database'
import { getPhaseLabel, getPhaseColor, getPhaseEndDate, getTimeRemaining } from '@/lib/utils'
import Countdown from './Countdown'

interface PromptCardProps {
  prompt: Prompt
  phase: PromptPhase
}

export default function PromptCard({ prompt, phase }: PromptCardProps) {
  const endDate = getPhaseEndDate(prompt, phase)

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-8 border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-3 mb-4">
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getPhaseColor(phase)}`}>
          {getPhaseLabel(phase)}
        </span>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {prompt.word_limit} words max
        </span>
      </div>

      <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-3">
        {prompt.title}
      </h2>

      <p className="text-zinc-600 dark:text-zinc-400 mb-6 leading-relaxed">
        {prompt.description}
      </p>

      {phase !== 'results' && (
        <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
          <Countdown targetDate={endDate} phase={phase} />
        </div>
      )}
    </div>
  )
}
