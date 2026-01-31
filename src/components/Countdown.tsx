'use client'

import { useEffect, useState } from 'react'
import { PromptPhase } from '@/types/database'

interface CountdownProps {
  targetDate: string
  phase: PromptPhase
}

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

export default function Countdown({ targetDate, phase }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    
    const calculateTimeLeft = () => {
      const now = new Date().getTime()
      const target = new Date(targetDate).getTime()
      const diff = target - now

      if (diff <= 0) {
        return null
      }

      return {
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      }
    }

    setTimeLeft(calculateTimeLeft())

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft())
    }, 1000)

    return () => clearInterval(timer)
  }, [targetDate])

  if (!mounted) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-zinc-500 dark:text-zinc-400">Loading...</span>
      </div>
    )
  }

  if (!timeLeft) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-zinc-500 dark:text-zinc-400">
          {phase === 'upcoming' ? 'Starting soon...' : 'Phase ended'}
        </span>
      </div>
    )
  }

  const phaseLabels: Record<PromptPhase, string> = {
    upcoming: 'Starts in',
    writing: 'Submit by',
    voting: 'Vote by',
    results: '',
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <span className="text-sm text-zinc-500 dark:text-zinc-400">
        {phaseLabels[phase]}
      </span>
      <div className="flex items-center gap-3">
        {timeLeft.days > 0 && (
          <div className="text-center">
            <span className="text-2xl font-bold text-zinc-900 dark:text-white">
              {timeLeft.days}
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-1">d</span>
          </div>
        )}
        <div className="text-center">
          <span className="text-2xl font-bold text-zinc-900 dark:text-white">
            {String(timeLeft.hours).padStart(2, '0')}
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-1">h</span>
        </div>
        <div className="text-center">
          <span className="text-2xl font-bold text-zinc-900 dark:text-white">
            {String(timeLeft.minutes).padStart(2, '0')}
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-1">m</span>
        </div>
        <div className="text-center">
          <span className="text-2xl font-bold text-zinc-900 dark:text-white">
            {String(timeLeft.seconds).padStart(2, '0')}
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-1">s</span>
        </div>
      </div>
    </div>
  )
}
