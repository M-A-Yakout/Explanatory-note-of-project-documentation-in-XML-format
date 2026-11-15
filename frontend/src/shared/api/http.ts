import { ApiError } from './errors'
import type { AuthService, DocumentService, OrganizationService, ProjectService, SchemaService } from './index'
import type { Author, BulkAction, BulkResult, SearchResult, ImportReport, ValidationResult, XmlPreview, SchemaInfo, StructureNode, Change, DocumentDetail, ExplanatoryNote, Paginated, Project, Session, VersionMeta } from '../types'

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

/** Fetches a file with the bearer token and hands it to the browser as a download. Returns the response headers. */
async function fetchDownload(path: string, filename: string, init: { method?: string; body?: unknown } = {}): Promise<Headers> {
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${tokenStore.get() ?? ''}`, ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new ApiError('network', 'Нет связи с сервером')
  }
  if (!res.ok) {
    const d = (await res.json().catch(() => null))?.detail
    throw new ApiError(d?.code ?? 'download_failed', d?.message ?? 'Не удалось скачать файл')
  }
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return res.headers
}

/** Same as fetchDownload but for callers that only care that the download happened. */
export const downloadFile = async (path: string, filename: string): Promise<void> => {
  await fetchDownload(path, filename)
}

export const downloadFileWithQuery = downloadFile

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
  async acceptInvite(token, payload) {
    const s = await request<Session>('/auth/accept-invite', { method: 'POST', body: { token, ...payload } })
    tokenStore.set(s.token)
    return s
  },
  inviteInfo: (token) => request(`/auth/invite-info?token=${encodeURIComponent(token)}`),
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

export const httpProjects: ProjectService = {
  async list(params) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v))
    return request<Paginated<Project>>('/projects?' + qs.toString())
  },
  get: (id) => request<Project>(`/projects/${id}`),
  create: (input) => request<Project>('/projects', { method: 'POST', body: input }),
  update: (id, patch) => request<Project>(`/projects/${id}`, { method: 'PATCH', body: patch }),
  remove: (id) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
}

export const httpDocuments: DocumentService = {
  async list(params) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v))
    return request<Paginated<ExplanatoryNote>>('/documents?' + qs.toString())
  },
  get: (id) => request<DocumentDetail>(`/documents/${id}`),
  create: (input) => request<DocumentDetail>('/documents', { method: 'POST', body: input }),
  saveData: (id, data, baseRevision) => request<DocumentDetail>(`/documents/${id}/data`, { method: 'PUT', body: { data, baseRevision } }),
  update: (id, patch) => request<DocumentDetail>(`/documents/${id}`, { method: 'PATCH', body: patch }),
  remove: (id) => request<void>(`/documents/${id}`, { method: 'DELETE' }),
  versions: (id) => request<VersionMeta[]>(`/documents/${id}/versions`),
  saveVersion: (id, comment) => request<VersionMeta>(`/documents/${id}/versions`, { method: 'POST', body: { comment } }),
  diff: (id, from, to) => request<Change[]>(`/documents/${id}/diff?from=${from}&to=${to}`),
  restore: (id, number) => request<DocumentDetail>(`/documents/${id}/versions/${number}/restore`, { method: 'POST' }),
  validate: (id) => request<ValidationResult>(`/documents/${id}/validate`, { method: 'POST' }),
  async validation(id) {
    try {
      return await request<ValidationResult>(`/documents/${id}/validation`)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_validated') return null
      throw e
    }
  },
  xml: (id) => request<XmlPreview>(`/documents/${id}/xml`),
  downloadXml: (id, filename) => downloadFile(`/documents/${id}/xml/download`, filename),
  importPreview: (input) => request<ImportReport>('/documents/import/preview', { method: 'POST', body: input }),
  importCreate: (input) => request<{ document: DocumentDetail; report: ImportReport }>('/documents/import', { method: 'POST', body: input }),
  archive: (id) => request<DocumentDetail>(`/documents/${id}/archive`, { method: 'POST' }),
  restoreFromArchive: (id) => request<DocumentDetail>(`/documents/${id}/restore`, { method: 'POST' }),
  bulk: (ids, action: BulkAction) => request<BulkResult>('/documents/bulk', { method: 'POST', body: { ids: ids.map(Number), action } }),
  async bulkXml(ids) {
    const h = await fetchDownload('/documents/bulk/xml', 'explanatory_notes.zip', { method: 'POST', body: { ids: ids.map(Number) } })
    return { exported: Number(h.get('X-Exported') ?? 0), skipped: Number(h.get('X-Skipped') ?? 0) }
  },
  authors: () => request<Author[]>('/documents/authors'),
  downloadReport: (id) => downloadFile(`/documents/${id}/validation/report`, `validation_report_${id}.txt`),
}

export const httpSchemas: SchemaService = {
  list: (includeInactive = false) => request<SchemaInfo[]>(`/schemas${includeInactive ? '?includeInactive=true' : ''}`),
  upload: (input) => request<SchemaInfo>('/schemas', { method: 'POST', body: input }),
  update: (id, patch) => request<SchemaInfo>(`/schemas/${id}`, { method: 'PATCH', body: patch }),
  makeDefault: (id) => request<SchemaInfo>(`/schemas/${id}/default`, { method: 'POST' }),
  remove: (id) => request<void>(`/schemas/${id}`, { method: 'DELETE' }),
  structure: (id) => request<StructureNode[]>(`/schemas/${id}/structure`),
  download: (id, filename) => downloadFile(`/schemas/${id}/xsd`, filename),
}

export const httpSearch = {
  global: (q: string) => request<SearchResult>(`/search?q=${encodeURIComponent(q)}`),
}
