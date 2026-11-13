import React from 'react'
import { AppShell } from '../../shared/components/AppShell'
import { findRoute, routes } from '../../shared/app/routes'
import type { Organization, User, Role } from '../../shared/types'

/** Authenticated layout for every /app and /admin route · any signed-in role */
export const args = {
  role: 'designer',
  page: 'dashboard',
  panel: 'none',
}

export const argTypes = {
  role: { control: 'select', options: ['designer', 'expert', 'org_admin', 'super_admin'] },
  page: { control: 'select', options: ['dashboard', 'projects', 'documents', 'archive', 'adminUsers', 'adminSchemas'] },
  panel: { control: 'select', options: ['none', 'search', 'notifications', 'user', 'org'] },
}

type Props = Partial<typeof args> & {
  theme?: 'light' | 'dark'
  onNavigate?: (key: string) => void
  onLogout?: () => void
  onToggleTheme?: () => void
  user?: User
  organization?: Organization
}

export default function DashboardPage(props: Props) {
  const { role, page, panel, theme, onNavigate, onLogout, onToggleTheme, user, organization } = { ...args, ...props }
  const route = findRoute(page) ?? routes[0]
  const group = { public: 1, common: 2, projects: 3, documents: 4, admin: 5 }[route.group]

  return (
    <AppShell
      role={role as Role}
      activeKey={page}
      title={route.title}
      initialPanel={panel as 'none'}
      theme={theme}
      onNavigate={onNavigate}
      onLogout={onLogout}
      onToggleTheme={onToggleTheme}
      user={user}
      organization={organization}
    >
      {/* Content slot: every page of groups 2–5 renders here. */}
      <section
        aria-label="Область содержимого"
        className="flex min-h-[420px] flex-col items-start justify-center rounded-lg border border-dashed border-border-strong px-6 py-12 sm:px-10"
      >
        <p className="font-mono text-sm text-muted">{route.path}</p>
        <h2 className="mt-2 text-lg font-semibold">Содержимое страницы «{route.title}»</h2>
        <p className="mt-2 max-w-[520px] text-sm leading-6 text-muted">
          Каркас готов: навигация, поиск, уведомления, переключение организации и меню пользователя работают. Сама страница
          будет построена в группе {group}.
        </p>
        <p className="mt-4 text-sm text-muted">
          Доступ:{' '}
          <span className="text-fg">
            {route.roles === 'public' ? 'всем' : route.roles === 'any' ? 'любой роли' : route.roles.length + ' из 4 ролей'}
          </span>
        </p>
      </section>
    </AppShell>
  )
}
