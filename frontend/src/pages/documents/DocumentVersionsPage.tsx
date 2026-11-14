import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api, ApiError } from '../../shared/api'
import type { Change, DocumentDetail, Role, VersionMeta } from '../../shared/types'
import { Alert, Button, Select } from '../../shared/components/ui'
import { StatusBadge } from '../../shared/components/StatusBadge'
import { useToast } from '../../shared/components/Toast'
import { canEdit, documentStatusLabel, documentTone, fmtDateTime } from '../../shared/app/labels'
import { cn } from '../../shared/components/ui'

const SECTION: Record<string, string> = { object: 'Объект', tei: 'ТЭП', composition: 'Состав документации', references: 'Нормативные ссылки', additional: 'Дополнительно' }
const FIELD: Record<string, string> = {
  name: 'Наименование', address: 'Адрес', cadastralNumber: 'Кадастровый номер', constructionType: 'Вид строительства',
  developer: 'Застройщик', customer: 'Заказчик', designer: 'Проектировщик', functionalPurpose: 'Назначение',
  financingSource: 'Финансирование', unit: 'Ед. изм.', value: 'Значение', included: 'Включён', note: 'Примечание',
  code: 'Код', title: 'Название', custom: 'Пользовательская', notes: 'Примечания',
}

export function pathLabel(path: string): string {
  const [first, ...rest] = path.split('.')
  const m = first.match(/^(\w+)\[(.+)\]$/)
  const section = SECTION[m ? m[1] : first] ?? first
  const row = m ? ` · строка ${m[2]}` : ''
  const field = rest.map((r) => FIELD[r] ?? r).join(' · ')
  return `${section}${row}${field ? ' · ' + field : ''}`
}
const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'да' : 'нет') : String(v))

export default function DocumentVersionsPage({ id, role }: { id: string; role: Role }) {
  const nav = useNavigate()
  const toast = useToast()
  const [doc, setDoc] = useState<DocumentDetail | null>(null)
  const [versions, setVersions] = useState<VersionMeta[]>([])
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState<number | null>(null)
  const [to, setTo] = useState<number | 'current'>('current')
  const [changes, setChanges] = useState<Change[] | null>(null)
  const [confirm, setConfirm] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [d, v] = await Promise.all([api.documents.get(id), api.documents.versions(id)])
      setDoc(d)
      setVersions(v)
      setFrom((f) => f ?? (v.length > 1 ? v[1].number : v[0]?.number ?? null))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось загрузить историю')
    }
  }, [id])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (from === null) return
    setChanges(null)
    api.documents.diff(id, from, to).then(setChanges).catch(() => setChanges([]))
  }, [id, from, to, doc?.revision])

  const restore = async (n: number) => {
    setBusy(true)
    try {
      await api.documents.restore(id, n)
      toast({ tone: 'success', title: `Версия ${n} восстановлена` })
      setConfirm(null)
      setFrom(null)
      await load()
    } catch (e) {
      toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Не удалось восстановить версию' })
    } finally { setBusy(false) }
  }

  if (error) return <Alert tone="error" title="Документ недоступен">{error} <button className="underline" onClick={() => nav('/app/documents')}>К списку</button></Alert>
  if (!doc) return <p className="text-sm text-muted">Загрузка…</p>
  const latest = versions[0]?.number
  const label = (n: number | 'current') => (n === 'current' ? 'Текущее состояние' : `Версия ${n}`)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{doc.title}</h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">{doc.projectName} <StatusBadge tone={documentTone[doc.status]}>{documentStatusLabel[doc.status]}</StatusBadge></p>
        </div>
        {canEdit(role) && <Button variant="secondary" onClick={() => nav(`/app/documents/${id}/edit`)}>Открыть редактор</Button>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <ul className="space-y-2" aria-label="Версии">
          {versions.map((v) => (
            <li key={v.number} className={cn('rounded-lg border bg-surface p-3 text-sm', v.number === from || v.number === to ? 'border-primary bg-primary-soft' : 'border-border')}>
              <div className="flex items-center justify-between"><b>v{v.number}{v.number === latest && <span className="ml-2 text-xs font-normal text-success">последняя</span>}</b><span className="text-xs text-muted">{fmtDateTime(v.createdAt)}</span></div>
              <div className="text-muted">{v.authorName}</div>
              <div>{v.comment}</div>
              {canEdit(role) && doc.status !== 'archived' && (
                confirm === v.number ? (
                  <div className="mt-2 flex items-center gap-2 text-xs"><span>Заменить текущие данные?</span>
                    <Button size="sm" loading={busy} onClick={() => restore(v.number)}>Да</Button>
                    <Button size="sm" variant="secondary" onClick={() => setConfirm(null)}>Нет</Button></div>
                ) : <button className="mt-2 text-xs text-primary hover:underline" onClick={() => setConfirm(v.number)}>Восстановить эту версию</button>
              )}
            </li>
          ))}
        </ul>

        <section className="rounded-lg border border-border bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 text-sm">
            <span className="font-semibold">Сравнение</span>
            <Select aria-label="Исходная версия" className="w-40" value={from ?? ''} onChange={(e) => setFrom(Number(e.target.value))}>
              {versions.map((v) => <option key={v.number} value={v.number}>{label(v.number)}</option>)}
            </Select>
            <span aria-hidden>→</span>
            <Select aria-label="Сравниваемая версия" className="w-48" value={String(to)} onChange={(e) => setTo(e.target.value === 'current' ? 'current' : Number(e.target.value))}>
              <option value="current">Текущее состояние</option>
              {versions.map((v) => <option key={v.number} value={v.number}>{label(v.number)}</option>)}
            </Select>
          </div>
          {changes === null && <p className="px-4 py-6 text-sm text-muted">Сравнение…</p>}
          {changes && changes.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">Различий нет</p>}
          {changes && changes.length > 0 && (
            <ul className="divide-y divide-border text-sm">
              {changes.map((c) => (
                <li key={c.path} className="px-4 py-2.5">
                  <div className="text-xs text-muted">{pathLabel(c.path)}</div>
                  <div className="mt-1 grid gap-1 sm:grid-cols-2">
                    <div className={cn('rounded px-2 py-1 font-mono text-[13px] break-words', c.kind !== 'added' ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-subtle')}>− {show(c.before)}</div>
                    <div className={cn('rounded px-2 py-1 font-mono text-[13px] break-words', c.kind !== 'removed' ? 'bg-success-soft text-success' : 'bg-surface-2 text-subtle')}>+ {show(c.after)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
