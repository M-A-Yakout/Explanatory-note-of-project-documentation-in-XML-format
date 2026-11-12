import type { Role } from '../types'

/**
 * Single source of truth for every route of the service.
 * `roles: 'public'` routes are open; `roles: 'any'` needs a session;
 * a role list restricts access. In the real app this table feeds
 * React Router (see README) and the sidebar.
 */
export type RouteAccess = 'public' | 'any' | Role[]

export interface RouteDef {
  key: string
  path: string
  title: string
  roles: RouteAccess
  group: 'public' | 'common' | 'projects' | 'documents' | 'admin'
  /** Shown in the sidebar for permitted roles. */
  nav?: boolean
}

const ALL: Role[] = ['super_admin', 'org_admin', 'designer', 'expert']
const EDITORS: Role[] = ['super_admin', 'org_admin', 'designer']
const ADMINS: Role[] = ['super_admin', 'org_admin']

export const routes: RouteDef[] = [
  // Public
  { key: 'landing', path: '/', title: 'Главная', roles: 'public', group: 'public' },
  { key: 'register', path: '/register', title: 'Регистрация', roles: 'public', group: 'public' },
  { key: 'login', path: '/login', title: 'Вход', roles: 'public', group: 'public' },
  { key: 'forgot', path: '/forgot-password', title: 'Восстановление пароля', roles: 'public', group: 'public' },
  { key: 'reset', path: '/reset-password/:token', title: 'Новый пароль', roles: 'public', group: 'public' },
  { key: 'confirm', path: '/confirm/:token', title: 'Подтверждение', roles: 'public', group: 'public' },
  { key: 'forbidden', path: '/403', title: 'Доступ запрещён', roles: 'public', group: 'public' },
  { key: 'notFound', path: '*', title: 'Страница не найдена', roles: 'public', group: 'public' },

  // Common
  { key: 'dashboard', path: '/app', title: 'Рабочий стол', roles: ALL, group: 'common', nav: true },
  { key: 'profile', path: '/app/profile', title: 'Профиль', roles: ALL, group: 'common' },
  { key: 'notifications', path: '/app/notifications', title: 'Уведомления', roles: ALL, group: 'common' },

  // Projects
  { key: 'projects', path: '/app/projects', title: 'Объекты', roles: ALL, group: 'projects', nav: true },
  { key: 'projectNew', path: '/app/projects/new', title: 'Новый объект', roles: EDITORS, group: 'projects' },
  { key: 'projectEdit', path: '/app/projects/:id/edit', title: 'Редактирование объекта', roles: EDITORS, group: 'projects' },
  { key: 'projectDetails', path: '/app/projects/:id', title: 'Карточка объекта', roles: ALL, group: 'projects' },

  // Documents
  { key: 'documents', path: '/app/documents', title: 'Пояснительные записки', roles: ALL, group: 'documents', nav: true },
  { key: 'documentNew', path: '/app/documents/new', title: 'Новый документ', roles: EDITORS, group: 'documents' },
  { key: 'documentImport', path: '/app/documents/import', title: 'Импорт XML', roles: EDITORS, group: 'documents' },
  { key: 'documentEditor', path: '/app/documents/:id/edit', title: 'Редактор', roles: EDITORS, group: 'documents' },
  { key: 'documentValidation', path: '/app/documents/:id/validation', title: 'Проверка', roles: ALL, group: 'documents' },
  { key: 'documentPreview', path: '/app/documents/:id/preview', title: 'Просмотр XML', roles: ALL, group: 'documents' },
  { key: 'documentExport', path: '/app/documents/:id/export', title: 'Выгрузка', roles: ALL, group: 'documents' },
  { key: 'documentVersions', path: '/app/documents/:id/versions', title: 'Версии', roles: ALL, group: 'documents' },
  { key: 'archive', path: '/app/archive', title: 'Архив', roles: EDITORS, group: 'documents', nav: true },

  // Administration
  { key: 'adminDashboard', path: '/admin', title: 'Обзор системы', roles: ADMINS, group: 'admin', nav: true },
  { key: 'adminUsers', path: '/admin/users', title: 'Пользователи', roles: ADMINS, group: 'admin', nav: true },
  { key: 'adminOrgs', path: '/admin/organizations', title: 'Организации', roles: ['super_admin'], group: 'admin', nav: true },
  { key: 'adminSchemas', path: '/admin/schemas', title: 'XML-схемы', roles: ['super_admin'], group: 'admin', nav: true },
  { key: 'adminAudit', path: '/admin/audit', title: 'Журнал аудита', roles: ADMINS, group: 'admin', nav: true },
  { key: 'adminSettings', path: '/admin/settings', title: 'Настройки системы', roles: ['super_admin'], group: 'admin', nav: true },
]

export type GuardResult = { ok: true } | { ok: false; redirect: 'login' | 'forbidden' }

/** Route guard: the same check the router's <RequireRole> wrapper runs. */
export function guard(route: RouteDef, role: Role | null): GuardResult {
  if (route.roles === 'public') return { ok: true }
  if (!role) return { ok: false, redirect: 'login' }
  if (route.roles === 'any' || route.roles.includes(role)) return { ok: true }
  return { ok: false, redirect: 'forbidden' }
}

export function navFor(role: Role) {
  return routes.filter((r) => r.nav && guard(r, role).ok)
}

export function findRoute(key: string) {
  return routes.find((r) => r.key === key)
}
