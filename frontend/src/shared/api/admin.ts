import { ApiError } from './errors'
import { downloadFileWithQuery, request, tokenStore } from './http'
import type {
  AdminStats, AuditEntry, DashboardStats, InvitationInfo, Notice, OrgAdmin, Page, Prefs, Profile, Role, SystemSettings, UserAdmin,
} from '../types'

const qs = (params: object) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) if (v !== undefined && v !== '' && v !== null) q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}

export interface UserListParams { q?: string; role?: Role | ''; status?: 'active' | 'blocked' | ''; organizationId?: string; page?: number; pageSize?: number }
export interface AuditParams {
  q?: string; action?: string; entityType?: string; result?: 'ok' | 'denied' | ''; dateFrom?: string; dateTo?: string
  organizationId?: string; page?: number; pageSize?: number
}
export interface OrgInput { name: string; inn: string; ogrn: string; address: string; maxUsers: number; maxProjects: number }

export interface AdminServices {
  stats: { dashboard(): Promise<DashboardStats>; admin(): Promise<AdminStats> }
  users: {
    list(p: UserListParams): Promise<Page<UserAdmin>>
    update(id: string, patch: { role?: Role; status?: 'active' | 'blocked'; fullName?: string }): Promise<UserAdmin>
    resetPassword(id: string): Promise<void>
    invite(input: { email: string; role: Role; organizationId?: string }): Promise<InvitationInfo>
    invitations(organizationId?: string): Promise<InvitationInfo[]>
    revokeInvitation(id: string): Promise<void>
    resendInvitation(id: string): Promise<InvitationInfo>
  }
  profile: {
    get(): Promise<Profile>
    update(patch: { fullName?: string; position?: string; phone?: string; prefs?: Prefs }): Promise<Profile>
    changePassword(currentPassword: string, newPassword: string): Promise<void>
  }
  orgs: { list(): Promise<OrgAdmin[]>; create(i: OrgInput): Promise<OrgAdmin>; update(id: string, patch: Partial<OrgInput> & { isActive?: boolean }): Promise<OrgAdmin> }
  audit: { list(p: AuditParams): Promise<Page<AuditEntry>>; actions(): Promise<string[]>; exportCsv(p: AuditParams): Promise<void> }
  notices: {
    list(p: { unreadOnly?: boolean; kind?: string; page?: number; pageSize?: number }): Promise<Page<Notice> & { unread: number }>
    unreadCount(): Promise<number>
    markRead(id: string): Promise<Notice>
    readAll(): Promise<void>
  }
  settings: { get(): Promise<SystemSettings>; put(s: SystemSettings): Promise<SystemSettings> }
}

export const httpAdmin: AdminServices = {
  stats: { dashboard: () => request('/stats/dashboard'), admin: () => request('/stats/admin') },
  users: {
    list: (p) => request(`/users${qs(p)}`),
    update: (id, patch) => request(`/users/${id}`, { method: 'PATCH', body: patch }),
    async resetPassword(id) { await request(`/users/${id}/reset-password`, { method: 'POST' }) },
    invite: (input) => request('/users/invite', { method: 'POST', body: input }),
    invitations: (organizationId) => request(`/users/invitations${qs({ organizationId })}`),
    revokeInvitation: (id) => request(`/users/invitations/${id}`, { method: 'DELETE' }),
    resendInvitation: (id) => request(`/users/invitations/${id}/resend`, { method: 'POST' }),
  },
  profile: {
    get: () => request('/users/me'),
    update: (patch) => request('/users/me', { method: 'PATCH', body: patch }),
    async changePassword(currentPassword, newPassword) {
      // other devices are signed out by the server; this session continues with the fresh token
      const r = await request<{ token: string }>('/users/me/password', { method: 'POST', body: { currentPassword, newPassword } })
      tokenStore.set(r.token)
    },
  },
  orgs: {
    list: () => request('/organizations'),
    create: (i) => request('/organizations', { method: 'POST', body: i }),
    update: (id, patch) => request(`/organizations/${id}`, { method: 'PATCH', body: patch }),
  },
  audit: {
    list: (p) => request(`/audit${qs(p)}`),
    actions: () => request('/audit/actions'),
    exportCsv: (p) => downloadFileWithQuery(`/audit/export${qs({ ...p, page: undefined, pageSize: undefined })}`, 'audit_log.csv'),
  },
  notices: {
    list: (p) => request(`/notifications${qs(p)}`),
    async unreadCount() { return (await request<{ unread: number }>('/notifications/unread-count')).unread },
    markRead: (id) => request(`/notifications/${id}/read`, { method: 'POST' }),
    async readAll() { await request('/notifications/read-all', { method: 'POST' }) },
  },
  settings: {
    get: () => request('/settings'),
    put: (s) => request('/settings', { method: 'PUT', body: s }),
  },
}

/** VITE_USE_MOCK: administration needs the real backend, every call explains that. */
const demo = <T extends object>(): T =>
  new Proxy({}, {
    get: () => new Proxy(() => undefined, {
      apply: async () => { throw new ApiError('not_implemented', 'В демо-режиме (VITE_USE_MOCK) эта функция недоступна') },
    }),
  }) as T

export const demoAdmin: AdminServices = {
  stats: demo(), users: demo(), profile: demo(), orgs: demo(), audit: demo(), notices: demo(), settings: demo(),
}
