/**
 * Domain types. These mirror the planned REST contract one-to-one, so a real
 * backend can return these shapes without adapters.
 */

export type Role = 'super_admin' | 'org_admin' | 'designer' | 'expert'

export type UserStatus = 'active' | 'invited' | 'blocked'

export interface User {
  id: string
  fullName: string
  email: string
  role: Role
  status: UserStatus
  organizationIds: string[]
  activeOrganizationId: string
  position?: string
  phone?: string
  createdAt: string
  lastLoginAt?: string
}

export interface OrganizationLimits {
  maxUsers: number
  maxProjects: number
  maxStorageMb: number
}

export interface Organization {
  id: string
  name: string
  shortName: string
  inn: string
  ogrn: string
  sroNumber?: string
  address: string
  limits: OrganizationLimits
  membersCount: number
  createdAt: string
  isActive: boolean
}

export type ConstructionType = 'new' | 'reconstruction' | 'overhaul' | 'linear'

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived'

export interface Project {
  id: string
  organizationId: string
  code: string
  name: string
  address: string
  cadastralNumber: string
  constructionType: ConstructionType
  developer: string
  customer: string
  designer: string
  functionalPurpose?: string
  financingSource?: string
  status: ProjectStatus
  participantIds: string[]
  createdAt: string
  updatedAt: string
}

export type DocumentStatus = 'draft' | 'in_review' | 'validated' | 'archived'

export interface ExplanatoryNote {
  id: string
  organizationId: string
  projectId: string
  title: string
  schemaId: string
  schemaVersion: string
  status: DocumentStatus
  authorId: string
  projectName?: string
  authorName?: string
  revision?: number
  progress: number
  errorsCount: number
  warningsCount: number
  validationStale?: boolean
  archivedAt?: string | null
  archivedByName?: string | null
  currentVersion: number
  createdAt: string
  updatedAt: string
}

export interface DocumentVersion {
  id: string
  documentId: string
  version: number
  authorId: string
  comment: string
  createdAt: string
  xml: string
}

export type SchemaStatus = 'active' | 'inactive' | 'deprecated'

export interface XmlSchema {
  id: string
  name: string
  version: string
  namespace: string
  status: SchemaStatus
  isDefault: boolean
  publishedAt: string
  uploadedAt: string
  sizeKb: number
  changelog: string[]
  compatibilityNotes?: string
}

export type Severity = 'error' | 'warning' | 'info'

export type ValidationSource = 'xsd' | 'business'

export interface ValidationError {
  id: string
  documentId: string
  severity: Severity
  source: ValidationSource
  code: string
  message: string
  /** Editor section the field lives in, e.g. "object", "tei". */
  section: string
  /** Dotted path to the field inside the form model. */
  fieldPath: string
  xpath?: string
}

export type AuditAction =
  | 'login'
  | 'logout'
  | 'create'
  | 'update'
  | 'delete'
  | 'export'
  | 'validate'
  | 'restore'
  | 'role_change'

export interface AuditLog {
  id: string
  userId: string
  organizationId: string
  action: AuditAction
  entityType: 'user' | 'organization' | 'project' | 'document' | 'schema' | 'settings'
  entityId: string
  entityLabel: string
  ip: string
  createdAt: string
}

export type NotificationKind = 'validation' | 'review' | 'invite' | 'system'

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  body: string
  createdAt: string
  read: boolean
  link?: string
}

export interface Session {
  user: User
  organization: Organization
  token: string
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

// ---- document form model (mirrors backend app/document_data.py) ----
export interface ObjectInfo {
  name: string; address: string; cadastralNumber: string; constructionType: string
  developer: string; customer: string; designer: string; functionalPurpose: string; financingSource: string
}
export interface TeiRow { id: string; name: string; unit: string; value: string }
export interface CompositionItem { code: string; title: string; included: boolean; note: string }
export interface NormRef { id: string; code: string; title: string; custom: boolean }
export interface DocumentData {
  object: ObjectInfo
  tei: TeiRow[]
  composition: CompositionItem[]
  references: NormRef[]
  additional: { notes: string }
}
export type SectionKey = 'object' | 'tei' | 'composition' | 'references' | 'additional'
export interface DocumentDetail extends ExplanatoryNote {
  revision: number
  data: DocumentData
  sections: Record<SectionKey, boolean>
}
export interface VersionMeta { number: number; authorId: string; authorName: string; comment: string; createdAt: string }
export interface Change { path: string; kind: 'added' | 'removed' | 'changed'; before: unknown; after: unknown }

// ---- XSD registry (backend /api/schemas) ----
export interface SchemaInfo {
  id: string
  version: string
  title: string
  filename: string
  checksum: string
  sizeBytes: number
  isActive: boolean
  isDefault: boolean
  changelog: string
  compatibility: string
  uploadedByName: string
  documentsCount: number
  createdAt: string
  updatedAt: string
}
export interface StructureNode {
  name: string
  kind: 'element' | 'attribute'
  type: string
  required: boolean
  repeatable: boolean
  children: StructureNode[]
}

// ---- validation / XML (backend /api/documents/:id/validate, /xml) ----
export interface DocIssue {
  id: string
  severity: 'error' | 'warning' | 'info'
  source: 'business' | 'xsd'
  code: string
  message: string
  /** Form field path, e.g. object.developer or tei[r2].value; null when it cannot be located. */
  field: string | null
  section: SectionKey | null
  xpath: string | null
  line: number | null
}
export interface ValidationResult {
  issues: DocIssue[]
  errors: number
  warnings: number
  infos: number
  checkedAt: string
  revision: number
  schemaVersion: string
  xmlValid: boolean
  /** Number of findings that block export (errors, plus warnings when the admin enabled that). */
  blocking: number
  /** The document changed after this check. */
  stale: boolean
  status: DocumentStatus
}
export interface XmlPreview { xml: string; filename: string; sizeBytes: number; schemaVersion: string; xsdValid: boolean }

// ---- XML import (backend /api/documents/import) ----
export interface ImportEntry { xpath: string; element: string; status: 'skipped' | 'truncated'; message: string }
export interface ImportReport {
  filename: string
  sizeBytes: number
  detectedVersion: string | null
  usedVersion: string
  /** The version named in the file is not available: the default schema was used instead. */
  schemaFallback: boolean
  summary: { object: number; tei: number; composition: number; references: number; additional: boolean }
  skipped: ImportEntry[]
  skippedTotal: number
  truncated: ImportEntry[]
  truncatedTotal: number
  xsdValid: boolean
  xsdIssues: { code: string; message: string; line: number | null; xpath: string | null }[]
  data: DocumentData
}

// ---- archive, bulk operations, search ----
export type BulkAction = 'archive' | 'restore' | 'delete'
export interface BulkResult { results: { id: string; ok: boolean; code?: string; message?: string }[]; okCount: number; failedCount: number }
export interface Author { id: string; name: string }
export interface SearchResult {
  projects: { id: string; code: string; name: string; address: string; cadastralNumber: string }[]
  documents: { id: string; title: string; projectName: string; status: DocumentStatus; schemaVersion: string }[]
}

// ---- administration (backend /api/users, /audit, /stats, /settings, /notifications) ----
export interface Prefs { validation: boolean; versions: boolean; invitations: boolean; email: boolean }
export interface Profile {
  id: string; fullName: string; email: string; role: Role; position: string; phone: string
  organizationName: string; prefs: Prefs; createdAt: string; lastLoginAt: string | null
}
export interface UserAdmin {
  id: string; fullName: string; email: string; role: Role; status: 'active' | 'blocked'
  organizationId: string; organizationName: string; emailConfirmed: boolean; createdAt: string; lastLoginAt: string | null
}
export interface InvitationInfo {
  id: string; email: string; role: Role; organizationId: string; organizationName: string
  invitedByName: string; expiresAt: string; createdAt: string
}
export interface OrgAdmin {
  id: string; name: string; inn: string; ogrn: string; address: string; maxUsers: number; maxProjects: number
  usersCount: number; projectsCount: number; documentsCount: number; isActive: boolean; createdAt: string
}
export interface AuditEntry {
  id: string; createdAt: string; userId: string | null; userName: string; organizationId: string | null; organizationName: string
  action: string; entityType: string; entityId: string; summary: string; result: 'ok' | 'denied'; ip: string | null
}
export interface Notice { id: string; kind: string; title: string; body: string; link: string | null; read: boolean; createdAt: string }
export interface DashboardStats {
  documentsByStatus: Record<DocumentStatus, number>
  errors: number; warnings: number; staleChecks: number; unchecked: number
  projectsTotal: number; projectsActive: number; myDrafts: number
  recent: ExplanatoryNote[]
}
export interface AdminStats {
  usersTotal: number; usersActive: number; organizationsTotal: number; organizationsActive: number
  projectsTotal: number; documentsTotal: number; documentsArchived: number
  weeklyDocuments: { weekStart: string; count: number }[]
  recentAudit: AuditEntry[]
}
export interface EmailTemplate { subject: string; body: string }
export interface SystemSettings {
  maxXmlMb: number
  requireEmailConfirmation: boolean
  blockExportOnWarnings: boolean
  warnOutdatedReferences: boolean
  emailTemplates: { confirm: EmailTemplate; invite: EmailTemplate; reset: EmailTemplate }
}
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
