import React, { useCallback, useEffect, useState } from 'react'
import { Download, Search } from 'lucide-react'

import { api, ApiError } from '../../shared/api'
import type { AuditEntry, Page, Role } from '../../shared/types'
import { Alert, Button, Input, Select } from '../../shared/components/ui'
import { StatusBadge } from '../../shared/components/StatusBadge'
import { useToast } from '../../shared/components/Toast'
import { auditActionLabel, fmtDateTime } from '../../shared/app/labels'
import { useDebounced } from '../../shared/app/useDebounced'

const PAGE_SIZE = 25
const ENTITIES: [string, string][] = [['document', 'Документ'], ['project', 'Объект'], ['user', 'Пользователь'], ['invitation', 'Приглашение'], ['organization', 'Организация'], ['schema', 'XML-схема'], ['settings', 'Настройки']]

export default function AuditPage({ role }: { role: Role }) {
  const toast = useToast()
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [action, setAction] = useState('')
  const [entity, setEntity] = useState('')
  const [result, setResult] = useState<'ok' | 'denied' | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [actions, setActions] = useState<string[]>([])
  const [data, setData] = useState<Page<AuditEntry> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const superAdmin = role === 'super_admin'

  useEffect(() => { api.audit.actions().then(setActions).catch(() => {}) }, [])
  useEffect(() => setPage(1), [dq])

  const params = { q: dq, action, entityType: entity, result, dateFrom: from, dateTo: to }
  const load = useCallback(() => {
    setError(null)
    api.audit.list({ ...params, page, pageSize: PAGE_SIZE }).then(setData).catch((e) => setError(e instanceof ApiError ? e.message : 'Не удалось загрузить журнал'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, action, entity, result, from, to, page])
  useEffect(load, [load])

  const reset = () => { setQ(''); setAction(''); setEntity(''); setResult(''); setFrom(''); setTo(''); setPage(1) }
  const filtered = !!(dq || action || entity || result || from || to)
  const exportCsv = async () => {
    setExporting(true)
    try { await api.audit.exportCsv(params); toast({ tone: 'success', title: 'Журнал выгружен', body: 'CSV в кодировке UTF-8, разделитель «;»' }) }
    catch (e) { toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Выгрузка не выполнена' }) } finally { setExporting(false) }
  }
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const cols = ['Время', 'Пользователь', 'Действие', 'Описание', ...(superAdmin ? ['Организация'] : []), 'IP']

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{data ? `Записей: ${data.total}` : 'Загрузка…'}</p>
        <Button variant="secondary" loading={exporting} onClick={exportCsv}><Download className="size-4" aria-hidden />Экспорт CSV</Button>
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-subtle" aria-hidden />
          <Input aria-label="Поиск" className="pl-9" placeholder="Пользователь, описание, идентификатор" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select aria-label="Действие" className="w-60" value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }}>
          <option value="">Любое действие</option>{actions.map((a) => <option key={a} value={a}>{auditActionLabel(a)}</option>)}
        </Select>
        <Select aria-label="Объект журнала" className="w-44" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1) }}>
          <option value="">Любая сущность</option>{ENTITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <Select aria-label="Результат" className="w-52" value={result} onChange={(e) => { setResult(e.target.value as typeof result); setPage(1) }}>
          <option value="">Любой результат</option><option value="ok">Успешно</option><option value="denied">Отказ</option>
        </Select>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2 text-muted">С <Input type="date" aria-label="Дата с" className="w-40" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1) }} /></label>
        <label className="flex items-center gap-2 text-muted">по <Input type="date" aria-label="Дата по" className="w-40" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1) }} /></label>
        {filtered && <button className="text-primary hover:underline" onClick={reset}>Сбросить фильтры</button>}
      </div>

      {error && <Alert tone="error" title="Ошибка загрузки">{error} <button className="underline" onClick={load}>Повторить</button></Alert>}
      {!error && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted"><tr>{cols.map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {!data && Array.from({ length: 5 }).map((_, i) => <tr key={i} className="border-t border-border"><td colSpan={cols.length} className="px-4 py-4"><div className="h-4 animate-pulse rounded bg-surface-2" /></td></tr>)}
              {data?.items.map((e) => (
                <tr key={e.id} className="border-t border-border align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{fmtDateTime(e.createdAt)}</td>
                  <td className="px-4 py-3">{e.userName || <span className="text-subtle">—</span>}</td>
                  <td className="px-4 py-3"><span className="font-medium">{auditActionLabel(e.action)}</span>{e.result === 'denied' && <span className="ml-2"><StatusBadge tone="danger">Отказ</StatusBadge></span>}</td>
                  <td className="px-4 py-3 text-muted">{e.summary || '—'}{e.entityId && <span className="ml-1 font-mono text-xs text-subtle">#{e.entityId}</span>}</td>
                  {superAdmin && <td className="px-4 py-3">{e.organizationName || <span className="text-subtle">—</span>}</td>}
                  <td className="px-4 py-3 font-mono text-xs text-muted">{e.ip ?? '—'}</td>
                </tr>
              ))}
              {data && data.items.length === 0 && <tr><td colSpan={cols.length} className="px-4 py-12 text-center"><p className="font-medium">{filtered ? 'Ничего не найдено' : 'Журнал пуст'}</p></td></tr>}
            </tbody>
          </table>
          {data && data.total > PAGE_SIZE && (
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
