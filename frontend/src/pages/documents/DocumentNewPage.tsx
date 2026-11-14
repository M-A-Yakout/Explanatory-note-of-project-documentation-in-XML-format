import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Check, FilePlus2, FileUp } from 'lucide-react'

import { api, ApiError } from '../../shared/api'
import type { Project, SchemaInfo } from '../../shared/types'
import { Alert, Button, FormField, Input, Select } from '../../shared/components/ui'
import { constructionTypeLabel } from '../../shared/app/labels'
import { useToast } from '../../shared/components/Toast'
import { cn } from '../../shared/components/ui'

const steps = ['Объект', 'Версия схемы', 'Способ создания']

/** Wizard: object → XML schema version → blank form (import arrives in part 7). */
export default function DocumentNewPage() {
  const nav = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const [step, setStep] = useState(0)
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [projectId, setProjectId] = useState(params.get('project') ?? '')
  const [schemas, setSchemas] = useState<SchemaInfo[] | null>(null)
  const [schema, setSchema] = useState('')
  const [mode, setMode] = useState<'blank' | 'import'>('blank')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.projects.list({ pageSize: 100, sort: 'name', order: 'asc' }).then((r) => setProjects(r.items)).catch((e) => setError(e.message))
  }, [])
  useEffect(() => {
    api.schemas.list().then((r) => { setSchemas(r); setSchema(r.find((x) => x.isDefault)?.version ?? r[0]?.version ?? '') }).catch((e) => setError(e.message))
  }, [])
  const project = projects?.find((p) => p.id === projectId)

  const create = async () => {
    if (mode === 'import') return nav(`/app/documents/import?project=${projectId}&schema=${encodeURIComponent(schema)}`)
    setBusy(true)
    setError(null)
    try {
      const d = await api.documents.create({ projectId, schemaVersion: schema || undefined, title: title.trim() || undefined })
      toast({ tone: 'success', title: 'Документ создан' })
      nav(`/app/documents/${d.id}/edit`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось создать документ')
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <ol className="mb-6 flex flex-wrap gap-4 text-sm">
        {steps.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined} className={cn('flex items-center gap-2', i < step ? 'text-success' : i === step ? 'font-medium' : 'text-muted')}>
            <span className={cn('flex size-6 items-center justify-center rounded-full border text-xs', i === step && 'border-primary bg-primary-soft')}>{i < step ? <Check className="size-3.5" /> : i + 1}</span>{s}
          </li>
        ))}
      </ol>
      {error && <div className="mb-4"><Alert tone="error" title="Ошибка">{error}</Alert></div>}

      <div className="rounded-lg border border-border bg-surface p-5">
        {step === 0 && (
          projects && projects.length === 0 ? (
            <div className="text-sm"><p className="font-medium">Сначала создайте объект</p><p className="mt-1 text-muted">Документ всегда привязан к объекту.</p>
              <Button className="mt-3" onClick={() => nav('/app/projects/new')}>Создать объект</Button></div>
          ) : (
            <div className="space-y-4">
              <FormField label="Объект" required hint="Данные объекта подставятся в документ автоматически">
                {(p) => (
                  <Select {...p} value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!projects}>
                    <option value="">{projects ? 'Выберите объект' : 'Загрузка…'}</option>
                    {projects?.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
                  </Select>
                )}
              </FormField>
              {project && <p className="text-sm text-muted">{project.address} · {constructionTypeLabel[project.constructionType]}</p>}
              <FormField label="Название документа" hint="Необязательно: по умолчанию «ПЗ — Раздел 1. <объект>»">
                {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} />}
              </FormField>
            </div>
          )
        )}
        {step === 1 && (
          <div className="space-y-3">
            <FormField label="Версия XML-схемы" required hint="По умолчанию — актуальная схема Минстроя России">
              {(p) => (
                <Select {...p} value={schema} disabled={!schemas} onChange={(e) => setSchema(e.target.value)}>
                  {schemas?.map((x) => <option key={x.id} value={x.version}>ExplanatoryNote {x.version}{x.isDefault ? ' (по умолчанию)' : ''}</option>)}
                </Select>
              )}
            </FormField>
          </div>
        )}
        {step === 2 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" aria-pressed={mode === 'blank'} onClick={() => setMode('blank')} className={cn('rounded-lg border p-4 text-left', mode === 'blank' ? 'border-primary bg-primary-soft' : 'border-border hover:bg-surface-2')}>
              <FilePlus2 className={mode === 'blank' ? 'text-primary' : 'text-muted'} /><h3 className="mt-2 font-semibold">Пустая форма</h3><p className="mt-1 text-sm text-muted">Заполнить разделы вручную. Данные объекта уже подставлены.</p></button>
            <button type="button" aria-pressed={mode === 'import'} onClick={() => setMode('import')} className={cn('rounded-lg border p-4 text-left', mode === 'import' ? 'border-primary bg-primary-soft' : 'border-border hover:bg-surface-2')}>
              <FileUp className={mode === 'import' ? 'text-primary' : 'text-muted'} /><h3 className="mt-2 font-semibold">Импорт XML</h3><p className="mt-1 text-sm text-muted">Загрузить существующий файл и продолжить работу с ним.</p></button>
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-between">
        <Button variant="secondary" onClick={() => (step === 0 ? nav('/app/documents') : setStep(step - 1))}>{step === 0 ? 'Отмена' : 'Назад'}</Button>
        {step < 2
          ? <Button disabled={(step === 0 && !projectId) || (step === 1 && !schema)} onClick={() => setStep(step + 1)}>Далее</Button>
          : <Button loading={busy} onClick={create}>{mode === 'import' ? 'Далее: выбрать файл' : 'Создать документ'}</Button>}
      </div>
    </div>
  )
}
