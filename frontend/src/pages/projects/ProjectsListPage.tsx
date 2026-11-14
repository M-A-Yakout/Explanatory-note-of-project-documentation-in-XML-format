import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'

import { api } from '../../shared/api'
import type { ProjectListParams } from '../../shared/api'
import type { Paginated, Project, Role } from '../../shared/types'
import { Alert, Button, Input, Select } from '../../shared/components/ui'
import { StatusBadge, projectTone } from '../../shared/components/StatusBadge'
import { canEdit, constructionTypeLabel, fmtDate, projectStatusLabel } from '../../shared/app/labels'

const PAGE_SIZE = 10

export default function ProjectsListPage({ role }: { role: Role }) {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<ProjectListParams['status']>('')
  const [type, setType] = useState<ProjectListParams['constructionType']>('')
  const [sort, setSort] = useState<NonNullable<ProjectListParams['sort']>>('updated_at')
  const [page, setPage] = useState(1)
  const [debouncedQ, setDebouncedQ] = useState('')
  const [data, setData] = useState<Paginated<Project> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const load = () => {
    const id = ++seq.current
    setLoading(true)
    setError(null)
    api.projects
      .list({ q: debouncedQ, status, constructionType: type, sort, order: sort === 'name' || sort === 'code' ? 'asc' : 'desc', page, pageSize: PAGE_SIZE })
      .then((r) => id === seq.current && setData(r))
      .catch((e) => id === seq.current && setError(e.message ?? 'Не удалось загрузить объекты'))
      .finally(() => id === seq.current && setLoading(false))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [debouncedQ, status, type, sort, page])

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const filtered = !!(debouncedQ || status || type)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{data ? `Найдено: ${data.total}` : 'Загрузка…'}</p>
        </div>
        {canEdit(role) && (
          <Button onClick={() => nav('/app/projects/new')}>
            <Plus className="size-4" aria-hidden /> Новый объект
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-subtle" aria-hidden />
          <Input aria-label="Поиск" className="pl-9" placeholder="Название, адрес, кадастровый номер…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select aria-label="Статус" className="w-44" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1) }}>
          <option value="">Все статусы</option>
          {Object.entries(projectStatusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select aria-label="Вид строительства" className="w-52" value={type} onChange={(e) => { setType(e.target.value as typeof type); setPage(1) }}>
          <option value="">Любой вид</option>
          {Object.entries(constructionTypeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select aria-label="Сортировка" className="w-60" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="updated_at">Сначала новые правки</option>
          <option value="created_at">Сначала новые</option>
          <option value="name">По названию</option>
          <option value="code">По коду</option>
        </Select>
      </div>

      {error && (
        <Alert tone="error" title="Ошибка загрузки">
          {error} <button className="underline" onClick={load}>Повторить</button>
        </Alert>
      )}

      {!error && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>{['Код', 'Объект', 'Кадастровый номер', 'Вид строительства', 'Статус', 'Обновлён'].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {loading && !data && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-border">
                  <td colSpan={6} className="px-4 py-4"><div className="h-4 animate-pulse rounded bg-surface-2" /></td>
                </tr>
              ))}
              {data?.items.map((p) => (
                <tr key={p.id} tabIndex={0} role="link" onClick={() => nav(`/app/projects/${p.id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/app/projects/${p.id}`)}
                    className="cursor-pointer border-t border-border hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none">
                  <td className="px-4 py-3 font-mono text-xs text-muted">{p.code}</td>
                  <td className="px-4 py-3"><div className="font-medium">{p.name}</div><div className="text-xs text-muted">{p.address}</div></td>
                  <td className="px-4 py-3 font-mono text-xs">{p.cadastralNumber}</td>
                  <td className="px-4 py-3">{constructionTypeLabel[p.constructionType]}</td>
                  <td className="px-4 py-3"><StatusBadge tone={projectTone[p.status]}>{projectStatusLabel[p.status]}</StatusBadge></td>
                  <td className="px-4 py-3 text-muted">{fmtDate(p.updatedAt)}</td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center">
                  <p className="font-medium">{filtered ? 'Ничего не найдено' : 'Объектов пока нет'}</p>
                  <p className="mt-1 text-sm text-muted">{filtered ? 'Измените условия поиска или сбросьте фильтры.' : canEdit(role) ? 'Создайте первый объект, чтобы начать работу.' : 'В организации ещё нет объектов.'}</p>
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
