import React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { AuthLayout } from '../../shared/components/AuthLayout'
import { Alert, Button, FormField, Input, TextLink } from '../../shared/components/ui'
import { forgotSchema, type ForgotValues } from '../../shared/validation/auth'
import { t } from '../../shared/i18n'

/** Route: /forgot-password · Public */
export const args = {
  state: 'default',
  email: 'a.kovaleva@psi-proekt.ru',
}

export const argTypes = {
  state: { control: 'select', options: ['default', 'submitting', 'sent', 'error'] },
  email: { control: 'text' },
}

type Props = Partial<typeof args> & {
  onSubmit?: (values: ForgotValues) => void
  onBack?: () => void
  /** Prototype only: stands in for clicking the link in the email. */
  onOpenLink?: () => void
}

export default function ForgotPassword(props: Props) {
  const { state, email, onSubmit, onBack, onOpenLink } = { ...args, ...props }
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema), defaultValues: { email } })

  return (
    <AuthLayout>
      <button
        type="button"
        onClick={onBack}
        className="mb-8 inline-flex items-center gap-1.5 rounded text-sm text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Ко входу
      </button>

      {state === 'sent' ? (
        <div>
          <span className="grid size-11 place-items-center rounded-full bg-success-soft text-success">
            <MailCheck className="size-5" aria-hidden />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">{t('auth.forgotSent')}</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Если адрес <span className="font-medium text-fg">{getValues('email') || email}</span> зарегистрирован, на него
            придёт письмо со ссылкой. Ссылка действует 60 минут. Письма нет? Проверьте папку «Спам».
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => onSubmit?.({ email: getValues('email') || email })}>
              Отправить ещё раз
            </Button>
            {onOpenLink && (
              <Button variant="ghost" onClick={onOpenLink}>
                Открыть ссылку из письма
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">{t('auth.forgotTitle')}</h1>
          <p className="mt-2 text-sm leading-6 text-muted">{t('auth.forgotLead')}</p>
          {state === 'error' && (
            <div className="mt-6">
              <Alert tone="error" title="Не удалось отправить письмо">
                Почтовый сервис временно недоступен. Повторите через минуту.
              </Alert>
            </div>
          )}
          <form noValidate onSubmit={handleSubmit((v) => onSubmit?.(v))} className="mt-6 flex flex-col gap-5">
            <FormField label={t('auth.email')} required error={errors.email?.message}>
              {(p) => <Input {...p} type="email" autoComplete="email" {...register('email')} />}
            </FormField>
            <Button type="submit" size="lg" loading={state === 'submitting'} className="w-full">
              {t('auth.forgotSend')}
            </Button>
          </form>
          <p className="mt-8 text-sm text-muted">
            Вспомнили пароль? <TextLink onClick={onBack}>{t('common.login')}</TextLink>
          </p>
        </>
      )}
    </AuthLayout>
  )
}
