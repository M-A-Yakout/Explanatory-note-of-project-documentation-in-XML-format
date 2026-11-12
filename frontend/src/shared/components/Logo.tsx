import React from 'react'
import { t } from '../i18n'

/** Wordmark: a document sheet with an XML angle mark. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 28 28" className="size-7 shrink-0" aria-hidden>
        <path d="M6 2h11l5 5v19H6z" className="fill-primary" />
        <path d="M17 2v5h5" className="fill-primary-soft" />
        <path
          d="M11.5 13.5 9 16l2.5 2.5M16.5 13.5 19 16l-2.5 2.5"
          className="stroke-primary-fg"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && <span className="whitespace-nowrap text-[15px] font-semibold tracking-tight text-fg">{t('app.name')}</span>}
    </span>
  )
}
