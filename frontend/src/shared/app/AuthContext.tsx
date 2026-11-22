import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { Session } from '../types'

interface AuthState {
  session: Session | null
  /** True while the stored token is being checked on first load. */
  loading: boolean
  /** The server ended the session (signed out elsewhere, blocked, password changed). */
  sessionExpired: boolean
  login: (email: string, password: string) => Promise<Session>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)

  useEffect(() => {
    api.auth
      .me()
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const h = () => { setSession(null); setSessionExpired(true) }
    window.addEventListener('pz:session-expired', h)
    return () => window.removeEventListener('pz:session-expired', h)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const s = await api.auth.login(email, password)
    setSessionExpired(false)
    setSession(s)
    return s
  }, [])

  const logout = useCallback(async () => {
    await api.auth.logout()
    setSession(null)
  }, [])

  const value = useMemo(() => ({ session, loading, sessionExpired, login, logout }), [session, loading, sessionExpired, login, logout])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>')
  return v
}
