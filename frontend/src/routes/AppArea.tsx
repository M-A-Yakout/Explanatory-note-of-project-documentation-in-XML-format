import React, { useCallback, useEffect, useState } from 'react'
import { Navigate, matchPath, useLocation, useNavigate } from 'react-router-dom'

import DashboardPage from '../pages/app/DashboardPage'
import { ErrorRoute } from './PublicRoutes'
import { findRoute, guard, routes } from '../shared/app/routes'
import { useAuth } from '../shared/app/AuthContext'
import { pageFor } from './pageRegistry'
import { api } from '../shared/api'

const toRegex = (p: string) => new RegExp('^' + p.replace(/:[^/]+/g, '[^/]+') + '/?$')
const privateRoutes = routes
  .filter((r) => r.roles !== 'public')
  // static paths first so /app/projects/new wins over /app/projects/:id
  .sort((a, b) => Number(a.path.includes(':')) - Number(b.path.includes(':')))

/** Everything under /app: needs a session and a role the route allows. */
export function AppArea({ theme, onToggleTheme }: { theme: 'light' | 'dark'; onToggleTheme: () => void }) {
  const { session, loading, logout } = useAuth()
  const { pathname } = useLocation()
  const nav = useNavigate()
  const [defaultSchema, setDefaultSchema] = useState<string | undefined>()
  const refreshSchema = useCallback(() => {
    api.schemas.list().then((r) => setDefaultSchema(r.find((x) => x.isDefault)?.version)).catch(() => {})
  }, [])
  useEffect(() => {
    if (!session) return
    refreshSchema()
    window.addEventListener('pz:schemas-changed', refreshSchema)
    return () => window.removeEventListener('pz:schemas-changed', refreshSchema)
  }, [session, refreshSchema])

  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-muted">Загрузка…</div>
  if (!session) return <Navigate to="/login" replace state={{ from: pathname }} />

  const def = privateRoutes.find((r) => toRegex(r.path).test(pathname))
  if (!def) return <ErrorRoute code="404" />
  if (!guard(def, session.user.role).ok) return <Navigate to="/403" replace />

  const params = matchPath({ path: def.path, end: true }, pathname)?.params ?? {}
  const content = pageFor(def.key, params, session.user.role)

  return (
    <DashboardPage
      role={session.user.role}
      page={def.key}
      theme={theme}
      user={session.user}
      organization={session.organization}
      defaultSchema={defaultSchema}
      onToggleTheme={onToggleTheme}
      onNavigate={(key) => {
        const target = findRoute(key)
        nav(target && !target.path.includes(':') ? target.path : '/app')
      }}
      onLogout={async () => {
        await logout()
        nav('/login', { replace: true })
      }}
    >
      {content}
    </DashboardPage>
  )
}
