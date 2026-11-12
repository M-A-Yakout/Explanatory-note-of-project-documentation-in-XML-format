import { z } from 'zod'
import { t } from '../i18n'

export const emailField = z.string().trim().min(1, t('validation.required')).email(t('validation.email'))

export const passwordField = z
  .string()
  .min(10, t('validation.passwordMin'))
  .regex(/[A-ZА-ЯЁ]/, t('validation.passwordUpper'))
  .regex(/\d/, t('validation.passwordDigit'))

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, t('validation.required')),
  remember: z.boolean(),
})
export type LoginValues = z.infer<typeof loginSchema>

export const forgotSchema = z.object({ email: emailField })
export type ForgotValues = z.infer<typeof forgotSchema>

export const resetSchema = z
  .object({ password: passwordField, confirm: z.string().min(1, t('validation.required')) })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: t('validation.passwordMismatch') })
export type ResetValues = z.infer<typeof resetSchema>

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1, t('validation.required'))
      .refine((v) => v.split(/\s+/).length >= 2, t('validation.fullName')),
    email: emailField,
    password: passwordField,
    confirm: z.string().min(1, t('validation.required')),
    orgMode: z.enum(['join', 'create']),
    organizationId: z.string().optional(),
    orgName: z.string().optional(),
    orgInn: z.string().optional(),
    terms: z.literal(true, { errorMap: () => ({ message: t('validation.terms') }) }),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: t('validation.passwordMismatch') })
  .superRefine((v, ctx) => {
    if (v.orgMode === 'join' && !v.organizationId) {
      ctx.addIssue({ code: 'custom', path: ['organizationId'], message: t('auth.orgSelect') })
    }
    if (v.orgMode === 'create') {
      if (!v.orgName?.trim()) ctx.addIssue({ code: 'custom', path: ['orgName'], message: t('validation.required') })
      if (!/^\d{10}$/.test(v.orgInn ?? '')) ctx.addIssue({ code: 'custom', path: ['orgInn'], message: t('validation.inn') })
    }
  })
export type RegisterValues = z.infer<typeof registerSchema>

export const inviteSchema = z
  .object({
    fullName: z.string().trim().min(1, t('validation.required')),
    password: passwordField,
    confirm: z.string().min(1, t('validation.required')),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: t('validation.passwordMismatch') })
export type InviteValues = z.infer<typeof inviteSchema>
