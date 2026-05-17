import { createClient } from '@/lib/supabase/server'
import { getPromptPhase } from '@/lib/utils'
import { Prompt, PromptPhase } from '@/types/database'

/** Lower number = higher priority when multiple prompts overlap in time. */
const PHASE_PRIORITY: Record<PromptPhase, number> = {
  voting: 0,
  writing: 1,
  results: 2,
  upcoming: 3,
}

/**
 * Pick the prompt users should treat as "current" on the home, submit, and
 * voting flows. Prefers an in-progress round over a future scheduled one.
 */
export function selectCurrentPrompt(prompts: Prompt[]): Prompt | null {
  if (prompts.length === 0) return null

  return [...prompts].sort((a, b) => {
    const phaseA = getPromptPhase(a)
    const phaseB = getPromptPhase(b)
    const priorityDiff = PHASE_PRIORITY[phaseA] - PHASE_PRIORITY[phaseB]
    if (priorityDiff !== 0) return priorityDiff
    return (
      new Date(b.submission_start).getTime() -
      new Date(a.submission_start).getTime()
    )
  })[0]
}

export async function getCurrentPrompt(): Promise<Prompt | null> {
  const supabase = await createClient()
  const now = new Date().toISOString()

  // Writing or voting: started, voting not over (ignores future scheduled prompts)
  const { data: active } = await supabase
    .from('prompts')
    .select('*')
    .lte('submission_start', now)
    .gt('voting_end', now)

  const activePrompt = selectCurrentPrompt((active || []) as Prompt[])
  if (activePrompt) return activePrompt

  // Just finished — show results on home until the next round starts
  const { data: recent } = await supabase
    .from('prompts')
    .select('*')
    .lte('voting_end', now)
    .order('voting_end', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (recent) return recent as Prompt

  // Nothing in progress or recently ended — next scheduled prompt
  const { data: upcoming } = await supabase
    .from('prompts')
    .select('*')
    .gt('submission_start', now)
    .order('submission_start', { ascending: true })
    .limit(1)
    .maybeSingle()

  return upcoming ?? null
}
