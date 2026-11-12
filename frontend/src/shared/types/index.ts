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
  progress: number
  errorsCount: number
  warningsCount: number
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
