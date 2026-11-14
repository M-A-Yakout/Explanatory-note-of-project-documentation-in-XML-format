import React, { useEffect, useRef, useState } from 'react'
import { ArchiveRestore, Search, Trash2 } from 'lucide-react'

import { api, ApiError } from '../../shared/api'
import type { ExplanatoryNote, Paginated, Project, Role } from '../../shared/types'
import { Alert, Button, Input, Select, cn } from '../../shared/components/ui'
import { ConfirmDialog } from '../../shared/components/ConfirmDialog'
import { useToast } from '../../shared/components/Toast'
import { fmtDate, isAdmin } from '../../shared/app/labels'
import { useDebounced } from '../../shared/app/useDebounced'
import { docs, reportBulk } from './bulk'

const PAGE_SIZE = 10

/** Archived documents: restore (editors) or delete forever (admins). Archived documents are read-only everywhere else. */
export default function ArchivePage({ role }: { role: Role }) {
  const toast = useToast()
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [projectId, setProjectId] = useState('')
  const [page, setPage] = useState(1)
  const [projects, setProjects] = useState<Project[]>([])
  const [data, setData] = useState<Paginated<ExplanatoryNote> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<string[] | null>(null) // ids pending permanent deletion
  const [busy, setBusy] = useState<'restore' | 'delete' | null>(null)
  const seq = useRef(0)
  const admin = isAdmin(role)

  useEffect(() => { api.projects.list({ pageSize: 100, sort: 'name', order: 'asc' }).then((r) => setProjects(r.items)).catch(() => {}) }, [])
  useEffect(() => setPage(1), [dq])
  useEffect(() => setSelected(new Set()), [dq, projectId, page])

  const load = () => {
    const id = ++seq.current
    setError(null)
    api.documents.list({ q: dq, projectId, status: 'archived', page, pageSize: PAGE_SIZE })
      .then((r) => id === seq.current && setData(r))
      .catch((e) => id === seq.current && setError(e.message ?? 'Не удалось загрузить архив'))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [dq, projectId, page])

  const run = async (action: 'restore' | 'delete', ids: string[]) => {
    setBusy(action)
    try {
      reportBulk(toast, await api.documents.bulk(ids, action), action === 'restore' ? 'Восстановлено' : 'Удалено навсегда')
      setSelected(new Set())
      setConfirm(null)
      // an emptied last page would show nothing: step back
      if (data && data.items.length <= ids.length && page > 1) setPage(page - 1)
      else load()
    } catch (e) { toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Операция не выполнена' }) } finally { setBusy(null) }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const allOnPage = !!data?.items.length && data.items.every((d) => selected.has(d.id))
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const filtered = !!(dq || projectId)
  const titles = (ids: string[]) => ids.length === 1 ? `«${data?.items.find((d) => d.id === ids[0])?.title ?? 'документ'}»` : docs(ids.length)

  return (
    <div>
      <p className="mb-4 text-sm text-muted">{data ? `В архиве: ${data.total}` : 'Загрузка…'} · архивные документы доступны только для чтения</p>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-subtle" aria-hidden />
          <Input aria-label="Поиск" className="pl-9" placeholder="Название, объект, кадастровый номер…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select aria-label="Объект" className="w-56" value={projectId} onChange={(e) => { setProjectId(e.target.value); setPage(1) }}>
          <option value="">Все объекты</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>

      {selected.size > 0 && (
        <div role="region" aria-label="Действия с выбранными" className="mb-3 flex flex-wrap items-center gap-3 rounded-md bg-primary-soft px-4 py-2 text-sm">
          <span className="font-medium">Выбрано: {selected.size}</span>
          <Button size="sm" variant="secondary" loading={busy === 'restore'} onClick={() => run('restore', [...selected])}><ArchiveRestore className="size-4" aria-hidden />Восстановить</Button>
          {admin && <Button size="sm" variant="danger" onClick={() => setConfirm([...selected])}><Trash2 className="size-4" aria-hidden />Удалить навсегда</Button>}
          <button className="text-primary hover:underline" onClick={() => setSelected(new Set())}>Снять выбор</button>
        </div>
      )}

      {error && <Alert tone="error" title="Ошибка загрузки">{error} <button className="underline" onClick={load}>Повторить</button></Alert>}
      {!error && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>
                <th className="w-10 px-4 py-2.5"><input type="checkbox" aria-label="Выбрать все на странице" className="size-4" checked={allOnPage} onChange={() => setSelected(allOnPage ? new Set() : new Set(data!.items.map((d) => d.id)))} /></th>
                {['Документ', 'Схема', 'Автор', 'В архиве с', 'Кем', 'Действия'].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {!data && Array.from({ length: 3 }).map((_, i) => <tr key={i} className="border-t border-border"><td colSpan={7} className="px-4 py-4"><div className="h-4 animate-pulse rounded bg-surface-2" /></td></tr>)}
              {data?.items.map((d) => (
                <tr key={d.id} className={cn('border-t border-border', selected.has(d.id) && 'bg-primary-soft')}>
                  <td className="px-4 py-3"><input type="checkbox" aria-label={`Выбрать «${d.title}»`} className="size-4" checked={selected.has(d.id)} onChange={() => toggle(d.id)} /></td>
                  <td className="px-4 py-3"><div className="font-medium">{d.title}</div><div className="text-xs text-muted">{d.projectName}</div></td>
                  <td className="px-4 py-3 font-mono text-xs">{d.schemaVersion}</td>
                  <td className="px-4 py-3">{d.authorName}</td>
                  <td className="px-4 py-3 text-muted">{d.archivedAt ? fmtDate(d.archivedAt) : '—'}</td>
                  <td className="px-4 py-3 text-muted">{d.archivedByName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="flex gap-3">
                      <button className="text-primary hover:underline disabled:opacity-50" disabled={busy !== null} onClick={() => run('restore', [d.id])}>Восстановить</button>
                      {admin && <button className="text-danger hover:underline" onClick={() => setConfirm([d.id])}>Удалить навсегда</button>}
                    </span>
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center">
                  <p className="font-medium">{filtered ? 'Ничего не найдено' : 'Архив пуст'}</p>
                  <p className="mt-1 text-sm text-muted">{filtered ? 'Измените условия поиска.' : 'Документы, отправленные в архив, появятся здесь.'}</p>
                </td></tr>
              )}
            </tbody>
          </table>
          {data && data.total > 0 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-sm text-muted">
              <span>Страница {page} из {pages}</span>
              <span className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Назад</Button>
                <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Далее</Button>
              </span>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog open={!!confirm} title="Удалить навсегда?" confirmLabel="Удалить навсегда" busy={busy === 'delete'} onCancel={() => setConfirm(null)} onConfirm={() => confirm && run('delete', confirm)}>
        {confirm && <>Будет удалено: {titles(confirm)} — вместе с историей версий. Это действие нельзя отменить.</>}
      </ConfirmDialog>
    </div>
  )
}
