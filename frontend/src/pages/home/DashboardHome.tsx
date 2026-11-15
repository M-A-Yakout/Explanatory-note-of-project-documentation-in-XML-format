import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FilePlus2, FileUp, FolderPlus } from 'lucide-react'

import { api, ApiError } from '../../shared/api'
import type { DashboardStats, DocumentStatus, Role } from '../../shared/types'
import { Alert, Button } from '../../shared/components/ui'
import { StatusBadge } from '../../shared/components/StatusBadge'
import { canEdit, documentStatusLabel, documentTone, fmtDate } from '../../shared/app/labels'
import { ProgressBar } from '../documents/DocumentsListPage'

const ORDER: DocumentStatus[] = ['draft', 'in_review', 'validated', 'archived']

export default function DashboardHome({ role, name }: { role: Role; name: string }) {
  const nav = useNavigate()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const editor = canEdit(role)

  const load = () => {
    setError(null)
    api.stats.dashboard().then(setStats).catch((e) => setError(e instanceof ApiError ? e.message : 'Не удалось загрузить данные'))
  }
  useEffect(load, [])

  if (error) return <Alert tone="error" title="Ошибка загрузки">{error} <button className="underline" onClick={load}>Повторить</button></Alert>
  if (!stats) return <div className="space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-surface-2" />)}</div>

  const empty = stats.projectsTotal === 0 && stats.recent.length === 0
  const first = name.split(' ')[1] ?? name

  return (
    <div>
      <p className="mb-4 text-sm text-muted">Добрый день, {first}{stats.myDrafts > 0 && editor ? ` · ваших черновиков: ${stats.myDrafts}` : ''}</p>

      {empty && (
        <div className="mb-5 rounded-lg border border-dashed border-border-strong px-6 py-10 text-center">
          <p className="font-medium">Здесь пока пусто</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">{editor ? 'Создайте первый объект, затем пояснительную записку для него — или импортируйте готовый XML.' : 'В организации ещё нет объектов и документов.'}</p>
          {editor && <Button className="mt-4" onClick={() => nav('/app/projects/new')}>Создать объект</Button>}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ORDER.map((s) => (
          <button key={s} onClick={() => nav('/app/documents')} className="rounded-lg border border-border bg-surface p-4 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-primary">
            <StatusBadge tone={documentTone[s]}>{documentStatusLabel[s]}</StatusBadge>
            <div className="mt-2 text-3xl font-semibold">{stats.documentsByStatus[s]}</div>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section aria-label="Последние документы">
          <h3 className="mb-2 text-sm font-semibold">Последние документы</h3>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-surface-2 text-left text-xs text-muted"><tr>{['Документ', 'Заполнено', 'Статус', 'Обновлён'].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {stats.recent.map((d) => (
                  <tr key={d.id} tabIndex={0} role="link" className="cursor-pointer border-t border-border hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                    onClick={() => nav(editor ? `/app/documents/${d.id}/edit` : `/app/documents/${d.id}/versions`)}
                    onKeyDown={(e) => e.key === 'Enter' && nav(editor ? `/app/documents/${d.id}/edit` : `/app/documents/${d.id}/versions`)}>
                    <td className="px-4 py-3"><div className="font-medium">{d.title}</div><div className="text-xs text-muted">{d.projectName}</div></td>
                    <td className="px-4 py-3"><ProgressBar value={d.progress} /></td>
                    <td className="px-4 py-3"><StatusBadge tone={documentTone[d.status]}>{documentStatusLabel[d.status]}</StatusBadge></td>
                    <td className="px-4 py-3 text-muted">{fmtDate(d.updatedAt)}</td>
                  </tr>
                ))}
                {stats.recent.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">Документов пока нет</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-4">
          <section aria-label="Ошибки проверки" className="rounded-lg border border-border bg-surface p-4">
            <h3 className="text-sm font-semibold">Ошибки проверки</h3>
            <div className="mt-3 flex gap-6 text-sm">
              <div><div className="text-2xl font-semibold text-danger">{stats.errors}</div>ошибок</div>
              <div><div className="text-2xl font-semibold text-warning">{stats.warnings}</div>предупреждений</div>
            </div>
            {(stats.staleChecks > 0 || stats.unchecked > 0) && (
              <p className="mt-3 text-xs text-muted">
                {stats.unchecked > 0 && `Не проверено: ${stats.unchecked}. `}{stats.staleChecks > 0 && `Результаты устарели: ${stats.staleChecks} (не учтены).`}
              </p>
            )}
          </section>
          {editor && (
            <section aria-label="Быстрые действия" className="rounded-lg border border-border bg-surface p-4">
              <h3 className="mb-3 text-sm font-semibold">Быстрые действия</h3>
              <div className="flex flex-col items-start gap-2 text-sm">
                {[[FolderPlus, 'Новый объект', '/app/projects/new'], [FilePlus2, 'Новый документ', '/app/documents/new'], [FileUp, 'Импорт XML', '/app/documents/import']].map(([Icon, label, path]) => {
                  const I = Icon as typeof FolderPlus
                  return <button key={path as string} onClick={() => nav(path as string)} className="inline-flex items-center gap-2 text-primary hover:underline"><I className="size-4" aria-hidden />{label as string}</button>
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
