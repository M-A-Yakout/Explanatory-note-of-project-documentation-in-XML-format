import React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AuthLayout } from '../../shared/components/AuthLayout'
import { Alert, Button, Checkbox, FormField, Input, PasswordInput, TextLink } from '../../shared/components/ui'
import { loginSchema, type LoginValues } from '../../shared/validation/auth'
import { t } from '../../shared/i18n'

/** Route: /login · Public (signed-in users are redirected to /app) */
export const args = {
  state: 'default',
  email: 'a.kovaleva@psi-proekt.ru',
}

export const argTypes = {
  state: { control: 'select', options: ['default', 'submitting', 'error', 'locked', 'sessionExpired'] },
  email: { control: 'text' },
}

type Props = Partial<typeof args> & {
  onSubmit?: (values: LoginValues) => void
  onForgot?: () => void
  onRegister?: () => void
  onHome?: () => void
}

export default function Login(props: Props) {
  const { state, email, onSubmit, onForgot, onRegister, onHome } = { ...args, ...props }
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email, password: '', remember: true },
  })
  const submitting = state === 'submitting'

  return (
    <AuthLayout onLogo={onHome}>
      <h1 className="text-2xl font-semibold tracking-tight">{t('auth.loginTitle')}</h1>
      <p className="mt-2 text-sm leading-6 text-muted">{t('auth.loginLead')}</p>

      <div className="mt-6 empty:hidden">
        {state === 'error' && <Alert tone="error" title={t('auth.loginError')} />}
        {state === 'locked' && (
          <Alert tone="error" title={t('auth.loginLocked')}>
            Обратитесь к администратору: d.melnikov@psi-proekt.ru
          </Alert>
        )}
        {state === 'sessionExpired' && (
          <Alert tone="info" title="Сессия завершена">
            Вы не работали 30 минут. Войдите снова — несохранённые черновики восстановятся автоматически.
          </Alert>
        )}
      </div>

      <form noValidate onSubmit={handleSubmit((v) => onSubmit?.(v))} className="mt-6 flex flex-col gap-5">
        <FormField label={t('auth.email')} required error={errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" {...register('email')} />}
        </FormField>
        <FormField
          label={t('auth.password')}
          required
          error={errors.password?.message}
          action={
            <TextLink className="text-sm" onClick={onForgot}>
              {t('auth.forgot')}
            </TextLink>
          }
        >
          {(p) => <PasswordInput {...p} autoComplete="current-password" {...register('password')} />}
        </FormField>
        <Checkbox label={t('auth.remember')} {...register('remember')} />
        <Button type="submit" size="lg" loading={submitting} disabled={state === 'locked'} className="mt-1 w-full">
          {submitting ? 'Входим…' : t('common.login')}
        </Button>
      </form>

      <p className="mt-8 text-sm text-muted">
        {t('auth.noAccount')} <TextLink onClick={onRegister}>{t('common.register')}</TextLink>
      </p>
    </AuthLayout>
  )
}
