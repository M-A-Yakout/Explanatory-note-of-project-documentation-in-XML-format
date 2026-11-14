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
