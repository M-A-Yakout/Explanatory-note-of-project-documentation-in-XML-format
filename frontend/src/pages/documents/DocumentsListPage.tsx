import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, Download, Plus, Search } from 'lucide-react'

import { api, ApiError } from '../../shared/api'
import type { Author, DocumentStatus, ExplanatoryNote, Paginated, Project, Role, SchemaInfo } from '../../shared/types'
import { Alert, Button, Input, Select, cn } from '../../shared/components/ui'
import { StatusBadge } from '../../shared/components/StatusBadge'
import { useToast } from '../../shared/components/Toast'
import { canEdit, documentStatusLabel, documentTone, fmtDate } from '../../shared/app/labels'
import { useDebounced } from '../../shared/app/useDebounced'
import { docs, reportBulk } from './bulk'

const PAGE_SIZE = 10

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2" title={`Заполнено: ${value}%`}>
      <div className="h-1.5 w-24 overflow-hidden rounded bg-surface-2" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded bg-primary" style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-muted">{value}%</span>
    </div>
  )
}

export default function DocumentsListPage({ role }: { role: Role }) {
  const nav = useNavigate()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState<DocumentStatus | ''>('')
  const [schema, setSchema] = useState('')
  const [authorId, setAuthorId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const dq = useDebounced(q)
  const [projects, setProjects] = useState<Project[]>([])
  const [schemaList, setSchemaList] = useState<SchemaInfo[]>([])
  const [authors, setAuthors] = useState<Author[]>([])
  const [data, setData] = useState<Paginated<ExplanatoryNote> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<'archive' | 'xml' | null>(null)
  const seq = useRef(0)
  const editor = canEdit(role)

  useEffect(() => {
    api.projects.list({ pageSize: 100, sort: 'name', order: 'asc' }).then((r) => setProjects(r.items)).catch(() => {})
    api.schemas.list().then(setSchemaList).catch(() => {})
    api.documents.authors().then(setAuthors).catch(() => {})
  }, [])
  useEffect(() => setPage(1), [dq])
  useEffect(() => setSelected(new Set()), [dq, projectId, status, schema, authorId, from, to, page])

  const load = () => {
    const id = ++seq.current
    setError(null)
    api.documents
      .list({ q: dq, projectId, status, schemaVersion: schema, authorId, updatedFrom: from, updatedTo: to, page, pageSize: PAGE_SIZE })
      .then((r) => id === seq.current && setData(r))
      .catch((e) => id === seq.current && setError(e.message ?? 'Не удалось загрузить документы'))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [dq, projectId, status, schema, authorId, from, to, page])

  const open = (d: ExplanatoryNote) => nav(editor ? `/app/documents/${d.id}/edit` : `/app/documents/${d.id}/versions`)
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const filtered = !!(dq || projectId || status || schema || authorId || from || to)
  const allOnPage = !!data?.items.length && data.items.every((d) => selected.has(d.id))
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const reset = () => { setQ(''); setProjectId(''); setStatus(''); setSchema(''); setAuthorId(''); setFrom(''); setTo(''); setPage(1) }
  const reset1 = (fn: () => void) => { fn(); setPage(1) }

  const archive = async () => {
    setBusy('archive')
    try {
      reportBulk(toast, await api.documents.bulk([...selected], 'archive'), 'В архив перемещено')
      setSelected(new Set())
      load()
    } catch (e) { toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Операция не выполнена' }) } finally { setBusy(null) }
  }
  const exportXml = async () => {
    setBusy('xml')
    try {
      const r = await api.documents.bulkXml([...selected])
      toast({ tone: 'success', title: `Выгружено: ${docs(r.exported)}`, body: r.skipped ? `Пропущено из-за ошибок: ${r.skipped} (список в _skipped.txt)` : undefined })
    } catch (e) { toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Выгрузка не выполнена' }) } finally { setBusy(null) }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{data ? `Найдено: ${data.total}` : 'Загрузка…'}</p>
        {editor && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => nav('/app/documents/import')}>Импорт XML</Button>
            <Button onClick={() => nav('/app/documents/new')}><Plus className="size-4" aria-hidden /> Новый документ</Button>
          </div>
        )}
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-subtle" aria-hidden />
          <Input aria-label="Поиск" className="pl-9" placeholder="Название, объект, адрес, кадастровый номер…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select aria-label="Объект" className="w-52" value={projectId} onChange={(e) => reset1(() => setProjectId(e.target.value))}>
          <option value="">Все объекты</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select aria-label="Статус" className="w-40" value={status} onChange={(e) => reset1(() => setStatus(e.target.value as DocumentStatus | ''))}>
          <option value="">Кроме архива</option>
          {Object.entries(documentStatusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select aria-label="Версия схемы" className="w-40" value={schema} onChange={(e) => reset1(() => setSchema(e.target.value))}>
          <option value="">Любая схема</option>
          {schemaList.map((x) => <option key={x.id} value={x.version}>Схема {x.version}</option>)}
        </Select>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Select aria-label="Автор" className="w-52" value={authorId} onChange={(e) => reset1(() => setAuthorId(e.target.value))}>
          <option value="">Любой автор</option>
          {authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-muted">Изменён с <Input type="date" aria-label="Изменён с" className="w-40" value={from} max={to || undefined} onChange={(e) => reset1(() => setFrom(e.target.value))} /></label>
        <label className="flex items-center gap-2 text-muted">по <Input type="date" aria-label="Изменён по" className="w-40" value={to} min={from || undefined} onChange={(e) => reset1(() => setTo(e.target.value))} /></label>
        {filtered && <button className="text-primary hover:underline" onClick={reset}>Сбросить фильтры</button>}
      </div>

      {selected.size > 0 && (
        <div role="region" aria-label="Действия с выбранными" className="mb-3 flex flex-wrap items-center gap-3 rounded-md bg-primary-soft px-4 py-2 text-sm">
          <span className="font-medium">Выбрано: {selected.size}</span>
          {editor && <Button size="sm" variant="secondary" loading={busy === 'archive'} onClick={archive}><Archive className="size-4" aria-hidden />В архив</Button>}
          <Button size="sm" variant="secondary" loading={busy === 'xml'} onClick={exportXml}><Download className="size-4" aria-hidden />Скачать XML (ZIP)</Button>
          <button className="text-primary hover:underline" onClick={() => setSelected(new Set())}>Снять выбор</button>
        </div>
      )}

      {error && <Alert tone="error" title="Ошибка загрузки">{error} <button className="underline" onClick={load}>Повторить</button></Alert>}
      {!error && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>
                <th className="w-10 px-4 py-2.5"><input type="checkbox" aria-label="Выбрать все на странице" className="size-4 accent-[var(--color-primary,#1f4fbf)]" checked={allOnPage} onChange={() => setSelected(allOnPage ? new Set() : new Set(data!.items.map((d) => d.id)))} /></th>
                {['Документ', 'Схема', 'Автор', 'Заполнено', 'Статус', 'Обновлён'].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {!data && Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-t border-border"><td colSpan={7} className="px-4 py-4"><div className="h-4 animate-pulse rounded bg-surface-2" /></td></tr>
              ))}
              {data?.items.map((d) => (
                <tr key={d.id} tabIndex={0} role="link" onClick={() => open(d)} onKeyDown={(e) => e.key === 'Enter' && open(d)}
                    className={cn('cursor-pointer border-t border-border hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none', selected.has(d.id) && 'bg-primary-soft')}>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`Выбрать «${d.title}»`} className="size-4 accent-[var(--color-primary,#1f4fbf)]" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
                  </td>
                  <td className="px-4 py-3"><div className="font-medium">{d.title}</div><div className="text-xs text-muted">{d.projectName}</div></td>
                  <td className="px-4 py-3 font-mono text-xs">{d.schemaVersion}</td>
                  <td className="px-4 py-3">{d.authorName}</td>
                  <td className="px-4 py-3"><ProgressBar value={d.progress} /></td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={documentTone[d.status]}>{documentStatusLabel[d.status]}</StatusBadge>
                    {(d.errorsCount > 0 || d.warningsCount > 0) && (
                      <span className={cn('ml-2 text-xs', d.validationStale ? 'text-subtle' : 'text-danger')} title={d.validationStale ? 'Результаты проверки устарели' : undefined}>
                        {d.errorsCount > 0 && `${d.errorsCount} ош.`}{d.errorsCount > 0 && d.warningsCount > 0 && ' · '}{d.warningsCount > 0 && <span className="text-warning">{d.warningsCount} пред.</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{fmtDate(d.updatedAt)}</td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center">
                  <p className="font-medium">{filtered ? 'Ничего не найдено' : 'Документов пока нет'}</p>
                  <p className="mt-1 text-sm text-muted">{filtered ? 'Измените условия поиска или сбросьте фильтры.' : editor ? 'Создайте первую пояснительную записку для объекта.' : 'В организации ещё нет документов.'}</p>
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
    </div>
  )
}
