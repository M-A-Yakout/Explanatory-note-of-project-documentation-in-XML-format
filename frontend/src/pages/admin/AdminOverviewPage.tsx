import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api, ApiError } from '../../shared/api'
import type { AdminStats, Role } from '../../shared/types'
import { Alert } from '../../shared/components/ui'
import { StatusBadge } from '../../shared/components/StatusBadge'
import { auditActionLabel, fmtDateTime } from '../../shared/app/labels'

const dm = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })

export default function AdminOverviewPage({ role }: { role: Role }) {
  const nav = useNavigate()
  const [s, setS] = useState<AdminStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { api.stats.admin().then(setS).catch((e) => setError(e instanceof ApiError ? e.message : 'Не удалось загрузить')) }, [])

  if (error) return <Alert tone="error" title="Ошибка загрузки">{error}</Alert>
  if (!s) return <div className="space-y-3" aria-busy="true">{[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-surface-2" />)}</div>

  const cards: [string, string, string?][] = [
    ['Пользователи', String(s.usersTotal), `активных: ${s.usersActive}`],
    ...(role === 'super_admin' ? [['Организации', String(s.organizationsTotal), `активных: ${s.organizationsActive}`] as [string, string, string]] : []),
    ['Объекты', String(s.projectsTotal)],
    ['Документы', String(s.documentsTotal), `в архиве: ${s.documentsArchived}`],
  ]
  const max = Math.max(1, ...s.weeklyDocuments.map((w) => w.count))
  const total = s.weeklyDocuments.reduce((a, w) => a + w.count, 0)

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([l, n, sub]) => (
          <div key={l} className="rounded-lg border border-border bg-surface p-4"><div className="text-sm text-muted">{l}</div><div className="mt-1 text-2xl font-semibold">{n}</div>{sub && <div className="text-xs text-muted">{sub}</div>}</div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-4" aria-label="Документы по неделям">
          <h3 className="mb-1 text-sm font-semibold">Созданные документы по неделям</h3>
          <p className="mb-3 text-xs text-muted">За 8 недель: {total}</p>
          <svg viewBox="0 0 320 150" className="w-full" role="img" aria-label={`Документов за 8 недель: ${total}`}>
            {s.weeklyDocuments.map((w, i) => {
              const h = Math.round((w.count / max) * 100)
              return (
                <g key={w.weekStart}>
                  <rect x={12 + i * 38} y={115 - h} width="26" height={Math.max(h, w.count ? 2 : 0)} rx="3" fill="var(--color-primary, #1f4fbf)"><title>{`Неделя с ${dm(w.weekStart)}: ${w.count}`}</title></rect>
                  <text x={25 + i * 38} y={110 - h} textAnchor="middle" fontSize="10" fill="currentColor">{w.count || ''}</text>
                  <text x={25 + i * 38} y="132" textAnchor="middle" fontSize="9" fill="currentColor" opacity=".6">{dm(w.weekStart)}</text>
                </g>
              )
            })}
            <line x1="0" y1="116" x2="320" y2="116" stroke="currentColor" opacity=".2" />
          </svg>
        </section>
        <section className="rounded-lg border border-border bg-surface p-4" aria-label="Последняя активность">
          <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Последняя активность</h3><button className="text-xs text-primary hover:underline" onClick={() => nav('/admin/audit')}>Весь журнал</button></div>
          {s.recentAudit.length === 0 ? <p className="py-6 text-center text-sm text-muted">Событий пока нет</p> : (
            <ul className="divide-y divide-border text-sm">
              {s.recentAudit.map((e) => (
                <li key={e.id} className="py-2">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium">{auditActionLabel(e.action)}</span>{e.result === 'denied' && <StatusBadge tone="danger">Отказ</StatusBadge>}</div>
                  <div className="truncate text-muted">{e.summary || '—'}</div>
                  <div className="text-xs text-subtle">{e.userName || 'Система'} · {fmtDateTime(e.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
