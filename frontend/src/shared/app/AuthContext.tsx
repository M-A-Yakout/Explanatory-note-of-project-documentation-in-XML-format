import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { Session } from '../types'

interface AuthState {
  session: Session | null
  /** True while the stored token is being checked on first load. */
  loading: boolean
  login: (email: string, password: string) => Promise<Session>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.auth
      .me()
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const s = await api.auth.login(email, password)
    setSession(s)
    return s
  }, [])

  const logout = useCallback(async () => {
    await api.auth.logout()
    setSession(null)
  }, [])

  const value = useMemo(() => ({ session, loading, login, logout }), [session, loading, login, logout])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>')
  return v
}
