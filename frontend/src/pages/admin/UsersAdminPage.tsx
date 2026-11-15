import React, { useCallback, useEffect, useState } from 'react'
import { Search, UserPlus } from 'lucide-react'

import { api, ApiError } from '../../shared/api'
import type { InvitationInfo, OrgAdmin, Page, Role, UserAdmin } from '../../shared/types'
import { Alert, Button, FormField, Input, Select, cn } from '../../shared/components/ui'
import { ConfirmDialog } from '../../shared/components/ConfirmDialog'
import { StatusBadge } from '../../shared/components/StatusBadge'
import { useToast } from '../../shared/components/Toast'
import { fmtDate, fmtDateTime, roleLabel } from '../../shared/app/labels'
import { useDebounced } from '../../shared/app/useDebounced'
import { useAuth } from '../../shared/app/AuthContext'

const PAGE_SIZE = 15
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

type Pending = { kind: 'block' | 'reset'; user: UserAdmin }

export default function UsersAdminPage({ role }: { role: Role }) {
  const toast = useToast()
  const { session } = useAuth()
  const superAdmin = role === 'super_admin'
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [fRole, setFRole] = useState<Role | ''>('')
  const [fStatus, setFStatus] = useState<'active' | 'blocked' | ''>('')
  const [fOrg, setFOrg] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Page<UserAdmin> | null>(null)
  const [invites, setInvites] = useState<InvitationInfo[]>([])
  const [orgs, setOrgs] = useState<OrgAdmin[]>([])
  const [error, setError] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (superAdmin) api.orgs.list().then(setOrgs).catch(() => {}) }, [superAdmin])
  useEffect(() => setPage(1), [dq])

  const load = useCallback(() => {
    setError(null)
    api.users.list({ q: dq, role: fRole, status: fStatus, organizationId: fOrg, page, pageSize: PAGE_SIZE }).then(setData).catch((e) => setError(e instanceof ApiError ? e.message : 'Не удалось загрузить пользователей'))
    api.users.invitations(fOrg || undefined).then(setInvites).catch(() => {})
  }, [dq, fRole, fStatus, fOrg, page])
  useEffect(load, [load])

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); toast({ tone: 'success', title: ok }); setPending(null); load() } catch (e) { toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Операция не выполнена' }); setPending(null) } finally { setBusy(false) }
  }
  const roles: Role[] = superAdmin ? ['org_admin', 'designer', 'expert'] : ['org_admin', 'designer', 'expert']
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const filtered = !!(dq || fRole || fStatus || fOrg)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{data ? `Пользователей: ${data.total}` : 'Загрузка…'}</p>
        <Button onClick={() => setInviteOpen((v) => !v)}><UserPlus className="size-4" aria-hidden />Пригласить</Button>
      </div>

      {inviteOpen && <InviteForm superAdmin={superAdmin} orgs={orgs} onDone={() => { setInviteOpen(false); load() }} onCancel={() => setInviteOpen(false)} />}

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-subtle" aria-hidden />
          <Input aria-label="Поиск" className="pl-9" placeholder="Имя или почта" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select aria-label="Роль" className="w-52" value={fRole} onChange={(e) => { setFRole(e.target.value as Role | ''); setPage(1) }}>
          <option value="">Любая роль</option>{(['super_admin', ...roles] as Role[]).map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
        </Select>
        <Select aria-label="Статус" className="w-44" value={fStatus} onChange={(e) => { setFStatus(e.target.value as typeof fStatus); setPage(1) }}>
          <option value="">Любой статус</option><option value="active">Активные</option><option value="blocked">Заблокированные</option>
        </Select>
        {superAdmin && (
          <Select aria-label="Организация" className="w-56" value={fOrg} onChange={(e) => { setFOrg(e.target.value); setPage(1) }}>
            <option value="">Все организации</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        )}
      </div>

      {error && <Alert tone="error" title="Ошибка загрузки">{error} <button className="underline" onClick={load}>Повторить</button></Alert>}
      {!error && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted"><tr>{['Пользователь', ...(superAdmin ? ['Организация'] : []), 'Роль', 'Статус', 'Последний вход', 'Действия'].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {!data && <tr><td colSpan={6} className="px-4 py-6"><div className="h-4 animate-pulse rounded bg-surface-2" /></td></tr>}
              {data?.items.map((u) => {
                const me = u.id === session?.user.id
                const locked = me || (u.role === 'super_admin' && !superAdmin)
                return (
                  <tr key={u.id} className={cn('border-t border-border', u.status === 'blocked' && 'opacity-70')}>
                    <td className="px-4 py-3"><div className="font-medium">{u.fullName}{me && <span className="ml-2 text-xs font-normal text-muted">это вы</span>}</div><div className="text-xs text-muted">{u.email}</div></td>
                    {superAdmin && <td className="px-4 py-3">{u.organizationName}</td>}
                    <td className="px-4 py-3">
                      {locked || u.role === 'super_admin' ? <span>{roleLabel[u.role]}</span> : (
                        <Select aria-label={`Роль: ${u.fullName}`} className="w-52" value={u.role} disabled={busy}
                          onChange={(e) => act(() => api.users.update(u.id, { role: e.target.value as Role }), 'Роль изменена')}>
                          {roles.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
                        </Select>
                      )}
                    </td>
                    <td className="px-4 py-3"><StatusBadge tone={u.status === 'active' ? 'success' : 'danger'}>{u.status === 'active' ? 'Активен' : 'Заблокирован'}</StatusBadge></td>
                    <td className="px-4 py-3 text-muted">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'не входил'}</td>
                    <td className="px-4 py-3">
                      {locked ? <span className="text-xs text-subtle">—</span> : (
                        <span className="flex flex-wrap gap-x-3 gap-y-1 text-primary">
                          {u.status === 'active'
                            ? <button className="text-danger hover:underline" onClick={() => setPending({ kind: 'block', user: u })}>Заблокировать</button>
                            : <button className="hover:underline" disabled={busy} onClick={() => act(() => api.users.update(u.id, { status: 'active' }), 'Пользователь разблокирован')}>Разблокировать</button>}
                          <button className="hover:underline" onClick={() => setPending({ kind: 'reset', user: u })}>Сбросить пароль</button>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {data && data.items.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center"><p className="font-medium">{filtered ? 'Ничего не найдено' : 'Пользователей нет'}</p></td></tr>}
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

      <section className="mt-6" aria-label="Приглашения">
        <h3 className="mb-2 text-sm font-semibold">Ожидают принятия · {invites.length}</h3>
        {invites.length === 0 ? <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted">Активных приглашений нет</p> : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span><span className="font-medium">{i.email}</span> <span className="text-muted">· {roleLabel[i.role]}{superAdmin && ` · ${i.organizationName}`}</span>
                  <span className="block text-xs text-muted">Пригласил(а): {i.invitedByName} · действует до {fmtDate(i.expiresAt)}</span></span>
                <span className="flex gap-3 text-primary">
                  <button className="hover:underline" disabled={busy} onClick={() => act(() => api.users.resendInvitation(i.id), 'Приглашение отправлено повторно')}>Отправить снова</button>
                  <button className="text-danger hover:underline" disabled={busy} onClick={() => act(() => api.users.revokeInvitation(i.id), 'Приглашение отозвано')}>Отозвать</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog open={!!pending} busy={busy} title={pending?.kind === 'block' ? 'Заблокировать пользователя?' : 'Сбросить пароль?'} confirmLabel={pending?.kind === 'block' ? 'Заблокировать' : 'Отправить ссылку'}
        onCancel={() => setPending(null)}
        onConfirm={() => pending && act(() => pending.kind === 'block' ? api.users.update(pending.user.id, { status: 'blocked' }) : api.users.resetPassword(pending.user.id), pending.kind === 'block' ? 'Пользователь заблокирован' : 'Ссылка для смены пароля отправлена')}>
        {pending?.kind === 'block'
          ? <>{pending.user.fullName} сразу потеряет доступ: действующие сессии перестанут работать. Разблокировать можно в любой момент.</>
          : <>На {pending?.user.email} будет отправлена ссылка для установки нового пароля. Текущий пароль продолжит действовать, пока он не сменит его.</>}
      </ConfirmDialog>
    </div>
  )
}

function InviteForm({ superAdmin, orgs, onDone, onCancel }: { superAdmin: boolean; orgs: OrgAdmin[]; onDone: () => void; onCancel: () => void }) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('designer')
  const [orgId, setOrgId] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const emailErr = touched && !EMAIL.test(email.trim()) ? 'Укажите корректный email' : undefined
  const orgErr = touched && superAdmin && !orgId ? 'Выберите организацию' : undefined

  const send = async () => {
    setTouched(true)
    setError(null)
    if (!EMAIL.test(email.trim()) || (superAdmin && !orgId)) return
    setBusy(true)
    try {
      await api.users.invite({ email: email.trim(), role, organizationId: superAdmin ? orgId : undefined })
      toast({ tone: 'success', title: 'Приглашение отправлено', body: email.trim() })
      onDone()
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Не удалось отправить приглашение'); setBusy(false) }
  }

  return (
    <div className="mb-4 rounded-lg border border-border bg-surface p-4">
      {error && <div className="mb-3"><Alert tone="error" title="Приглашение не отправлено">{error}</Alert></div>}
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Почта" required error={emailErr}>{(f) => <Input {...f} invalid={f.invalid} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.ru" />}</FormField>
        <FormField label="Роль" required>
          {(f) => <Select {...f} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="designer">{roleLabel.designer}</option><option value="expert">{roleLabel.expert}</option>{superAdmin && <option value="org_admin">{roleLabel.org_admin}</option>}
          </Select>}
        </FormField>
        {superAdmin && (
          <FormField label="Организация" required error={orgErr}>
            {(f) => <Select {...f} invalid={f.invalid} value={orgId} onChange={(e) => setOrgId(e.target.value)}><option value="">Выберите</option>{orgs.filter((o) => o.isActive).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>}
          </FormField>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">Человек получит письмо со ссылкой (действует 7 дней) и сам задаст имя и пароль.</p>
      <div className="mt-3 flex gap-2"><Button loading={busy} onClick={send}>Отправить приглашение</Button><Button variant="secondary" onClick={onCancel}>Отмена</Button></div>
    </div>
  )
}
