import React, { useEffect, useState } from 'react'

import { api, ApiError } from '../../shared/api'
import type { Prefs, Profile } from '../../shared/types'
import { Alert, Button, FormField, Input, cn } from '../../shared/components/ui'
import { useToast } from '../../shared/components/Toast'
import { fmtDateTime, roleLabel } from '../../shared/app/labels'

const PREFS: { key: keyof Prefs; title: string; hint: string }[] = [
  { key: 'validation', title: 'Результаты проверки', hint: 'Когда коллега проверяет ваш документ' },
  { key: 'versions', title: 'Версии и архив', hint: 'Когда коллега сохраняет версию или архивирует документ' },
  { key: 'invitations', title: 'Приглашения', hint: 'Когда приглашённый вами сотрудник принимает приглашение' },
  { key: 'email', title: 'Письма на почту', hint: 'Дублировать уведомления письмом' },
]
const PASSWORD_HINT = 'Не короче 10 символов, с заглавной буквой и цифрой'
const strong = (v: string) => v.length >= 10 && /[A-ZА-ЯЁ]/.test(v) && /\d/.test(v)

export function Toggle({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={cn('inline-flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50', on ? 'justify-end bg-primary' : 'justify-start bg-border-strong')}>
      <span className="size-4 rounded-full bg-surface" />
    </button>
  )
}

export default function ProfilePage() {
  const toast = useToast()
  const [p, setP] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ fullName: '', position: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState(false)
  const [pw, setPw] = useState({ current: '', next: '', repeat: '' })
  const [pwBusy, setPwBusy] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwTouched, setPwTouched] = useState(false)

  useEffect(() => {
    api.profile.get().then((r) => { setP(r); setForm({ fullName: r.fullName, position: r.position, phone: r.phone }) }).catch((e) => setError(e.message))
  }, [])

  if (error) return <Alert tone="error" title="Профиль недоступен">{error}</Alert>
  if (!p) return <p className="text-sm text-muted">Загрузка…</p>

  const nameErr = touched && form.fullName.trim().length < 3 ? 'Укажите ФИО (не короче 3 символов)' : undefined
  const dirty = form.fullName !== p.fullName || form.position !== p.position || form.phone !== p.phone

  const save = async () => {
    setTouched(true)
    if (form.fullName.trim().length < 3) return
    setSaving(true)
    try {
      setP(await api.profile.update({ fullName: form.fullName, position: form.position, phone: form.phone }))
      toast({ tone: 'success', title: 'Данные сохранены' })
    } catch (e) { toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Не удалось сохранить' }) } finally { setSaving(false) }
  }

  const setPref = async (key: keyof Prefs, v: boolean) => {
    const before = p.prefs
    setP({ ...p, prefs: { ...before, [key]: v } }) // optimistic, rolled back on failure
    try { setP(await api.profile.update({ prefs: { ...before, [key]: v } })) } catch (e) {
      setP((cur) => (cur ? { ...cur, prefs: before } : cur))
      toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Не удалось сохранить настройку' })
    }
  }

  const pwProblem = !pw.current ? 'Введите текущий пароль' : !strong(pw.next) ? PASSWORD_HINT : pw.next !== pw.repeat ? 'Пароли не совпадают' : null
  const changePw = async () => {
    setPwTouched(true)
    setPwError(null)
    if (pwProblem) return
    setPwBusy(true)
    try {
      await api.profile.changePassword(pw.current, pw.next)
      setPw({ current: '', next: '', repeat: '' })
      setPwTouched(false)
      toast({ tone: 'success', title: 'Пароль изменён' })
    } catch (e) { setPwError(e instanceof ApiError ? e.message : 'Не удалось изменить пароль') } finally { setPwBusy(false) }
  }

  return (
    <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
      <section className="rounded-lg border border-border bg-surface p-5">
        <h3 className="mb-3 text-sm font-semibold">Личные данные</h3>
        <div className="grid gap-3">
          <FormField label="ФИО" required error={nameErr}>{(f) => <Input {...f} invalid={f.invalid} value={form.fullName} maxLength={255} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />}</FormField>
          <FormField label="Должность">{(f) => <Input {...f} value={form.position} maxLength={255} onChange={(e) => setForm({ ...form, position: e.target.value })} />}</FormField>
          <FormField label="Телефон">{(f) => <Input {...f} type="tel" value={form.phone} maxLength={50} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}</FormField>
        </div>
        <div className="mt-4 flex justify-end"><Button loading={saving} disabled={!dirty} onClick={save}>Сохранить</Button></div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <h3 className="mb-3 text-sm font-semibold">Учётная запись</h3>
        <dl className="divide-y divide-border text-sm">
          {[['Почта', p.email], ['Организация', p.organizationName], ['Роль', roleLabel[p.role]], ['Зарегистрирован', fmtDateTime(p.createdAt)], ['Последний вход', p.lastLoginAt ? fmtDateTime(p.lastLoginAt) : '—']].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-muted">{k}</dt><dd className="text-right">{v}</dd></div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">Почту и роль меняет администратор организации.</p>
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <h3 className="mb-3 text-sm font-semibold">Смена пароля</h3>
        {pwError && <div className="mb-3"><Alert tone="error" title="Пароль не изменён">{pwError}</Alert></div>}
        <div className="grid gap-3">
          <FormField label="Текущий пароль" required error={pwTouched && !pw.current ? 'Введите текущий пароль' : undefined}>{(f) => <Input {...f} invalid={f.invalid} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />}</FormField>
          <FormField label="Новый пароль" required hint={PASSWORD_HINT} error={pwTouched && pw.current && !strong(pw.next) ? PASSWORD_HINT : undefined}>{(f) => <Input {...f} invalid={f.invalid} type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />}</FormField>
          <FormField label="Повторите пароль" required error={pwTouched && strong(pw.next) && pw.next !== pw.repeat ? 'Пароли не совпадают' : undefined}>{(f) => <Input {...f} invalid={f.invalid} type="password" autoComplete="new-password" value={pw.repeat} onChange={(e) => setPw({ ...pw, repeat: e.target.value })} />}</FormField>
        </div>
        <div className="mt-4 flex justify-end"><Button variant="secondary" loading={pwBusy} onClick={changePw}>Изменить пароль</Button></div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <h3 className="mb-1 text-sm font-semibold">Уведомления</h3>
        <ul className="divide-y divide-border">
          {PREFS.map(({ key, title, hint }) => (
            <li key={key} className="flex items-center justify-between gap-4 py-3 text-sm">
              <span><span className="block">{title}</span><span className="block text-xs text-muted">{hint}</span></span>
              <Toggle on={p.prefs[key]} label={title} onChange={(v) => setPref(key, v)} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
