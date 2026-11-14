import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircleCheck, Download, FileText, TriangleAlert } from 'lucide-react'

import { api, ApiError } from '../../shared/api'
import type { DocumentDetail, Role, ValidationResult, XmlPreview } from '../../shared/types'
import { Alert, Button } from '../../shared/components/ui'
import { StatusBadge } from '../../shared/components/StatusBadge'
import { useToast } from '../../shared/components/Toast'
import { canEdit, documentStatusLabel, documentTone } from '../../shared/app/labels'

export default function DocumentExportPage({ id, role }: { id: string; role: Role }) {
  const nav = useNavigate()
  const toast = useToast()
  const [doc, setDoc] = useState<DocumentDetail | null>(null)
  const [xml, setXml] = useState<XmlPreview | null>(null)
  const [result, setResult] = useState<ValidationResult | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'check' | 'xml' | 'report' | null>(null)

  const load = useCallback(async () => {
    try {
      const [d, x, r] = await Promise.all([api.documents.get(id), api.documents.xml(id), api.documents.validation(id)])
      setDoc(d); setXml(x); setResult(r)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось загрузить данные для выгрузки')
    }
  }, [id])
  useEffect(() => { load() }, [load])

  const act = async (kind: 'check' | 'xml' | 'report', fn: () => Promise<unknown>) => {
    setBusy(kind)
    try { await fn() } catch (e) {
      toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Операция не выполнена' })
      if (e instanceof ApiError && e.code === 'validation_failed') load()
    } finally { setBusy(null) }
  }

  if (error) return <Alert tone="error" title="Документ недоступен">{error} <button className="underline" onClick={() => nav('/app/documents')}>К списку</button></Alert>
  if (!doc || !xml || result === undefined) return <p className="text-sm text-muted">Загрузка…</p>

  const editor = canEdit(role) && doc.status !== 'archived'
  const known = result && !result.stale
  const blocked = !!known && result.errors > 0
  const ready = !!known && result.errors === 0
  const check = () => act('check', async () => { setResult(await api.documents.validate(id)); setDoc(await api.documents.get(id)) })

  return (
    <div className="max-w-3xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{doc.title}</h2>
        <p className="mt-1 flex items-center gap-2 text-sm text-muted">{doc.projectName}<StatusBadge tone={documentTone[doc.status]}>{documentStatusLabel[doc.status]}</StatusBadge></p>
      </div>

      {ready && <div className="mb-4 flex items-start gap-3 rounded-lg border border-success bg-success-soft p-4 text-sm text-success"><CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden /><div><b>Документ готов к выгрузке.</b>{result!.warnings > 0 && ` Предупреждений: ${result!.warnings} — они не блокируют выгрузку.`}</div></div>}
      {blocked && <div className="mb-4 flex items-start gap-3 rounded-lg border border-danger bg-danger-soft p-4 text-sm text-danger"><TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden /><div><b>Скачать XML нельзя: ошибок — {result!.errors}.</b> Исправьте их и повторите проверку. <button className="underline" onClick={() => nav(`/app/documents/${id}/validation`)}>Открыть список ошибок</button></div></div>}
      {!known && <div className="mb-4"><Alert tone="warning" title={result ? 'Результаты проверки устарели' : 'Проверка ещё не выполнялась'}>
        {editor ? <>Выполните проверку перед выгрузкой. <button className="underline" disabled={busy === 'check'} onClick={check}>Проверить сейчас</button></> : 'Попросите автора запустить проверку. Сервер всё равно проверит документ при скачивании.'}</Alert></div>}

      <div className="rounded-lg border border-border bg-surface p-5">
        <h3 className="mb-3 text-sm font-semibold">Файл</h3>
        <dl className="divide-y divide-border text-sm">
          {[['Имя файла', xml.filename], ['Размер', `${Math.max(1, Math.round(xml.sizeBytes / 1024))} КБ`], ['Схема', `ExplanatoryNote ${xml.schemaVersion}`], ['Кодировка', 'UTF-8'], ['Редакция документа', String(doc.revision)], ['Соответствие XSD', xml.xsdValid ? 'да' : 'нет']].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-muted">{k}</dt><dd className="font-mono">{v}</dd></div>
          ))}
        </dl>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button disabled={blocked} loading={busy === 'xml'} title={blocked ? 'Сначала исправьте ошибки' : undefined}
          onClick={() => act('xml', async () => { await api.documents.downloadXml(id, xml.filename); toast({ tone: 'success', title: 'XML скачан' }) })}>
          <Download className="size-4" aria-hidden />Скачать XML
        </Button>
        <Button variant="secondary" loading={busy === 'report'} onClick={() => act('report', () => api.documents.downloadReport(id))}><FileText className="size-4" aria-hidden />Скачать отчёт о проверке</Button>
        <Button variant="secondary" onClick={() => nav(`/app/documents/${id}/preview`)}>Просмотр XML</Button>
        {editor && known && <Button variant="secondary" loading={busy === 'check'} onClick={check}>Проверить заново</Button>}
      </div>
    </div>
  )
}
