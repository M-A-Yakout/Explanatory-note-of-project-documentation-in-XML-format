import React, { useEffect, useState } from 'react'

import Landing from './pages/public/Landing'
import Register from './pages/public/Register'
import Login from './pages/public/Login'
import ForgotPassword from './pages/public/ForgotPassword'
import ResetPassword from './pages/public/ResetPassword'
import Confirm from './pages/public/ConfirmEmail'
import ErrorPage from './pages/public/ErrorPage'
import DashboardPage from './pages/app/DashboardPage'

import { ToastProvider } from './shared/components/Toast'
import { findRoute, guard } from './shared/app/routes'
import { api } from './shared/api'
import type { Role } from './shared/types'

export const args = {
  role: 'guest',
  theme: 'light',
}

export const argTypes = {
  role: { control: 'select', options: ['guest', 'designer', 'expert', 'org_admin', 'super_admin'] },
  theme: { control: 'radio', options: ['light', 'dark'] },
}

type Props = Partial<typeof args>

export default function App(props: Props) {
  const { role, theme } = { ...args, ...props }
  const [sessionRole, setSessionRole] = useState<Role | null>(role === 'guest' ? null : (role as Role))
  const [route, setRoute] = useState<string>('landing')
  const [loginState, setLoginState] = useState<'default' | 'submitting' | 'error' | 'locked'>('default')
  const [forgotState, setForgotState] = useState<'default' | 'submitting' | 'sent'>('default')
  const [resetState, setResetState] = useState<'default' | 'submitting' | 'done'>('default')
  const [confirmMode, setConfirmMode] = useState<'emailSent' | 'confirmed' | 'invite'>('emailSent')
  const [registerState, setRegisterState] = useState<'default' | 'submitting'>('default')
  const [mode, setMode] = useState<'light' | 'dark'>(theme as 'light' | 'dark')

  useEffect(() => setSessionRole(role === 'guest' ? null : (role as Role)), [role])
  useEffect(() => setMode(theme as 'light' | 'dark'), [theme])

  /** Navigate through the route guard, exactly as the router would. */
  const go = (key: string, asRole: Role | null = sessionRole) => {
    const def = findRoute(key)
    if (!def) return setRoute('notFound')
    const check = guard(def, asRole)
    setRoute(check.ok ? key : check.redirect)
  }

  const screen = () => {
    switch (route) {
      case 'landing':
        return (
          <Landing
            signedIn={!!sessionRole}
            onLogin={() => go('login')}
            onRegister={() => go('register')}
            onDashboard={() => go('dashboard')}
          />
        )
      case 'login':
        return (
          <Login
            state={loginState}
            onHome={() => go('landing')}
            onForgot={() => go('forgot')}
            onRegister={() => go('register')}
            onSubmit={async (v) => {
              setLoginState('submitting')
              try {
                const session = await api.auth.login(v.email, v.password)
                setLoginState('default')
                setSessionRole(session.user.role)
                go('dashboard', session.user.role)
              } catch (e) {
                setLoginState((e as { code?: string }).code === 'locked' ? 'locked' : 'error')
              }
            }}
          />
        )
      case 'register':
        return (
          <Register
            state={registerState}
            onHome={() => go('landing')}
            onLogin={() => go('login')}
            onSubmit={() => {
              setRegisterState('submitting')
              setTimeout(() => {
                setRegisterState('default')
                setConfirmMode('emailSent')
                go('confirm')
              }, 700)
            }}
          />
        )
      case 'forgot':
        return (
          <ForgotPassword
            state={forgotState}
            onBack={() => go('login')}
            onSubmit={() => {
              setForgotState('submitting')
              setTimeout(() => setForgotState('sent'), 600)
            }}
            onOpenLink={() => {
              setForgotState('default')
              go('reset')
            }}
          />
        )
      case 'reset':
        return (
          <ResetPassword
            state={resetState}
            onLogin={() => {
              setResetState('default')
              go('login')
            }}
            onRequestNew={() => go('forgot')}
            onSubmit={() => {
              setResetState('submitting')
              setTimeout(() => setResetState('done'), 600)
            }}
          />
        )
      case 'confirm':
        return (
          <Confirm
            mode={confirmMode}
            onOpenLink={() => setConfirmMode('confirmed')}
            onLogin={() => go('login')}
            onContinue={() => go('login')}
            onAccept={() => {
              setSessionRole('designer')
              go('dashboard', 'designer')
            }}
          />
        )
      case 'forbidden':
        return <ErrorPage code="403" signedIn={!!sessionRole} onHome={() => go(sessionRole ? 'dashboard' : 'landing')} />
      case 'notFound':
        return <ErrorPage code="404" signedIn={!!sessionRole} onHome={() => go(sessionRole ? 'dashboard' : 'landing')} />
      default:
        return (
          <DashboardPage
            role={sessionRole ?? 'designer'}
            page={route}
            theme={mode}
            onToggleTheme={() => setMode((m) => (m === 'dark' ? 'light' : 'dark'))}
            onNavigate={(key) => go(key)}
            onLogout={() => {
              setSessionRole(null)
              go('login', null)
            }}
          />
        )
    }
  }

  return (
    <ToastProvider>
      <div className={mode === 'dark' ? 'dark' : ''}>
        <div className="min-h-screen bg-bg text-fg">{screen()}</div>
      </div>
    </ToastProvider>
  )
}
