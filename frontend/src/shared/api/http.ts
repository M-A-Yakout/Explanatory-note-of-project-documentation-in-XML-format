import { ApiError } from './errors'
import type { AuthService, OrganizationService } from './index'
import type { Session } from '../types'

const BASE = '/api'
const TOKEN_KEY = 'pz_token'

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export async function request<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get()
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method: opts.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    })
  } catch {
    throw new ApiError('network', 'Нет связи с сервером')
  }
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const d = data?.detail
    throw new ApiError(d?.code ?? 'unknown', d?.message ?? 'Ошибка сервера')
  }
  return data as T
}

export const httpAuth: AuthService = {
  async login(email, password) {
    const s = await request<Session>('/auth/login', { method: 'POST', body: { email, password } })
    tokenStore.set(s.token)
    return s
  },
  async register(payload) {
    return request<{ email: string }>('/auth/register', { method: 'POST', body: payload })
  },
  async requestPasswordReset(email) {
    await request('/auth/forgot-password', { method: 'POST', body: { email } })
  },
  async resetPassword(token, password) {
    await request('/auth/reset-password', { method: 'POST', body: { token, password } })
  },
  async confirmEmail(token) {
    return request<{ email: string }>('/auth/confirm-email', { method: 'POST', body: { token } })
  },
  async acceptInvite() {
    throw new ApiError('not_implemented', 'Приглашения появятся в части 9')
  },
  async logout() {
    tokenStore.clear()
  },
  async me() {
    if (!tokenStore.get()) return null
    try {
      const s = await request<Session>('/auth/me')
      return { ...s, token: tokenStore.get()! }
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'unauthorized' || e.code === 'token_expired')) {
        tokenStore.clear()
        return null
      }
      throw e
    }
  },
}

export const httpOrganizations: OrganizationService = {
  async listPublic() {
    return request('/organizations/public')
  },
  async get() {
    throw new ApiError('not_implemented', 'Появится в части 9')
  },
}
