import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Archive,
  Bell,
  Building2,
  Check,
  ChevronsUpDown,
  FileCode2,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  ScrollText,
  Sun,
  User as UserIcon,
  Users,
  X,
  Gauge,
} from 'lucide-react'
import { navFor, type RouteDef } from '../app/routes'
import { documents, notifications, organizations, projects, users } from '../mock/data'
import { t } from '../i18n'
import type { Role } from '../types'
import { Logo } from './Logo'
import { cn } from './ui'

export type ShellPanel = 'none' | 'search' | 'notifications' | 'user' | 'org'

type Props = {
  role: Role
  activeKey: string
  title: string
  actions?: React.ReactNode
  initialPanel?: ShellPanel
  theme?: 'light' | 'dark'
  onNavigate?: (key: string) => void
  onLogout?: () => void
  onToggleTheme?: () => void
  children: React.ReactNode
}

const ease = [0.23, 1, 0.32, 1] as const
const pop = {
  initial: { opacity: 0, y: -4, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -4, scale: 0.96 },
  transition: { duration: 0.16, ease },
}

/**
 * Authenticated layout: role-aware sidebar, top bar with global search,
 * notifications, organization switcher and user menu.
 */
export function AppShell({
  role,
  activeKey,
  title,
  actions,
  initialPanel = 'none',
  theme = 'light',
  onNavigate,
  onLogout,
  onToggleTheme,
  children,
}: Props) {
  const [panel, setPanel] = useState<ShellPanel>(initialPanel)
  const [drawer, setDrawer] = useState(false)
  const [orgId, setOrgId] = useState('org-1')
  const user = users.find((u) => u.role === role) ?? users[0]
  const org = organizations.find((o) => o.id === orgId)!
  const myOrgs = role === 'super_admin' ? organizations : organizations.filter((o) => user.organizationIds.includes(o.id))
  const unread = notifications.filter((n) => !n.read).length
  const toggle = (p: ShellPanel) => setPanel((cur) => (cur === p ? 'none' : p))

  useEffect(() => setPanel(initialPanel), [initialPanel])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPanel('search')
      }
      if (e.key === 'Escape') setPanel('none')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const nav = navFor(role)
  const work = nav.filter((r) => r.group !== 'admin')
  const admin = nav.filter((r) => r.group === 'admin')

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between px-4">
        <Logo />
        <button
          type="button"
          className="grid size-8 place-items-center rounded text-muted hover:bg-surface-2 lg:hidden"
          onClick={() => setDrawer(false)}
          aria-label="Закрыть меню"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Organization switcher */}
      <div className="relative px-3 pb-3">
        <button
          type="button"
          onClick={() => toggle('org')}
          aria-expanded={panel === 'org'}
          aria-haspopup="listbox"
          className="flex w-full items-center gap-2.5 rounded-md border border-border bg-bg px-2.5 py-2 text-left transition-colors duration-150 hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded bg-primary-soft text-xs font-semibold text-primary">
            {org.shortName.slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{org.shortName}</span>
            <span className="block truncate text-xs text-muted">{t(`roles.${role}` as const)}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted" aria-hidden />
        </button>
        <AnimatePresence>
          {panel === 'org' && (
            <motion.div
              {...pop}
              style={{ transformOrigin: 'top' }}
              role="listbox"
              className="absolute inset-x-3 top-full z-30 mt-1 rounded-lg border border-border bg-surface p-1 shadow-lg shadow-black/10"
            >
              <p className="px-2.5 pb-1 pt-1.5 text-xs text-muted">Организации ({myOrgs.length})</p>
              {myOrgs.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={o.id === orgId}
                  onClick={() => {
                    setOrgId(o.id)
                    setPanel('none')
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1 truncate">{o.shortName}</span>
                  {o.id === orgId && <Check className="size-4 text-primary" aria-hidden />}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Основная навигация">
        <NavList items={work} activeKey={activeKey} onNavigate={(k) => (setDrawer(false), onNavigate?.(k))} />
        {admin.length > 0 && (
          <>
            <p className="mb-1 mt-6 px-2.5 text-xs font-medium text-subtle">Администрирование</p>
            <NavList items={admin} activeKey={activeKey} onNavigate={(k) => (setDrawer(false), onNavigate?.(k))} />
          </>
        )}
      </nav>

      <div className="border-t border-border px-4 py-3 text-xs text-muted">
        Схема по умолчанию · <span className="font-mono">01.05</span>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg text-fg">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:block">{sidebar}</aside>

      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawer(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-72 border-r border-border bg-surface lg:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.24, ease }}
            >
              {sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:px-5">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            className="grid size-9 place-items-center rounded-md text-muted hover:bg-surface-2 lg:hidden"
            aria-label="Открыть меню"
          >
            <Menu className="size-5" />
          </button>

          <GlobalSearch open={panel === 'search'} onOpen={() => setPanel('search')} onClose={() => setPanel('none')} onNavigate={onNavigate} />

          <div className="ml-auto flex items-center gap-1">
            <div className="relative">
              <button
                type="button"
                onClick={() => toggle('notifications')}
                aria-label={`Уведомления, непрочитанных: ${unread}`}
                aria-expanded={panel === 'notifications'}
                className="relative grid size-9 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Bell className="size-[18px]" />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white dark:text-bg">
                    {unread}
                  </span>
                )}
              </button>
              <AnimatePresence>
                {panel === 'notifications' && (
                  <motion.div
                    {...pop}
                    style={{ transformOrigin: 'top right' }}
                    className="absolute right-0 top-full z-30 mt-2 w-[min(380px,calc(100vw-1.5rem))] rounded-lg border border-border bg-surface shadow-lg shadow-black/10"
                  >
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                      <p className="text-sm font-semibold">Уведомления</p>
                      <button type="button" className="text-xs font-medium text-primary hover:underline">
                        Отметить все прочитанными
                      </button>
                    </div>
                    <ul className="max-h-80 overflow-y-auto">
                      {notifications.map((n) => (
                        <li key={n.id} className="border-b border-border last:border-0">
                          <button type="button" className="flex w-full gap-3 px-4 py-3 text-left hover:bg-surface-2">
                            <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-primary')} aria-hidden />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium">{n.title}</span>
                              <span className="mt-0.5 block text-sm text-muted">{n.body}</span>
                              <span className="mt-1 block text-xs text-subtle">{formatDate(n.createdAt)}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => (setPanel('none'), onNavigate?.('notifications'))}
                      className="w-full border-t border-border px-4 py-2.5 text-sm font-medium text-primary hover:bg-surface-2"
                    >
                      Все уведомления
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => toggle('user')}
                aria-expanded={panel === 'user'}
                aria-label="Меню пользователя"
                className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="grid size-8 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-fg">
                  {initials(user.fullName)}
                </span>
                <span className="hidden max-w-[160px] truncate text-sm font-medium md:block">{shortName(user.fullName)}</span>
              </button>
              <AnimatePresence>
                {panel === 'user' && (
                  <motion.div
                    {...pop}
                    style={{ transformOrigin: 'top right' }}
                    className="absolute right-0 top-full z-30 mt-2 w-64 rounded-lg border border-border bg-surface p-1 shadow-lg shadow-black/10"
                  >
                    <div className="px-3 py-2.5">
                      <p className="truncate text-sm font-medium">{user.fullName}</p>
                      <p className="truncate text-xs text-muted">{user.email}</p>
                    </div>
                    <div className="my-1 h-px bg-border" />
                    <MenuItem icon={UserIcon} label="Профиль" onClick={() => (setPanel('none'), onNavigate?.('profile'))} />
                    <MenuItem icon={Bell} label="Настройки уведомлений" onClick={() => (setPanel('none'), onNavigate?.('profile'))} />
                    <MenuItem
                      icon={theme === 'dark' ? Sun : Moon}
                      label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
                      onClick={onToggleTheme}
                    />
                    <div className="my-1 h-px bg-border" />
                    <MenuItem icon={LogOut} label={t('common.logout')} onClick={onLogout} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  projects: FolderKanban,
  documents: FileText,
  archive: Archive,
  adminDashboard: Gauge,
  adminUsers: Users,
  adminOrgs: Building2,
  adminSchemas: FileCode2,
  adminAudit: ScrollText,
  adminSettings: Settings,
}

function NavList({ items, activeKey, onNavigate }: { items: RouteDef[]; activeKey: string; onNavigate: (k: string) => void }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((r) => {
        const Icon = ICONS[r.key] ?? FileText
        const active = activeKey === r.key || activeKey.startsWith(r.key.replace(/s$/, ''))
        return (
          <li key={r.key}>
            <button
              type="button"
              onClick={() => onNavigate(r.key)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex w-full items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-2 text-sm transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'bg-primary-soft font-medium text-primary' : 'text-muted hover:bg-surface-2 hover:text-fg'
              )}
            >
              <Icon className="size-4 shrink-0" />
              {r.title}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function MenuItem({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-2">
      <Icon className="size-4 text-muted" />
      {label}
    </button>
  )
}

function GlobalSearch({
  open,
  onOpen,
  onClose,
  onNavigate,
}: {
  open: boolean
  onOpen: () => void
  onClose: () => void
  onNavigate?: (key: string) => void
}) {
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])
  const needle = q.trim().toLowerCase()
  const proj = projects.filter((p) => !needle || `${p.name} ${p.code} ${p.address}`.toLowerCase().includes(needle))
  const docs = documents.filter((d) => !needle || d.title.toLowerCase().includes(needle))
  const empty = proj.length === 0 && docs.length === 0

  return (
    <div className="relative min-w-0 flex-1 sm:max-w-[480px]">
      <label className="relative block">
        <span className="sr-only">Поиск по объектам и документам</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={onOpen}
          placeholder="Поиск объектов, документов, кадастровых номеров"
          className="h-9 w-full rounded-md border border-border bg-bg pl-9 pr-14 text-sm placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1.5 font-mono text-[11px] text-subtle sm:block">
          Ctrl K
        </kbd>
      </label>
      <AnimatePresence>
        {open && (
          <motion.div
            {...pop}
            style={{ transformOrigin: 'top' }}
            className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-lg border border-border bg-surface shadow-lg shadow-black/10"
            role="listbox"
          >
            {empty ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Ничего не найдено по запросу «{q}»</p>
            ) : (
              <>
                {proj.length > 0 && <p className="px-4 pb-1 pt-3 text-xs font-medium text-subtle">Объекты</p>}
                {proj.map((p) => (
                  <ResultRow key={p.id} title={p.name} meta={`${p.code} · ${p.cadastralNumber}`} onClick={() => (onClose(), onNavigate?.('projectDetails'))} />
                ))}
                {docs.length > 0 && <p className="px-4 pb-1 pt-3 text-xs font-medium text-subtle">Документы</p>}
                {docs.map((d) => (
                  <ResultRow key={d.id} title={d.title} meta={`Схема ${d.schemaVersion} · версия ${d.currentVersion}`} onClick={() => (onClose(), onNavigate?.('documentEditor'))} />
                ))}
                <div className="mt-2 border-t border-border px-4 py-2 text-xs text-subtle">Esc — закрыть</div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ResultRow({ title, meta, onClick }: { title: string; meta: string; onClick: () => void }) {
  return (
    <button type="button" role="option" aria-selected={false} onClick={onClick} className="block w-full px-4 py-2 text-left hover:bg-surface-2">
      <span className="block truncate text-sm">{title}</span>
      <span className="block truncate font-mono text-xs text-muted">{meta}</span>
    </button>
  )
}

const initials = (name: string) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')

const shortName = (name: string) => {
  const [last, first, middle] = name.split(' ')
  return `${last} ${first?.[0] ?? ''}.${middle ? ` ${middle[0]}.` : ''}`
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
