import type { ConstructionType, DocumentStatus, ProjectStatus, Role } from '../types'

export const constructionTypeLabel: Record<ConstructionType, string> = {
  new: 'Новое строительство',
  reconstruction: 'Реконструкция',
  overhaul: 'Капитальный ремонт',
  linear: 'Линейный объект',
}

export const projectStatusLabel: Record<ProjectStatus, string> = {
  active: 'В работе',
  on_hold: 'Приостановлен',
  completed: 'Завершён',
  archived: 'В архиве',
}

export const canEdit = (role: Role) => role !== 'expert'
export const isAdmin = (role: Role) => role === 'super_admin' || role === 'org_admin'

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU')
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })

export const documentStatusLabel: Record<DocumentStatus, string> = {
  draft: 'Черновик', in_review: 'На проверке', validated: 'Проверен', archived: 'В архиве',
}
export const documentTone = { draft: 'neutral', in_review: 'warning', validated: 'success', archived: 'neutral' } as const

export const roleLabel: Record<Role, string> = {
  super_admin: 'Супер-администратор', org_admin: 'Администратор организации', designer: 'Проектировщик', expert: 'Эксперт',
}

export const noticeKindLabel: Record<string, string> = {
  validation: 'Проверка', version: 'Версии', archive: 'Архив', invitation: 'Приглашения',
}

const ACTIONS: Record<string, string> = {
  'auth.login': 'Вход в систему', 'auth.login_failed': 'Неудачный вход', 'auth.register': 'Регистрация',
  'auth.password_reset': 'Сброс пароля по ссылке', 'auth.password_changed': 'Смена пароля', 'auth.password_change_failed': 'Неудачная смена пароля',
  'user.invited': 'Приглашение отправлено', 'user.invite_accepted': 'Приглашение принято', 'user.invite_revoked': 'Приглашение отозвано',
  'user.updated': 'Изменены данные пользователя', 'user.blocked': 'Пользователь заблокирован', 'user.unblocked': 'Пользователь разблокирован',
  'user.role_changed': 'Изменена роль', 'user.password_reset_sent': 'Отправлена ссылка для смены пароля',
  'org.created': 'Организация создана', 'org.updated': 'Организация изменена', 'org.deactivated': 'Организация отключена', 'org.activated': 'Организация включена',
  'schema.uploaded': 'Схема загружена', 'schema.activated': 'Схема активирована', 'schema.deactivated': 'Схема отключена',
  'schema.updated': 'Схема изменена', 'schema.default_changed': 'Схема по умолчанию изменена', 'schema.deleted': 'Схема удалена',
  'project.created': 'Объект создан', 'project.deleted': 'Объект удалён',
  'document.created': 'Документ создан', 'document.imported': 'Документ импортирован', 'document.archived': 'Документ в архиве',
  'document.restored': 'Документ восстановлен', 'document.deleted': 'Документ удалён навсегда', 'document.validated': 'Проверка документа',
  'document.exported': 'XML выгружен', 'document.version_saved': 'Версия сохранена', 'document.version_restored': 'Версия восстановлена',
  'settings.updated': 'Настройки системы изменены',
}
export const auditActionLabel = (code: string) => ACTIONS[code] ?? code
export const auditActionCodes = Object.keys(ACTIONS)

/** Notification links point at the editor; experts only have the read-only pages. */
export const noticeLink = (role: Role, link: string | null) => (link && role === 'expert' ? link.replace(/\/edit$/, '/versions') : link)
