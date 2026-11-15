import React, { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'

import Landing from '../pages/public/Landing'
import Login from '../pages/public/Login'
import Register from '../pages/public/Register'
import ForgotPassword from '../pages/public/ForgotPassword'
import ResetPassword from '../pages/public/ResetPassword'
import ConfirmEmail from '../pages/public/ConfirmEmail'
import ErrorPage from '../pages/public/ErrorPage'

import { api, ApiError } from '../shared/api'
import { useAuth } from '../shared/app/AuthContext'

export function LandingRoute() {
  const nav = useNavigate()
  const { session } = useAuth()
  return <Landing signedIn={!!session} onLogin={() => nav('/login')} onRegister={() => nav('/register')} onDashboard={() => nav('/app')} />
}

export function LoginRoute() {
  const nav = useNavigate()
  const loc = useLocation()
  const { session, login } = useAuth()
  const [state, setState] = useState<'default' | 'submitting' | 'error' | 'locked'>('default')
  const from = (loc.state as { from?: string } | null)?.from ?? '/app'
  if (session) return <Navigate to="/app" replace />
  return (
    <Login
      state={state}
      onHome={() => nav('/')}
      onForgot={() => nav('/forgot-password')}
      onRegister={() => nav('/register')}
      onSubmit={async (v) => {
        setState('submitting')
        try {
          await login(v.email, v.password)
          nav(from, { replace: true })
        } catch (e) {
          setState(e instanceof ApiError && e.code === 'locked' ? 'locked' : 'error')
        }
      }}
    />
  )
}

export function RegisterRoute() {
  const nav = useNavigate()
  const [state, setState] = useState<'default' | 'submitting' | 'emailTaken'>('default')
  const [orgs, setOrgs] = useState<{ id: string; name: string; inn: string }[]>([])
  useEffect(() => {
    api.organizations.listPublic().then(setOrgs).catch(() => setOrgs([]))
  }, [])
  return (
    <Register
      state={state}
      organizations={orgs}
      onHome={() => nav('/')}
      onLogin={() => nav('/login')}
      onSubmit={async (v) => {
        setState('submitting')
        try {
          await api.auth.register({
            fullName: v.fullName,
            email: v.email,
            password: v.password,
            organization:
              v.orgMode === 'join'
                ? { mode: 'join', organizationId: v.organizationId! }
                : { mode: 'create', name: v.orgName!.trim(), inn: v.orgInn! },
          })
          nav('/confirm', { state: { email: v.email } })
        } catch (e) {
          setState(e instanceof ApiError && e.code === 'conflict' ? 'emailTaken' : 'default')
        }
      }}
    />
  )
}

export function ForgotRoute() {
  const nav = useNavigate()
  const [state, setState] = useState<'default' | 'submitting' | 'sent' | 'error'>('default')
  return (
    <ForgotPassword
      state={state}
      onBack={() => nav('/login')}
      onSubmit={async (v) => {
        setState('submitting')
        try {
          await api.auth.requestPasswordReset(v.email)
          setState('sent')
        } catch {
          setState('error')
        }
      }}
    />
  )
}

export function ResetRoute() {
  const nav = useNavigate()
  const { token = '' } = useParams()
  const [state, setState] = useState<'default' | 'submitting' | 'done' | 'expired'>('default')
  return (
    <ResetPassword
      state={state}
      onLogin={() => nav('/login')}
      onRequestNew={() => nav('/forgot-password')}
      onSubmit={async (v) => {
        setState('submitting')
        try {
          await api.auth.resetPassword(token, v.password)
          setState('done')
        } catch (e) {
          setState(e instanceof ApiError && e.code.startsWith('token') ? 'expired' : 'default')
        }
      }}
    />
  )
}

/** /confirm — "check your mail" screen shown right after registration. */
export function ConfirmSentRoute() {
  const nav = useNavigate()
  const email = (useLocation().state as { email?: string } | null)?.email
  return <ConfirmEmail mode="emailSent" email={email} onLogin={() => nav('/login')} onContinue={() => nav('/login')} />
}

/** /confirm/:token — opened from the link in the e-mail. */
export function ConfirmTokenRoute() {
  const nav = useNavigate()
  const { token = '' } = useParams()
  const [mode, setMode] = useState<'confirming' | 'confirmed' | 'expired'>('confirming')
  const [email, setEmail] = useState<string | undefined>()
  useEffect(() => {
    api.auth
      .confirmEmail(token)
      .then((r) => {
        setEmail(r.email)
        setMode('confirmed')
      })
      .catch(() => setMode('expired'))
  }, [token])
  return <ConfirmEmail mode={mode} email={email} onLogin={() => nav('/login')} onContinue={() => nav('/login')} />
}

/** /invite/:token — an invited person chooses a name and password. */
export function InviteRoute() {
  const nav = useNavigate()
  const { token = '' } = useParams()
  const { login } = useAuth()
  const [info, setInfo] = useState<{ email: string } | null>(null)
  const [mode, setMode] = useState<'invite' | 'inviteAccepting' | 'expired'>('invite')
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    api.auth.inviteInfo(token).then(setInfo).catch(() => setMode('expired')).finally(() => setLoaded(true))
  }, [token])
  if (!loaded) return null
  return (
    <ConfirmEmail
      mode={mode}
      email={info?.email}
      onLogin={() => nav('/login')}
      onContinue={() => nav('/login')}
      onAccept={async (v) => {
        setMode('inviteAccepting')
        try {
          await api.auth.acceptInvite(token, { fullName: v.fullName, password: v.password })
          await login(info!.email, v.password)  // opens the session in the app
          nav('/app', { replace: true })
        } catch {
          setMode('expired')
        }
      }}
    />
  )
}

export function ErrorRoute({ code }: { code: '403' | '404' }) {
  const nav = useNavigate()
  const path = useLocation().pathname
  const { session } = useAuth()
  return <ErrorPage code={code} path={path} signedIn={!!session} onHome={() => nav(session ? '/app' : '/')} onBack={() => nav(-1)} />
}
