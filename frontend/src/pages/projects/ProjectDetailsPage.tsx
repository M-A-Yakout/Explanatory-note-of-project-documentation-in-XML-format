import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api, ApiError } from '../../shared/api'
import type { ExplanatoryNote, Project, ProjectStatus, Role } from '../../shared/types'
import { Alert, Button, Select } from '../../shared/components/ui'
import { StatusBadge, projectTone } from '../../shared/components/StatusBadge'
import { useToast } from '../../shared/components/Toast'
import { canEdit, constructionTypeLabel, documentStatusLabel, documentTone, fmtDateTime, isAdmin, projectStatusLabel } from '../../shared/app/labels'

const tabs = [['overview', 'Обзор'], ['documents', 'Документы'], ['members', 'Участники'], ['history', 'История']] as const

export default function ProjectDetailsPage({ id, role }: { id: string; role: Role }) {
  const nav = useNavigate()
  const toast = useToast()
  const [project, setProject] = useState<Project | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<(typeof tabs)[number][0]>('overview')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [docs, setDocs] = useState<ExplanatoryNote[] | null>(null)

  useEffect(() => {
    setProject(null)
    setError(null)
    api.documents.list({ projectId: id, pageSize: 50 }).then((r) => setDocs(r.items)).catch(() => setDocs([]))
    api.projects.get(id).then(setProject).catch((e) => setError(e.message ?? 'Не удалось загрузить объект'))
  }, [id])

  if (error) return <Alert tone="error" title="Объект недоступен">{error} <button className="underline" onClick={() => nav('/app/projects')}>К списку</button></Alert>
  if (!project) return <p className="text-sm text-muted">Загрузка…</p>

  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (e) { toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Операция не выполнена' }) } finally { setBusy(false) }
  }
  const changeStatus = (status: ProjectStatus) =>
    act(async () => { setProject(await api.projects.update(id, { status })); toast({ tone: 'success', title: 'Статус обновлён' }) })
  const remove = () =>
    act(async () => { await api.projects.remove(id); toast({ tone: 'success', title: 'Объект удалён' }); nav('/app/projects') })

  const rows: [string, string][] = [
    ['Код', project.code], ['Адрес', project.address], ['Кадастровый номер', project.cadastralNumber],
    ['Вид строительства', constructionTypeLabel[project.constructionType]], ['Застройщик', project.developer],
    ['Технический заказчик', project.customer || '—'], ['Проектировщик', project.designer || '—'],
    ['Функциональное назначение', project.functionalPurpose || '—'], ['Источник финансирования', project.financingSource || '—'],
  ]

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{project.name}</h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">
            <span className="font-mono">{project.code}</span>
            <StatusBadge tone={projectTone[project.status]}>{projectStatusLabel[project.status]}</StatusBadge>
          </p>
        </div>
        {canEdit(role) && (
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Статус" className="w-44" value={project.status} disabled={busy} onChange={(e) => changeStatus(e.target.value as ProjectStatus)}>
              {Object.entries(projectStatusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Button variant="secondary" onClick={() => nav(`/app/projects/${id}/edit`)}>Редактировать</Button>
            {isAdmin(role) && <Button variant="danger" onClick={() => setConfirmDelete(true)}>Удалить</Button>}
          </div>
        )}
      </div>

      {confirmDelete && (
        <div role="alertdialog" aria-label="Подтверждение удаления" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger bg-danger-soft p-4 text-sm">
          <span>Удалить объект «{project.name}» без возможности восстановления?</span>
          <span className="flex gap-2">
            <Button size="sm" variant="danger" loading={busy} onClick={remove}>Удалить</Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(false)}>Отмена</Button>
          </span>
        </div>
      )}

      <div role="tablist" className="mb-4 flex gap-1 border-b border-border text-sm">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`px-3 py-2 ${tab === k ? 'border-b-2 border-primary font-medium' : 'text-muted hover:text-fg'}`}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <dl className="max-w-3xl divide-y divide-border rounded-lg border border-border bg-surface text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[220px_1fr]">
              <dt className="text-muted">{k}</dt>
              <dd className={k === 'Кадастровый номер' || k === 'Код' ? 'font-mono' : ''}>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {tab === 'documents' && (docs === null ? <p className="text-sm text-muted">Загрузка…</p> : docs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong px-6 py-12 text-center">
          <p className="font-medium">Документов пока нет</p>
          <p className="mt-1 text-sm text-muted">Создайте пояснительную записку для этого объекта.</p>
          {canEdit(role) && <Button className="mt-3" onClick={() => nav(`/app/documents/new?project=${id}`)}>Новый документ</Button>}
        </div>
      ) : (
        <ul className="max-w-3xl divide-y divide-border rounded-lg border border-border bg-surface text-sm">
          {docs.map((d) => (
            <li key={d.id}><button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2"
              onClick={() => nav(canEdit(role) ? `/app/documents/${d.id}/edit` : `/app/documents/${d.id}/versions`)}>
              <span><span className="font-medium">{d.title}</span><span className="block text-xs text-muted">v{d.currentVersion} · {d.authorName} · {fmtDateTime(d.updatedAt)}</span></span>
              <StatusBadge tone={documentTone[d.status]}>{documentStatusLabel[d.status]}</StatusBadge>
            </button></li>
          ))}
        </ul>
      ))}
      {tab === 'members' && <Empty title="Участники" text="Управление участниками объекта появится вместе с администрированием." />}
      {tab === 'history' && (
        <ul className="max-w-3xl divide-y divide-border rounded-lg border border-border bg-surface text-sm">
          <li className="flex justify-between px-4 py-3"><span>Последнее изменение</span><span className="text-muted">{fmtDateTime(project.updatedAt)}</span></li>
          <li className="flex justify-between px-4 py-3"><span>Объект создан</span><span className="text-muted">{fmtDateTime(project.createdAt)}</span></li>
        </ul>
      )}
    </div>
  )
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border-strong px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{text}</p>
    </div>
  )
}
