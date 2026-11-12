/**
 * Service layer. Pages depend only on these interfaces; `api` is wired to
 * mock implementations today. To use a real backend, implement the same
 * interfaces with fetch() in `shared/api/http/*` and swap the export below.
 */
import type { AppNotification, Organization, Session, User } from '../types'
import { notifications, organizations, users } from '../mock/data'

export class ApiError extends Error {
  constructor(public code: 'invalid_credentials' | 'locked' | 'token_expired' | 'conflict' | 'network', message: string) {
    super(message)
  }
}

export interface RegisterPayload {
  fullName: string
  email: string
  password: string
  organization: { mode: 'join'; organizationId: string } | { mode: 'create'; name: string; inn: string }
}

export interface AuthService {
  login(email: string, password: string): Promise<Session>
  register(payload: RegisterPayload): Promise<{ email: string }>
  requestPasswordReset(email: string): Promise<void>
  resetPassword(token: string, password: string): Promise<void>
  confirmEmail(token: string): Promise<{ email: string }>
  acceptInvite(token: string, payload: { fullName: string; password: string }): Promise<Session>
  logout(): Promise<void>
}

export interface OrganizationService {
  listPublic(): Promise<Pick<Organization, 'id' | 'name' | 'inn'>[]>
  get(id: string): Promise<Organization>
}

export interface NotificationService {
  list(): Promise<AppNotification[]>
  markAllRead(): Promise<void>
}

const delay = (ms = 500) => new Promise((r) => setTimeout(r, ms))

const sessionFor = (user: User): Session => ({
  user,
  organization: organizations.find((o) => o.id === user.activeOrganizationId)!,
  token: `mock-${user.id}`,
})

const mockAuth: AuthService = {
  async login(email) {
    await delay()
    const user = users.find((u) => u.email === email.trim().toLowerCase())
    if (!user) throw new ApiError('invalid_credentials', 'Неверная почта или пароль')
    if (user.status === 'blocked') throw new ApiError('locked', 'Учётная запись заблокирована')
    return sessionFor(user)
  },
  async register(payload) {
    await delay(700)
    if (users.some((u) => u.email === payload.email)) {
      throw new ApiError('conflict', 'Пользователь с такой почтой уже зарегистрирован')
    }
    return { email: payload.email }
  },
  async requestPasswordReset() {
    await delay()
  },
  async resetPassword(token) {
    await delay()
    if (token === 'expired') throw new ApiError('token_expired', 'Ссылка устарела')
  },
  async confirmEmail(token) {
    await delay()
    if (token === 'expired') throw new ApiError('token_expired', 'Ссылка устарела')
    return { email: 'a.kovaleva@psi-proekt.ru' }
  },
  async acceptInvite() {
    await delay()
    return sessionFor(users[0])
  },
  async logout() {
    await delay(150)
  },
}

const mockOrganizations: OrganizationService = {
  async listPublic() {
    await delay(200)
    return organizations.map(({ id, name, inn }) => ({ id, name, inn }))
  },
  async get(id) {
    await delay(200)
    return organizations.find((o) => o.id === id)!
  },
}

const mockNotifications: NotificationService = {
  async list() {
    await delay(200)
    return notifications
  },
  async markAllRead() {
    await delay(150)
  },
}

export const api = {
  auth: mockAuth,
  organizations: mockOrganizations,
  notifications: mockNotifications,
}
