import React from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'

import DashboardPage from '../pages/app/DashboardPage'
import { ErrorRoute } from './PublicRoutes'
import { findRoute, guard, routes } from '../shared/app/routes'
import { useAuth } from '../shared/app/AuthContext'

const toRegex = (p: string) => new RegExp('^' + p.replace(/:[^/]+/g, '[^/]+') + '/?$')
const privateRoutes = routes.filter((r) => r.roles !== 'public')

/** Everything under /app: needs a session and a role the route allows. */
export function AppArea({ theme, onToggleTheme }: { theme: 'light' | 'dark'; onToggleTheme: () => void }) {
  const { session, loading, logout } = useAuth()
  const { pathname } = useLocation()
  const nav = useNavigate()

  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-muted">Загрузка…</div>
  if (!session) return <Navigate to="/login" replace state={{ from: pathname }} />

  const def = privateRoutes.find((r) => toRegex(r.path).test(pathname))
  if (!def) return <ErrorRoute code="404" />
  if (!guard(def, session.user.role).ok) return <Navigate to="/403" replace />

  return (
    <DashboardPage
      role={session.user.role}
      page={def.key}
      theme={theme}
      user={session.user}
      organization={session.organization}
      onToggleTheme={onToggleTheme}
      onNavigate={(key) => {
        const target = findRoute(key)
        nav(target && !target.path.includes(':') ? target.path : '/app')
      }}
      onLogout={async () => {
        await logout()
        nav('/login', { replace: true })
      }}
    />
  )
}
