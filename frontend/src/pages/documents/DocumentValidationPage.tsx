import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'

import { api, ApiError } from '../../shared/api'
import type { DocIssue, DocumentDetail, Role, ValidationResult } from '../../shared/types'
import { Alert, Button, cn } from '../../shared/components/ui'
import { StatusBadge } from '../../shared/components/StatusBadge'
import { useToast } from '../../shared/components/Toast'
import { canEdit, documentStatusLabel, documentTone, fmtDateTime } from '../../shared/app/labels'

const SEVERITIES = [
  { key: 'error', title: 'Ошибки', Icon: CircleAlert, tone: 'text-danger', chip: 'bg-danger-soft text-danger' },
  { key: 'warning', title: 'Предупреждения', Icon: TriangleAlert, tone: 'text-warning', chip: 'bg-warning-soft text-warning' },
  { key: 'info', title: 'Сведения', Icon: Info, tone: 'text-primary', chip: 'bg-primary-soft text-primary' },
] as const
type Tab = 'all' | 'business' | 'xsd'

export default function DocumentValidationPage({ id, role }: { id: string; role: Role }) {
  const nav = useNavigate()
  const toast = useToast()
  const [doc, setDoc] = useState<DocumentDetail | null>(null)
  const [result, setResult] = useState<ValidationResult | null | undefined>(undefined) // undefined = loading
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('all')
  const [running, setRunning] = useState(false)

  const load = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([api.documents.get(id), api.documents.validation(id)])
      setDoc(d)
      setResult(r)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось загрузить результаты')
    }
  }, [id])
  useEffect(() => { load() }, [load])

  const run = async () => {
    setRunning(true)
    try {
      setResult(await api.documents.validate(id))
      setDoc(await api.documents.get(id))
    } catch (e) {
      toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Проверка не выполнена' })
    } finally { setRunning(false) }
  }

  if (error) return <Alert tone="error" title="Документ недоступен">{error} <button className="underline" onClick={() => nav('/app/documents')}>К списку</button></Alert>
  if (!doc || result === undefined) return <p className="text-sm text-muted">Загрузка…</p>

  const editor = canEdit(role) && doc.status !== 'archived'
  const shown = result ? result.issues.filter((i) => tab === 'all' || i.source === tab) : []
  const count = (t: Tab) => (result ? result.issues.filter((i) => t === 'all' || i.source === t).length : 0)
  const go = (i: DocIssue) => nav(`/app/documents/${id}/edit${i.field ? `?field=${encodeURIComponent(i.field)}` : ''}`)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{doc.title}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            {doc.projectName}
            <StatusBadge tone={documentTone[doc.status]}>{documentStatusLabel[doc.status]}</StatusBadge>
            {result && <span>Проверено {fmtDateTime(result.checkedAt)}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editor && <Button variant="secondary" onClick={() => nav(`/app/documents/${id}/edit`)}>Открыть редактор</Button>}
          {editor && <Button loading={running} onClick={run}>{result ? 'Проверить заново' : 'Запустить проверку'}</Button>}
          {result && <Button variant="secondary" onClick={() => nav(`/app/documents/${id}/export`)}>Выгрузка</Button>}
        </div>
      </div>

      {result === null && (
        <div className="rounded-lg border border-dashed border-border-strong px-6 py-12 text-center">
          <p className="font-medium">Проверка ещё не выполнялась</p>
          <p className="mt-1 text-sm text-muted">Проверка применяет бизнес-правила и валидацию по XSD-схеме {doc.schemaVersion}.</p>
          {editor && <Button className="mt-4" loading={running} onClick={run}>Запустить проверку</Button>}
        </div>
      )}

      {result && (
        <>
          {result.stale && (
            <div className="mb-4"><Alert tone="warning" title="Результаты устарели">Документ изменён после проверки.{' '}
              {editor ? <button className="underline" onClick={run}>Проверить заново</button> : 'Попросите автора запустить проверку.'}</Alert></div>
          )}
          <div className="mb-5 grid gap-3 sm:grid-cols-4">
            {[{ l: 'Ошибки', n: result.errors, c: 'text-danger' }, { l: 'Предупреждения', n: result.warnings, c: 'text-warning' }, { l: 'Сведения', n: result.infos, c: 'text-primary' }].map((x) => (
              <div key={x.l} className="rounded-lg border border-border bg-surface p-4"><div className={cn('text-2xl font-semibold', x.c)}>{x.n}</div><div className="text-sm text-muted">{x.l}</div></div>
            ))}
            <div className="rounded-lg border border-border bg-surface p-4">
              <StatusBadge tone={result.xmlValid ? 'success' : 'danger'}>{result.xmlValid ? 'Соответствует XSD' : 'Не соответствует XSD'}</StatusBadge>
              <div className="mt-2 text-sm text-muted">Схема {result.schemaVersion}</div>
            </div>
          </div>

          <div role="tablist" className="mb-4 flex gap-1 border-b border-border text-sm">
            {([['all', 'Все'], ['business', 'Бизнес-правила'], ['xsd', 'XSD']] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={cn('px-3 py-2', tab === k ? 'border-b-2 border-primary font-medium' : 'text-muted hover:text-fg')}>{l} ({count(k)})</button>
            ))}
          </div>

          {shown.filter((i) => i.severity !== 'info').length === 0 && (
            <div className="mb-4 flex items-center gap-3 rounded-lg border border-success bg-success-soft p-4 text-sm text-success">
              <CircleCheck className="size-5 shrink-0" aria-hidden />
              <div><b>Ошибок не найдено.</b>{result.errors === 0 && ' Документ можно выгружать.'}</div>
            </div>
          )}

          <div className="space-y-5">
            {SEVERITIES.map(({ key, title, Icon, tone, chip }) => {
              const list = shown.filter((i) => i.severity === key)
              if (!list.length) return null
              return (
                <section key={key} aria-label={title}>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Icon className={cn('size-4', tone)} aria-hidden />{title} · {list.length}</h3>
                  <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                    {list.map((i) => (
                      <li key={i.id + i.xpath} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                        <span className={cn('rounded px-2 py-0.5 font-mono text-xs', chip)}>{i.code}</span>
                        <div className="min-w-[240px] flex-1">
                          <div>{i.message}</div>
                          <div className="mt-0.5 font-mono text-xs text-muted">{i.field ?? i.xpath ?? '—'}{i.line ? ` · строка ${i.line}` : ''}</div>
                        </div>
                        <span className="text-xs text-muted">{i.source === 'xsd' ? 'XSD' : 'Бизнес-правило'}</span>
                        {editor && <button className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => go(i)}>Перейти к полю <ArrowRight className="size-3.5" aria-hidden /></button>}
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
