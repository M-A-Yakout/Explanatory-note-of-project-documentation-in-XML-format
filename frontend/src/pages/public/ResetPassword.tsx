import React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CircleCheck, Clock } from 'lucide-react'
import { AuthLayout } from '../../shared/components/AuthLayout'
import { Button, FormField, PasswordInput } from '../../shared/components/ui'
import { resetSchema, type ResetValues } from '../../shared/validation/auth'
import { t } from '../../shared/i18n'

/** Route: /reset-password/:token · Public */
export const args = {
  state: 'default',
}

export const argTypes = {
  state: { control: 'select', options: ['default', 'submitting', 'done', 'expired'] },
}

type Props = Partial<typeof args> & {
  onSubmit?: (values: ResetValues) => void
  onLogin?: () => void
  onRequestNew?: () => void
}

export default function ResetPassword(props: Props) {
  const { state, onSubmit, onLogin, onRequestNew } = { ...args, ...props }
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetValues>({ resolver: zodResolver(resetSchema), defaultValues: { password: '', confirm: '' } })

  if (state === 'done' || state === 'expired') {
    const done = state === 'done'
    return (
      <AuthLayout>
        <span
          className={
            'grid size-11 place-items-center rounded-full ' + (done ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')
          }
        >
          {done ? <CircleCheck className="size-5" aria-hidden /> : <Clock className="size-5" aria-hidden />}
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{done ? t('auth.resetDone') : t('auth.resetExpired')}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          {done
            ? 'Все остальные сессии завершены. Войдите с новым паролем.'
            : 'Ссылка для сброса действует 60 минут и срабатывает один раз. Запросите новую.'}
        </p>
        <Button size="lg" className="mt-8 w-full" onClick={done ? onLogin : onRequestNew}>
          {done ? t('common.login') : 'Запросить новую ссылку'}
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold tracking-tight">{t('auth.resetTitle')}</h1>
      <p className="mt-2 text-sm leading-6 text-muted">{t('auth.resetLead')}</p>
      <form noValidate onSubmit={handleSubmit((v) => onSubmit?.(v))} className="mt-6 flex flex-col gap-5">
        <FormField
          label={t('auth.password')}
          required
          error={errors.password?.message}
          hint="Не короче 10 символов, с заглавной буквой и цифрой"
        >
          {(p) => <PasswordInput {...p} autoComplete="new-password" {...register('password')} />}
        </FormField>
        <FormField label={t('auth.passwordConfirm')} required error={errors.confirm?.message}>
          {(p) => <PasswordInput {...p} autoComplete="new-password" {...register('confirm')} />}
        </FormField>
        <Button type="submit" size="lg" loading={state === 'submitting'} className="w-full">
          {t('auth.resetSubmit')}
        </Button>
      </form>
    </AuthLayout>
  )
}
