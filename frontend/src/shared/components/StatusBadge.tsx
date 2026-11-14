import React from 'react'
import { cn } from './ui'

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger'

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
}

export function StatusBadge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>
}

export const projectTone = { active: 'primary', on_hold: 'warning', completed: 'success', archived: 'neutral' } as const
