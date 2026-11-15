import React, { useEffect, useState } from 'react'

import { api, ApiError } from '../../shared/api'
import type { EmailTemplate, SystemSettings } from '../../shared/types'
import { Alert, Button, FormField, Input } from '../../shared/components/ui'
import { useToast } from '../../shared/components/Toast'
import { Toggle } from '../home/ProfilePage'

const TEMPLATES: { key: keyof SystemSettings['emailTemplates']; title: string; vars: string }[] = [
  { key: 'confirm', title: 'Подтверждение почты', vars: '{link}' },
  { key: 'invite', title: 'Приглашение', vars: '{link} {org} {role}' },
  { key: 'reset', title: 'Сброс пароля', vars: '{link} {minutes}' },
]

function problems(s: SystemSettings): string[] {
  const out: string[] = []
  if (!Number.isInteger(s.maxXmlMb) || s.maxXmlMb < 1 || s.maxXmlMb > 50) out.push('Максимальный размер XML — целое число от 1 до 50 МБ')
  for (const { key, title } of TEMPLATES) {
    const t = s.emailTemplates[key]
    if (t.subject.trim().length < 3) out.push(`«${title}»: тема не короче 3 символов`)
    if (t.body.trim().length < 10) out.push(`«${title}»: текст письма не короче 10 символов`)
  }
  return out
}

export default function SettingsPage() {
  const toast = useToast()
  const [saved, setSaved] = useState<SystemSettings | null>(null)
  const [s, setS] = useState<SystemSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => { api.settings.get().then((r) => { setSaved(r); setS(r) }).catch((e) => setError(e instanceof ApiError ? e.message : 'Не удалось загрузить настройки')) }, [])

  if (error) return <Alert tone="error" title="Настройки недоступны">{error}</Alert>
  if (!s || !saved) return <p className="text-sm text-muted">Загрузка…</p>

  const dirty = JSON.stringify(s) !== JSON.stringify(saved)
  const issues = touched ? problems(s) : []
  const setT = (k: keyof SystemSettings['emailTemplates'], p: Partial<EmailTemplate>) => setS({ ...s, emailTemplates: { ...s.emailTemplates, [k]: { ...s.emailTemplates[k], ...p } } })

  const save = async () => {
    setTouched(true)
    setSaveError(null)
    if (problems(s).length) return
    setSaving(true)
    try {
      const r = await api.settings.put(s)
      setSaved(r); setS(r); setTouched(false)
      toast({ tone: 'success', title: 'Настройки сохранены' })
    } catch (e) { setSaveError(e instanceof ApiError ? e.message : 'Не удалось сохранить') } finally { setSaving(false) }
  }

  const row = (title: string, hint: string, key: 'blockExportOnWarnings' | 'warnOutdatedReferences' | 'requireEmailConfirmation') => (
    <li className="flex items-center justify-between gap-4 py-3 text-sm">
      <span><span className="block">{title}</span><span className="block text-xs text-muted">{hint}</span></span>
      <Toggle on={s[key]} label={title} onChange={(v) => setS({ ...s, [key]: v })} />
    </li>
  )

  return (
    <div className="max-w-3xl">
      {saveError && <div className="mb-4"><Alert tone="error" title="Не сохранено">{saveError}</Alert></div>}
      {issues.length > 0 && <div className="mb-4"><Alert tone="error" title="Проверьте поля"><ul className="list-disc pl-4">{issues.map((i) => <li key={i}>{i}</li>)}</ul></Alert></div>}

      <section className="mb-4 rounded-lg border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold">Проверка документов</h3>
        <ul className="divide-y divide-border">
          {row('Запрещать выгрузку при предупреждениях', 'Включено: документ с предупреждениями не получит статус «Проверен» и не будет выгружен. По умолчанию блокируют только ошибки.', 'blockExportOnWarnings')}
          {row('Предупреждать об устаревших нормативных ссылках', 'Правило BR-031: например, СП 54.13330.2016 → СП 54.13330.2022.', 'warnOutdatedReferences')}
        </ul>
        <p className="mt-2 text-xs text-muted">Изменения действуют при следующей проверке документа.</p>
      </section>

      <section className="mb-4 rounded-lg border border-border bg-surface p-5">
        <h3 className="mb-3 text-sm font-semibold">Файлы и регистрация</h3>
        <div className="max-w-xs">
          <FormField label="Максимальный размер импортируемого XML, МБ" hint="От 1 до 50">
            {(f) => <Input {...f} invalid={touched && (s.maxXmlMb < 1 || s.maxXmlMb > 50 || !Number.isInteger(s.maxXmlMb))} type="number" min={1} max={50} value={Number.isNaN(s.maxXmlMb) ? '' : s.maxXmlMb} onChange={(e) => setS({ ...s, maxXmlMb: e.target.value === '' ? NaN : Number(e.target.value) })} />}
          </FormField>
        </div>
        <ul className="mt-2 divide-y divide-border">{row('Требовать подтверждение почты при регистрации', 'Пока не открыта ссылка из письма, вход невозможен.', 'requireEmailConfirmation')}</ul>
      </section>

      <section className="mb-4 rounded-lg border border-border bg-surface p-5">
        <h3 className="mb-1 text-sm font-semibold">Шаблоны писем</h3>
        <p className="mb-4 text-xs text-muted">Подстановки в фигурных скобках заменяются автоматически; неизвестные остаются как есть.</p>
        <div className="space-y-5">
          {TEMPLATES.map(({ key, title, vars }) => (
            <div key={key} className="rounded-md border border-border p-4">
              <div className="mb-2 flex items-baseline justify-between gap-2"><h4 className="text-sm font-medium">{title}</h4><span className="font-mono text-xs text-muted">{vars}</span></div>
              <div className="grid gap-3">
                <FormField label="Тема">{(f) => <Input {...f} invalid={touched && s.emailTemplates[key].subject.trim().length < 3} value={s.emailTemplates[key].subject} maxLength={200} onChange={(e) => setT(key, { subject: e.target.value })} />}</FormField>
                <FormField label="Текст">{(f) => <textarea {...f} rows={4} maxLength={5000} value={s.emailTemplates[key].body} onChange={(e) => setT(key, { body: e.target.value })} className="w-full rounded-md border border-border-strong bg-surface p-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25" />}</FormField>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="sticky bottom-0 -mx-1 flex items-center gap-3 border-t border-border bg-bg px-1 py-3">
        <Button loading={saving} disabled={!dirty} onClick={save}>Сохранить настройки</Button>
        <Button variant="secondary" disabled={!dirty || saving} onClick={() => { setS(saved); setTouched(false); setSaveError(null) }}>Отменить изменения</Button>
        {dirty && <span className="text-xs text-warning">Есть несохранённые изменения</span>}
      </div>
    </div>
  )
}
