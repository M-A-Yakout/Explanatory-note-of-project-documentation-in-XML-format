import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { api, ApiError } from '../../shared/api'
import { Alert, Button, FormField, Input, Select } from '../../shared/components/ui'
import { useToast } from '../../shared/components/Toast'
import { constructionTypeLabel } from '../../shared/app/labels'
import { projectSchema, type ProjectValues } from '../../shared/validation/project'

const empty: ProjectValues = {
  name: '', address: '', cadastralNumber: '', constructionType: 'new', developer: '',
  customer: '', designer: '', functionalPurpose: '', financingSource: '',
}

/** Create (no id) or edit (id) an object. */
export default function ProjectFormPage({ id }: { id?: string }) {
  const nav = useNavigate()
  const toast = useToast()
  const [loading, setLoading] = useState(!!id)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<ProjectValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: empty,
  })

  useEffect(() => {
    if (!id) return
    api.projects
      .get(id)
      .then((p) => reset({ ...empty, ...p, functionalPurpose: p.functionalPurpose ?? '', financingSource: p.financingSource ?? '' }))
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false))
  }, [id, reset])

  useEffect(() => {
    if (!isDirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [isDirty])

  const onSubmit = handleSubmit(async (v) => {
    setSubmitError(null)
    try {
      const saved = id ? await api.projects.update(id, v) : await api.projects.create(v)
      toast({ tone: 'success', title: id ? 'Изменения сохранены' : 'Объект создан' })
      reset(v)
      nav(`/app/projects/${saved.id}`)
    } catch (e) {
      setSubmitError(e instanceof ApiError ? e.message : 'Не удалось сохранить объект')
    }
  })

  if (loading) return <p className="text-sm text-muted">Загрузка…</p>
  if (loadError) return <Alert tone="error" title="Объект недоступен">{loadError}</Alert>

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-3xl">
      <p className="mb-5 text-sm text-muted">Титульные данные и сведения об объекте. Поля со звёздочкой обязательны.</p>
      {submitError && <div className="mb-4"><Alert tone="error" title="Ошибка сохранения">{submitError}</Alert></div>}

      <div className="grid gap-4 rounded-lg border border-border bg-surface p-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormField label="Наименование объекта" required error={errors.name?.message}>
            {(p) => <Input {...p} invalid={p.invalid} {...register('name')} />}
          </FormField>
        </div>
        <div className="sm:col-span-2">
          <FormField label="Адрес" required error={errors.address?.message}>
            {(p) => <Input {...p} invalid={p.invalid} {...register('address')} />}
          </FormField>
        </div>
        <FormField label="Кадастровый номер" required hint="Формат 77:01:0004012:1234" error={errors.cadastralNumber?.message}>
          {(p) => <Input {...p} invalid={p.invalid} className="font-mono" {...register('cadastralNumber')} />}
        </FormField>
        <FormField label="Вид строительства" required error={errors.constructionType?.message}>
          {(p) => (
            <Select {...p} invalid={p.invalid} {...register('constructionType')}>
              {Object.entries(constructionTypeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          )}
        </FormField>
        <FormField label="Застройщик" required error={errors.developer?.message}>
          {(p) => <Input {...p} invalid={p.invalid} {...register('developer')} />}
        </FormField>
        <FormField label="Технический заказчик">
          {(p) => <Input {...p} {...register('customer')} />}
        </FormField>
        <FormField label="Проектировщик">
          {(p) => <Input {...p} {...register('designer')} />}
        </FormField>
        <FormField label="Функциональное назначение">
          {(p) => <Input {...p} {...register('functionalPurpose')} />}
        </FormField>
        <FormField label="Источник финансирования">
          {(p) => <Input {...p} {...register('financingSource')} />}
        </FormField>
      </div>

      <div className="mt-5 flex gap-2">
        <Button type="submit" loading={isSubmitting}>{id ? 'Сохранить' : 'Создать объект'}</Button>
        <Button type="button" variant="secondary" onClick={() => nav(id ? `/app/projects/${id}` : '/app/projects')}>Отмена</Button>
      </div>
    </form>
  )
}
