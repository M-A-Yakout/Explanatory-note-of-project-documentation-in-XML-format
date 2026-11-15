/**
 * Service layer. Pages depend only on these interfaces; `api` is wired to
 * mock implementations today. To use a real backend, implement the same
 * interfaces with fetch() in `shared/api/http/*` and swap the export below.
 */
import type { Role, Author, BulkAction, BulkResult, SearchResult, ImportReport, ValidationResult, XmlPreview, SchemaInfo, StructureNode, Change, DocumentData, DocumentDetail, DocumentStatus, ExplanatoryNote, VersionMeta, AppNotification, Organization, Paginated, Project, ProjectStatus, ConstructionType, Session, User } from '../types'
import { notifications, organizations, projects as mockProjectRows, users } from '../mock/data'

import { ApiError } from './errors'
import { demoAdmin, httpAdmin } from './admin'
import { httpAuth, httpDocuments, httpOrganizations, httpProjects, httpSchemas, httpSearch } from './http'
export { ApiError }

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
  /** Who the invitation is for (read-only; does not consume the link). */
  inviteInfo(token: string): Promise<{ email: string; organizationName: string; role: Role }>
  logout(): Promise<void>
  /** Current session from a stored token, or null. */
  me(): Promise<Session | null>
}

export interface OrganizationService {
  listPublic(): Promise<Pick<Organization, 'id' | 'name' | 'inn'>[]>
  get(id: string): Promise<Organization>
}

export interface ProjectListParams {
  q?: string
  status?: ProjectStatus | ''
  constructionType?: ConstructionType | ''
  sort?: 'updated_at' | 'created_at' | 'name' | 'code'
  order?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export type ProjectInput = Pick<Project, 'name' | 'address' | 'cadastralNumber' | 'constructionType' | 'developer'> &
  Partial<Pick<Project, 'customer' | 'designer' | 'functionalPurpose' | 'financingSource'>>

export interface ProjectService {
  list(params: ProjectListParams): Promise<Paginated<Project>>
  get(id: string): Promise<Project>
  create(input: ProjectInput): Promise<Project>
  update(id: string, patch: Partial<ProjectInput> & { status?: ProjectStatus }): Promise<Project>
  remove(id: string): Promise<void>
}

export interface DocumentListParams {
  q?: string
  projectId?: string
  status?: DocumentStatus | ''
  schemaVersion?: string
  authorId?: string
  /** ISO dates (YYYY-MM-DD), inclusive. */
  updatedFrom?: string
  updatedTo?: string
  sort?: 'updated_at' | 'created_at' | 'title'
  order?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface DocumentService {
  list(params: DocumentListParams): Promise<Paginated<ExplanatoryNote>>
  get(id: string): Promise<DocumentDetail>
  create(input: { projectId: string; title?: string; schemaVersion?: string }): Promise<DocumentDetail>
  /** Autosave. Rejects with ApiError('conflict') when baseRevision is stale. */
  saveData(id: string, data: DocumentData, baseRevision: number): Promise<DocumentDetail>
  update(id: string, patch: { title?: string; status?: DocumentStatus }): Promise<DocumentDetail>
  remove(id: string): Promise<void>
  versions(id: string): Promise<VersionMeta[]>
  saveVersion(id: string, comment: string): Promise<VersionMeta>
  diff(id: string, from: number, to: number | 'current'): Promise<Change[]>
  restore(id: string, number: number): Promise<DocumentDetail>
  /** Runs business rules + XSD check on the current data and stores the result. */
  validate(id: string): Promise<ValidationResult>
  /** Last stored result, or null if the document was never checked. */
  validation(id: string): Promise<ValidationResult | null>
  xml(id: string): Promise<XmlPreview>
  /** Rejects with ApiError('validation_failed') while the document has errors. */
  downloadXml(id: string, filename: string): Promise<void>
  downloadReport(id: string): Promise<void>
  /** Analyses an XML file without saving anything. The file travels as base64 so its own encoding is respected. */
  importPreview(input: { contentBase64: string; filename: string; schemaVersion?: string }): Promise<ImportReport>
  archive(id: string): Promise<DocumentDetail>
  restoreFromArchive(id: string): Promise<DocumentDetail>
  /** One action for many documents; every id succeeds or fails on its own. */
  bulk(ids: string[], action: BulkAction): Promise<BulkResult>
  /** Downloads a ZIP with the XML of every selected document that passes validation. */
  bulkXml(ids: string[]): Promise<{ exported: number; skipped: number }>
  authors(): Promise<Author[]>
  importCreate(input: { contentBase64: string; filename: string; projectId: string; schemaVersion?: string; title?: string }): Promise<{ document: DocumentDetail; report: ImportReport }>
}

export interface SchemaUpload {
  version: string
  title: string
  filename: string
  content: string
  changelog: string
  compatibility: string
  makeDefault: boolean
}

export interface SchemaService {
  /** Active schemas; `includeInactive` is for super admins only. */
  list(includeInactive?: boolean): Promise<SchemaInfo[]>
  upload(input: SchemaUpload): Promise<SchemaInfo>
  update(id: string, patch: Partial<Pick<SchemaInfo, 'title' | 'changelog' | 'compatibility' | 'isActive'>>): Promise<SchemaInfo>
  makeDefault(id: string): Promise<SchemaInfo>
  remove(id: string): Promise<void>
  structure(id: string): Promise<StructureNode[]>
  /** Triggers a browser download of the XSD file. */
  download(id: string, filename: string): Promise<void>
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
  async inviteInfo() {
    return { email: 'new.user@example.ru', organizationName: 'Демо-организация', role: 'designer' as Role }
  },
  async logout() {
    await delay(150)
  },
  async me() {
    return null
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

const mockProjects: ProjectService = {
  async list({ q = '', status, constructionType, page = 1, pageSize = 20 }) {
    await delay(200)
    const needle = q.trim().toLowerCase()
    const rows = mockProjectRows.filter(
      (p) =>
        (!needle || `${p.name} ${p.address} ${p.cadastralNumber} ${p.code}`.toLowerCase().includes(needle)) &&
        (!status || p.status === status) &&
        (!constructionType || p.constructionType === constructionType)
    )
    return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize }
  },
  async get(id) {
    await delay(200)
    const p = mockProjectRows.find((x) => x.id === id)
    if (!p) throw new ApiError('not_found', 'Объект не найден')
    return p
  },
  async create() {
    throw new ApiError('not_implemented', 'В демо-режиме создание недоступно')
  },
  async update() {
    throw new ApiError('not_implemented', 'В демо-режиме правка недоступна')
  },
  async remove() {
    throw new ApiError('not_implemented', 'В демо-режиме удаление недоступно')
  },
}

const demoOnly = async () => {
  throw new ApiError('not_implemented', 'В демо-режиме (VITE_USE_MOCK) документы недоступны')
}
const mockDocuments: DocumentService = {
  async list({ page = 1, pageSize = 20 }) {
    return { items: [], total: 0, page, pageSize }
  },
  get: demoOnly, create: demoOnly, saveData: demoOnly, update: demoOnly, remove: demoOnly,
  versions: demoOnly, saveVersion: demoOnly, diff: demoOnly, restore: demoOnly,
  validate: demoOnly, validation: demoOnly, xml: demoOnly, downloadXml: demoOnly, downloadReport: demoOnly, importPreview: demoOnly, importCreate: demoOnly,
  archive: demoOnly, restoreFromArchive: demoOnly, bulk: demoOnly, bulkXml: demoOnly, authors: async () => [],
}

const demoSchemas: SchemaService = {
  async list() { return [] },
  upload: demoOnly, update: demoOnly, makeDefault: demoOnly, remove: demoOnly, structure: demoOnly, download: demoOnly,
}

const mockSearch = { async global(): Promise<SearchResult> { return { projects: [], documents: [] } } }

const mockNotifications: NotificationService = {
  async list() {
    await delay(200)
    return notifications
  },
  async markAllRead() {
    await delay(150)
  },
}

/** Set VITE_USE_MOCK=true to run the UI without the backend. */
const useMock = import.meta.env.VITE_USE_MOCK === 'true'

export const api = {
  auth: useMock ? mockAuth : httpAuth,
  organizations: useMock ? mockOrganizations : httpOrganizations,
  projects: useMock ? mockProjects : httpProjects,
  documents: useMock ? mockDocuments : httpDocuments,
  schemas: useMock ? demoSchemas : httpSchemas,
  search: useMock ? mockSearch : httpSearch,
  ...(useMock ? demoAdmin : httpAdmin),
  notifications: mockNotifications,
}
