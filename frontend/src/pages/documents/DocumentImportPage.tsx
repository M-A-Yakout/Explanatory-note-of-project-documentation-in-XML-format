import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CircleCheck, TriangleAlert, UploadCloud } from 'lucide-react'

import { api, ApiError } from '../../shared/api'
import type { ImportReport, Project, SchemaInfo } from '../../shared/types'
import { Alert, Button, FormField, Input, Select, cn } from '../../shared/components/ui'
import { useToast } from '../../shared/components/Toast'
import { fileToBase64, saveTextFile } from '../../shared/app/files'

const MAX_MB = 20
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`)

function reportText(r: ImportReport): string {
  const lines = [`Отчёт об импорте: ${r.filename}`, `Схема в файле: ${r.detectedVersion ?? 'не указана'}, использована: ${r.usedVersion}`, '',
    `Перенесено: объект — ${r.summary.object} полей, ТЭП — ${r.summary.tei}, разделов — ${r.summary.composition}, ссылок — ${r.summary.references}`, '']
  if (r.skippedTotal) lines.push(`НЕ ПЕРЕНЕСЕНО (${r.skippedTotal}):`, ...r.skipped.map((e) => `  ${e.xpath} — ${e.message}`), '')
  if (r.truncatedTotal) lines.push(`ОБРЕЗАНО (${r.truncatedTotal}):`, ...r.truncated.map((e) => `  ${e.xpath} — ${e.message}`), '')
  if (!r.xsdValid) lines.push(`ЗАМЕЧАНИЯ XSD ИСХОДНОГО ФАЙЛА (${r.xsdIssues.length}):`, ...r.xsdIssues.map((i) => `  [${i.code}] строка ${i.line ?? '?'}: ${i.message}`))
  return lines.join('\n') + '\n'
}

/** Import: choose object → drop an XML file → see what will and will not be transferred → create the document. */
export default function DocumentImportPage() {
  const nav = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [schemas, setSchemas] = useState<SchemaInfo[]>([])
  const [projectId, setProjectId] = useState(params.get('project') ?? '')
  const [schema, setSchema] = useState(params.get('schema') ?? '')
  const [file, setFile] = useState<{ name: string; b64: string } | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [title, setTitle] = useState('')
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState<'analyze' | 'create' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.projects.list({ pageSize: 100, sort: 'name', order: 'asc' }).then((r) => setProjects(r.items)).catch((e) => setError(e.message))
    api.schemas.list().then(setSchemas).catch(() => {})
  }, [])

  const analyze = async (name: string, b64: string, version = schema) => {
    setBusy('analyze')
    setError(null)
    setReport(null)
    try {
      setReport(await api.documents.importPreview({ contentBase64: b64, filename: name, schemaVersion: version || undefined }))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось прочитать файл')
    } finally { setBusy(null) }
  }

  const pick = async (f?: File) => {
    if (!f) return
    setError(null)
    if (!f.name.toLowerCase().endsWith('.xml')) return setError('Нужен файл с расширением .xml')
    if (f.size > MAX_MB * 1024 * 1024) return setError(`Файл больше ${MAX_MB} МБ`)
    const b64 = await fileToBase64(f)
    setFile({ name: f.name, b64 })
    await analyze(f.name, b64)
  }

  const create = async () => {
    if (!file || !projectId) return
    setBusy('create')
    setError(null)
    try {
      const r = await api.documents.importCreate({ contentBase64: file.b64, filename: file.name, projectId, schemaVersion: schema || undefined, title: title.trim() || undefined })
      toast({ tone: 'success', title: 'Документ создан из файла' })
      nav(`/app/documents/${r.document.id}/edit`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось создать документ')
      setBusy(null)
    }
  }

  const partial = !!report && (report.skippedTotal > 0 || report.truncatedTotal > 0 || !report.xsdValid)

  return (
    <div className="max-w-3xl">
      <p className="mb-4 text-sm text-muted">Загрузите существующий XML пояснительной записки: сервис прочитает его, покажет, что удалось перенести, и создаст документ для редактирования.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Объект" required hint="Документ будет привязан к этому объекту">
          {(p) => (
            <Select {...p} value={projectId} disabled={!projects} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">{projects ? 'Выберите объект' : 'Загрузка…'}</option>
              {projects?.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
            </Select>
          )}
        </FormField>
        <FormField label="Версия XML-схемы" hint="По умолчанию определяется по файлу">
          {(p) => (
            <Select {...p} value={schema} onChange={(e) => { setSchema(e.target.value); if (file) analyze(file.name, file.b64, e.target.value) }}>
              <option value="">Определить по файлу</option>
              {schemas.map((x) => <option key={x.id} value={x.version}>ExplanatoryNote {x.version}{x.isDefault ? ' (по умолчанию)' : ''}</option>)}
            </Select>
          )}
        </FormField>
      </div>

      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]) }}
        className={cn('mt-4 flex cursor-pointer flex-col items-center rounded-lg border border-dashed px-6 py-8 text-center text-sm', drag ? 'border-primary bg-primary-soft' : 'border-border-strong bg-surface-2')}>
        <UploadCloud className="mb-1 text-muted" aria-hidden />
        {file ? <span className="font-mono">{file.name}</span> : <span>Перетащите .xml сюда или нажмите для выбора</span>}
        <span className="text-xs text-muted">До {MAX_MB} МБ · кодировки UTF-8 и windows-1251</span>
        <input type="file" accept=".xml" className="sr-only" aria-label="Файл XML" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
      </label>

      {busy === 'analyze' && <p className="mt-4 text-sm text-muted" role="status">Анализ файла…</p>}
      {error && <div className="mt-4"><Alert tone="error" title="Не удалось импортировать">{error}</Alert></div>}

      {report && (
        <section className="mt-5" aria-label="Результат анализа">
          {report.schemaFallback && (
            <div className="mb-3"><Alert tone="warning" title="Схема из файла недоступна">
              {report.detectedVersion ? `В файле указана версия ${report.detectedVersion}, её нет среди активных схем.` : 'В файле не указана версия схемы.'} Использована схема {report.usedVersion}.</Alert></div>
          )}
          <div className={cn('mb-4 flex items-start gap-3 rounded-lg border p-4 text-sm', partial ? 'border-warning bg-warning-soft text-warning' : 'border-success bg-success-soft text-success')}>
            {partial ? <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden /> : <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden />}
            <div>
              <b>{partial ? 'Частичный импорт: часть данных не перенесена.' : 'Файл прочитан полностью.'}</b>
              <div>{report.filename} · {kb(report.sizeBytes)} · схема в файле: {report.detectedVersion ?? 'не указана'}, используется {report.usedVersion}</div>
            </div>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-5">
            {[['Поля объекта', String(report.summary.object)], ['Показатели ТЭП', String(report.summary.tei)], ['Разделов в составе', String(report.summary.composition)], ['Нормативных ссылок', String(report.summary.references)], ['Доп. сведения', report.summary.additional ? 'есть' : 'нет']].map(([l, v]) => (
              <div key={l} className="rounded-lg border border-border bg-surface p-3"><div className="text-xl font-semibold">{v}</div><div className="text-xs text-muted">{l}</div></div>
            ))}
          </div>

          <EntryTable title="Не перенесено" total={report.skippedTotal} items={report.skipped} tone="warning" />
          <EntryTable title="Значения обрезаны или отброшены" total={report.truncatedTotal} items={report.truncated} tone="warning" />
          {!report.xsdValid && (
            <details className="mb-4 rounded-lg border border-border bg-surface">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Замечания XSD к исходному файлу ({report.xsdIssues.length})</summary>
              <ul className="divide-y divide-border border-t border-border text-sm">
                {report.xsdIssues.map((i, k) => <li key={k} className="px-4 py-2"><span className="font-mono text-xs text-muted">{i.code}{i.line ? ` · строка ${i.line}` : ''}</span><div>{i.message}</div></li>)}
              </ul>
              <p className="border-t border-border px-4 py-2 text-xs text-muted">Это замечания к исходному файлу: импорт продолжается, а после создания документ проходит обычную проверку.</p>
            </details>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <FormField label="Название документа" hint="Необязательно">{(p) => <Input {...p} value={title} maxLength={500} placeholder={`ПЗ — Раздел 1. ${report.data.object.name || ''}`} onChange={(e) => setTitle(e.target.value)} />}</FormField>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={!projectId} loading={busy === 'create'} title={!projectId ? 'Выберите объект' : undefined} onClick={create}>Создать документ</Button>
            <Button variant="secondary" onClick={() => saveTextFile(`import_report_${report.filename}.txt`, reportText(report))}>Скачать отчёт</Button>
            <Button variant="secondary" onClick={() => { setFile(null); setReport(null); setError(null) }}>Выбрать другой файл</Button>
          </div>
        </section>
      )}
    </div>
  )
}

function EntryTable({ title, total, items, tone }: { title: string; total: number; items: ImportReport['skipped']; tone: 'warning' }) {
  if (total === 0) return null
  return (
    <section className="mb-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><TriangleAlert className={cn('size-4', tone === 'warning' && 'text-warning')} aria-hidden />{title} · {total}</h3>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted"><tr><th className="px-4 py-2 font-medium">Элемент в файле</th><th className="px-4 py-2 font-medium">Причина</th></tr></thead>
          <tbody>{items.map((e, i) => <tr key={i} className="border-t border-border"><td className="px-4 py-2 font-mono text-xs">{e.xpath}</td><td className="px-4 py-2">{e.message}</td></tr>)}</tbody>
        </table>
        {total > items.length && <p className="border-t border-border px-4 py-2 text-xs text-muted">Показаны первые {items.length} из {total}.</p>}
      </div>
    </section>
  )
}
