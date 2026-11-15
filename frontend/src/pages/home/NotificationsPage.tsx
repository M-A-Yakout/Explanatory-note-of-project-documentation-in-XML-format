import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'

import { api, ApiError } from '../../shared/api'
import type { Notice, Page, Role } from '../../shared/types'
import { Alert, Button, Select, cn } from '../../shared/components/ui'
import { useToast } from '../../shared/components/Toast'
import { fmtDateTime, noticeKindLabel, noticeLink } from '../../shared/app/labels'

const PAGE_SIZE = 15

export default function NotificationsPage({ role }: { role: Role }) {
  const nav = useNavigate()
  const toast = useToast()
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [kind, setKind] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<(Page<Notice> & { unread: number }) | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    api.notices.list({ unreadOnly, kind, page, pageSize: PAGE_SIZE }).then(setData).catch((e) => setError(e instanceof ApiError ? e.message : 'Не удалось загрузить уведомления'))
  }, [unreadOnly, kind, page])
  useEffect(load, [load])

  const open = async (n: Notice) => {
    if (!n.read) await api.notices.markRead(n.id).catch(() => {})
    window.dispatchEvent(new Event('pz:notices-changed'))
    const link = noticeLink(role, n.link)
    if (link) nav(link)
    else load()
  }
  const readAll = async () => {
    try { await api.notices.readAll(); window.dispatchEvent(new Event('pz:notices-changed')); load() } catch (e) { toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Не удалось отметить' }) }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{data ? `Непрочитанных: ${data.unread}` : 'Загрузка…'}</p>
        <Button variant="secondary" disabled={!data?.unread} onClick={readAll}>Отметить все прочитанными</Button>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Фильтр" className="flex overflow-hidden rounded-md border border-border-strong text-sm">
          {([[false, 'Все'], [true, 'Непрочитанные']] as const).map(([v, l]) => (
            <button key={l} aria-pressed={unreadOnly === v} onClick={() => { setUnreadOnly(v); setPage(1) }} className={cn('px-3 py-2', unreadOnly === v ? 'bg-primary-soft font-medium' : 'bg-surface text-muted')}>{l}</button>
          ))}
        </div>
        <Select aria-label="Тип" className="w-44" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1) }}>
          <option value="">Все типы</option>
          {Object.entries(noticeKindLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>

      {error && <Alert tone="error" title="Ошибка загрузки">{error} <button className="underline" onClick={load}>Повторить</button></Alert>}
      {!error && !data && <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-2" />)}</div>}
      {data && data.items.length === 0 && (
        <div className="rounded-lg border border-dashed border-border-strong px-6 py-12 text-center">
          <Bell className="mx-auto mb-2 text-muted" aria-hidden />
          <p className="font-medium">{unreadOnly || kind ? 'Ничего не найдено' : 'Уведомлений пока нет'}</p>
          <p className="mt-1 text-sm text-muted">Здесь появятся результаты проверок, новые версии и приглашения.</p>
        </div>
      )}
      {data && data.items.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {data.items.map((n) => (
            <li key={n.id}>
              <button onClick={() => open(n)} className={cn('flex w-full gap-3 px-4 py-3 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none', !n.read && 'bg-primary-soft')}>
                <span className={cn('mt-2 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-primary')} aria-label={n.read ? undefined : 'не прочитано'} />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm', !n.read && 'font-medium')}>{n.title}</span>
                  {n.body && <span className="mt-0.5 block text-sm text-muted">{n.body}</span>}
                  <span className="mt-1 block text-xs text-subtle">{noticeKindLabel[n.kind] ?? n.kind} · {fmtDateTime(n.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {data && data.total > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between text-sm text-muted">
          <span>Страница {page} из {pages}</span>
          <span className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Назад</Button>
            <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Далее</Button>
          </span>
        </div>
      )}
    </div>
  )
}
