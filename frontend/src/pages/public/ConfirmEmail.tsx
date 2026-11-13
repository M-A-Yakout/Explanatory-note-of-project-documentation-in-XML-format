import React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CircleCheck, Clock, Loader2, Mail } from 'lucide-react'
import { AuthLayout } from '../../shared/components/AuthLayout'
import { Button, FormField, Input, PasswordInput, TextLink } from '../../shared/components/ui'
import { inviteSchema, type InviteValues } from '../../shared/validation/auth'
import { t } from '../../shared/i18n'

/** Routes: /confirm/:token (email confirmation) and /invite/:token (invitation) · Public */
export const args = {
  mode: 'emailSent',
  email: 'a.kovaleva@psi-proekt.ru',
}

export const argTypes = {
  mode: {
    control: 'select',
    options: ['emailSent', 'confirming', 'confirmed', 'expired', 'invite', 'inviteAccepting'],
  },
  email: { control: 'text' },
}

type Props = Partial<typeof args> & {
  onContinue?: () => void
  onLogin?: () => void
  onResend?: () => void
  onAccept?: (values: InviteValues) => void
  /** Prototype only: stands in for clicking the link in the email. */
  onOpenLink?: () => void
}

export default function Confirm(props: Props) {
  const { mode, email, onContinue, onLogin, onResend, onAccept, onOpenLink } = { ...args, ...props }

  if (mode === 'invite' || mode === 'inviteAccepting') {
    return <Invite email={email} accepting={mode === 'inviteAccepting'} onAccept={onAccept} onLogin={onLogin} />
  }

  const view = {
    emailSent: {
      icon: <Mail className="size-5" aria-hidden />,
      tint: 'bg-primary-soft text-primary',
      title: 'Подтвердите почту',
      body: (
        <>
          Мы отправили письмо на <span className="font-medium text-fg">{email}</span>. Перейдите по ссылке в нём, чтобы
          активировать учётную запись. Ссылка действует 24 часа.
        </>
      ),
    },
    confirming: {
      icon: <Loader2 className="size-5 animate-spin" aria-hidden />,
      tint: 'bg-surface-2 text-muted',
      title: 'Подтверждаем адрес…',
      body: 'Это займёт пару секунд.',
    },
    confirmed: {
      icon: <CircleCheck className="size-5" aria-hidden />,
      tint: 'bg-success-soft text-success',
      title: 'Почта подтверждена',
      body: 'Запрос на вступление в ООО «ПроектСтройИнжиниринг» отправлен администратору. Пока он рассматривается, вы можете войти и заполнить профиль.',
    },
    expired: {
      icon: <Clock className="size-5" aria-hidden />,
      tint: 'bg-warning-soft text-warning',
      title: 'Ссылка устарела',
      body: 'Ссылка подтверждения действует 24 часа. Отправим новую на тот же адрес.',
    },
  }[mode as 'emailSent' | 'confirming' | 'confirmed' | 'expired']

  return (
    <AuthLayout>
      <span className={'grid size-11 place-items-center rounded-full ' + view.tint}>{view.icon}</span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">{view.title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted" aria-live="polite">
        {view.body}
      </p>

      {mode === 'emailSent' && (
        <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={onResend}>
            Отправить письмо повторно
          </Button>
          {onOpenLink && (
            <Button variant="ghost" onClick={onOpenLink}>
              Открыть ссылку из письма
            </Button>
          )}
        </div>
      )}
      {mode === 'confirmed' && (
        <Button size="lg" className="mt-8 w-full" onClick={onContinue}>
          {t('common.login')}
        </Button>
      )}
      {mode === 'expired' && (
        <Button size="lg" className="mt-8 w-full" onClick={onResend}>
          Отправить новую ссылку
        </Button>
      )}
    </AuthLayout>
  )
}

function Invite({
  email,
  accepting,
  onAccept,
  onLogin,
}: {
  email: string
  accepting: boolean
  onAccept?: (values: InviteValues) => void
  onLogin?: () => void
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InviteValues>({ resolver: zodResolver(inviteSchema), defaultValues: { fullName: '', password: '', confirm: '' } })

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold tracking-tight">Приглашение в организацию</h1>
      <div className="mt-5 rounded-lg border border-border bg-surface p-4 text-sm">
        <p className="leading-6 text-muted">
          <span className="font-medium text-fg">Мельников Дмитрий Олегович</span> приглашает вас в
        </p>
        <p className="mt-1 font-semibold">ООО «ПроектСтройИнжиниринг»</p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Роль</dt>
          <dd>{t('roles.designer')}</dd>
          <dt className="text-muted">Почта</dt>
          <dd className="truncate">{email}</dd>
          <dt className="text-muted">Действует до</dt>
          <dd>19 марта 2026</dd>
        </dl>
      </div>

      <form noValidate onSubmit={handleSubmit((v) => onAccept?.(v))} className="mt-6 flex flex-col gap-5">
        <FormField label={t('auth.fullName')} required error={errors.fullName?.message}>
          {(p) => <Input {...p} autoComplete="name" {...register('fullName')} />}
        </FormField>
        <FormField label="Придумайте пароль" required error={errors.password?.message} hint="Не короче 10 символов, с заглавной буквой и цифрой">
          {(p) => <PasswordInput {...p} autoComplete="new-password" {...register('password')} />}
        </FormField>
        <FormField label={t('auth.passwordConfirm')} required error={errors.confirm?.message}>
          {(p) => <PasswordInput {...p} autoComplete="new-password" {...register('confirm')} />}
        </FormField>
        <Button type="submit" size="lg" loading={accepting} className="w-full">
          Принять приглашение
        </Button>
      </form>
      <p className="mt-8 text-sm text-muted">
        Уже есть учётная запись? <TextLink onClick={onLogin}>Войдите</TextLink>, чтобы добавить организацию к ней.
      </p>
    </AuthLayout>
  )
}
