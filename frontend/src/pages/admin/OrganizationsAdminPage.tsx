import React, { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'

import { api, ApiError } from '../../shared/api'
import type { OrgAdmin } from '../../shared/types'
import type { OrgInput } from '../../shared/api/admin'
import { Alert, Button, FormField, Input, cn } from '../../shared/components/ui'
import { ConfirmDialog } from '../../shared/components/ConfirmDialog'
import { StatusBadge } from '../../shared/components/StatusBadge'
import { useToast } from '../../shared/components/Toast'
import { fmtDate } from '../../shared/app/labels'

const empty: OrgInput = { name: '', inn: '', ogrn: '', address: '', maxUsers: 50, maxProjects: 200 }

function validate(v: OrgInput): Partial<Record<keyof OrgInput, string>> {
  const e: Partial<Record<keyof OrgInput, string>> = {}
  if (v.name.trim().length < 2) e.name = 'Укажите название'
  if (!/^\d{10}$/.test(v.inn)) e.inn = 'ИНН — 10 цифр'
  if (v.ogrn && !/^(\d{13}|\d{15})$/.test(v.ogrn)) e.ogrn = 'ОГРН — 13 или 15 цифр'
  if (!Number.isInteger(v.maxUsers) || v.maxUsers < 1) e.maxUsers = 'Целое число от 1'
  if (!Number.isInteger(v.maxProjects) || v.maxProjects < 1) e.maxProjects = 'Целое число от 1'
  return e
}

export default function OrganizationsAdminPage() {
  const toast = useToast()
  const [items, setItems] = useState<OrgAdmin[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<OrgAdmin | 'new' | null>(null)
  const [toggle, setToggle] = useState<OrgAdmin | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => { api.orgs.list().then(setItems).catch((e) => setError(e instanceof ApiError ? e.message : 'Не удалось загрузить')) }, [])
  useEffect(load, [load])

  const setActive = async (o: OrgAdmin) => {
    setBusy(true)
    try { await api.orgs.update(o.id, { isActive: !o.isActive }); toast({ tone: 'success', title: o.isActive ? 'Организация отключена' : 'Организация включена' }); setToggle(null); load() }
    catch (e) { toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Операция не выполнена' }) } finally { setBusy(false) }
  }

  if (error) return <Alert tone="error" title="Ошибка загрузки">{error}</Alert>
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{items ? `Организаций: ${items.length}` : 'Загрузка…'}</p>
        <Button onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden />Создать организацию</Button>
      </div>
      {editing && <OrgForm key={editing === 'new' ? 'new' : editing.id} org={editing === 'new' ? null : editing} onDone={() => { setEditing(null); load() }} onCancel={() => setEditing(null)} />}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted"><tr>{['Организация', 'Пользователи', 'Объекты', 'Документы', 'Статус', 'Создана', 'Действия'].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {!items && <tr><td colSpan={7} className="px-4 py-6"><div className="h-4 animate-pulse rounded bg-surface-2" /></td></tr>}
            {items?.map((o) => (
              <tr key={o.id} className={cn('border-t border-border', !o.isActive && 'opacity-70')}>
                <td className="px-4 py-3"><div className="font-medium">{o.name}</div><div className="font-mono text-xs text-muted">ИНН {o.inn}</div></td>
                <td className="px-4 py-3"><span className={cn(o.usersCount >= o.maxUsers && 'font-medium text-warning')}>{o.usersCount} / {o.maxUsers}</span></td>
                <td className="px-4 py-3"><span className={cn(o.projectsCount >= o.maxProjects && 'font-medium text-warning')}>{o.projectsCount} / {o.maxProjects}</span></td>
                <td className="px-4 py-3">{o.documentsCount}</td>
                <td className="px-4 py-3"><StatusBadge tone={o.isActive ? 'success' : 'neutral'}>{o.isActive ? 'Активна' : 'Отключена'}</StatusBadge></td>
                <td className="px-4 py-3 text-muted">{fmtDate(o.createdAt)}</td>
                <td className="px-4 py-3"><span className="flex gap-3">
                  <button className="text-primary hover:underline" onClick={() => setEditing(o)}>Изменить</button>
                  {o.isActive ? <button className="text-danger hover:underline" onClick={() => setToggle(o)}>Отключить</button> : <button className="text-primary hover:underline" disabled={busy} onClick={() => setActive(o)}>Включить</button>}
                </span></td>
              </tr>
            ))}
            {items?.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center font-medium">Организаций пока нет</td></tr>}
          </tbody>
        </table>
      </div>

      <ConfirmDialog open={!!toggle} busy={busy} title="Отключить организацию?" confirmLabel="Отключить" onCancel={() => setToggle(null)} onConfirm={() => toggle && setActive(toggle)}>
        {toggle && <>Все пользователи «{toggle.name}» ({toggle.usersCount}) сразу потеряют доступ, действующие сессии перестанут работать. Данные сохранятся, организацию можно включить обратно.</>}
      </ConfirmDialog>
    </div>
  )
}

function OrgForm({ org, onDone, onCancel }: { org: OrgAdmin | null; onDone: () => void; onCancel: () => void }) {
  const toast = useToast()
  const [v, setV] = useState<OrgInput>(org ? { name: org.name, inn: org.inn, ogrn: org.ogrn, address: org.address, maxUsers: org.maxUsers, maxProjects: org.maxProjects } : empty)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errs = touched ? validate(v) : {}
  const num = (k: 'maxUsers' | 'maxProjects') => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value === '' ? NaN : Number(e.target.value) })

  const save = async () => {
    setTouched(true)
    setError(null)
    if (Object.keys(validate(v)).length) return
    setBusy(true)
    try {
      if (org) await api.orgs.update(org.id, v)
      else await api.orgs.create(v)
      toast({ tone: 'success', title: org ? 'Организация обновлена' : 'Организация создана' })
      onDone()
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Не удалось сохранить'); setBusy(false) }
  }

  return (
    <div className="mb-4 rounded-lg border border-border bg-surface p-4">
      <h3 className="mb-3 text-sm font-semibold">{org ? `Организация: ${org.name}` : 'Новая организация'}</h3>
      {error && <div className="mb-3"><Alert tone="error" title="Не сохранено">{error}</Alert></div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Название" required error={errs.name}>{(f) => <Input {...f} invalid={f.invalid} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={255} />}</FormField>
        <FormField label="ИНН" required error={errs.inn}>{(f) => <Input {...f} invalid={f.invalid} className="font-mono" inputMode="numeric" value={v.inn} onChange={(e) => setV({ ...v, inn: e.target.value.replace(/\D/g, '') })} maxLength={10} />}</FormField>
        <FormField label="ОГРН" error={errs.ogrn}>{(f) => <Input {...f} invalid={f.invalid} className="font-mono" inputMode="numeric" value={v.ogrn} onChange={(e) => setV({ ...v, ogrn: e.target.value.replace(/\D/g, '') })} maxLength={15} />}</FormField>
        <FormField label="Адрес">{(f) => <Input {...f} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} maxLength={500} />}</FormField>
        <FormField label="Лимит пользователей" required error={errs.maxUsers}>{(f) => <Input {...f} invalid={f.invalid} type="number" min={1} value={Number.isNaN(v.maxUsers) ? '' : v.maxUsers} onChange={num('maxUsers')} />}</FormField>
        <FormField label="Лимит объектов" required error={errs.maxProjects}>{(f) => <Input {...f} invalid={f.invalid} type="number" min={1} value={Number.isNaN(v.maxProjects) ? '' : v.maxProjects} onChange={num('maxProjects')} />}</FormField>
      </div>
      {org && <p className="mt-2 text-xs text-muted">Сейчас используется: пользователей — {org.usersCount}, объектов — {org.projectsCount}. Лимит не может быть меньше.</p>}
      <div className="mt-3 flex gap-2"><Button loading={busy} onClick={save}>{org ? 'Сохранить' : 'Создать'}</Button><Button variant="secondary" onClick={onCancel}>Отмена</Button></div>
    </div>
  )
}
