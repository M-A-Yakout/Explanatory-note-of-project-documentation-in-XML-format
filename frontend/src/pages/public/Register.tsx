import React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check } from 'lucide-react'
import { AuthLayout } from '../../shared/components/AuthLayout'
import { Alert, Button, Checkbox, FormField, Input, PasswordInput, Select, TextLink, cn } from '../../shared/components/ui'
import { registerSchema, type RegisterValues } from '../../shared/validation/auth'
import { organizations } from '../../shared/mock/data'
import { t } from '../../shared/i18n'

/** Route: /register · Public */
export const args = {
  state: 'default',
  orgMode: 'join',
}

export const argTypes = {
  state: { control: 'select', options: ['default', 'submitting', 'emailTaken'] },
  orgMode: { control: 'radio', options: ['join', 'create'] },
}

type Props = Partial<typeof args> & {
  onSubmit?: (values: RegisterValues) => void
  onLogin?: () => void
  onHome?: () => void
}

export default function Register(props: Props) {
  const { state, orgMode, onSubmit, onLogin, onHome } = { ...args, ...props }
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: '',
      email: state === 'emailTaken' ? 'a.kovaleva@psi-proekt.ru' : '',
      password: '',
      confirm: '',
      orgMode: orgMode as RegisterValues['orgMode'],
      organizationId: '',
      orgName: '',
      orgInn: '',
    },
  })
  const mode = watch('orgMode')
  const password = watch('password') ?? ''

  return (
    <AuthLayout onLogo={onHome}>
      <h1 className="text-2xl font-semibold tracking-tight">{t('auth.registerTitle')}</h1>
      <p className="mt-2 text-sm leading-6 text-muted">{t('auth.registerLead')}</p>

      {state === 'emailTaken' && (
        <div className="mt-6">
          <Alert tone="error" title="Эта почта уже зарегистрирована">
            Войдите в существующую учётную запись или восстановите пароль.
          </Alert>
        </div>
      )}

      <form noValidate onSubmit={handleSubmit((v) => onSubmit?.(v))} className="mt-6 flex flex-col gap-5">
        <FormField label={t('auth.fullName')} required error={errors.fullName?.message}>
          {(p) => <Input {...p} autoComplete="name" placeholder="Ковалёва Анна Сергеевна" {...register('fullName')} />}
        </FormField>
        <FormField label={t('auth.email')} required error={errors.email?.message} hint="Рабочая почта — на неё придёт письмо для подтверждения">
          {(p) => (
            <Input
              {...p}
              invalid={p.invalid || state === 'emailTaken'}
              type="email"
              autoComplete="email"
              placeholder="name@company.ru"
              {...register('email')}
            />
          )}
        </FormField>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={t('auth.password')} required error={errors.password?.message}>
            {(p) => <PasswordInput {...p} autoComplete="new-password" {...register('password')} />}
          </FormField>
          <FormField label={t('auth.passwordConfirm')} required error={errors.confirm?.message}>
            {(p) => <PasswordInput {...p} autoComplete="new-password" {...register('confirm')} />}
          </FormField>
        </div>
        <ul className="-mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Требования к паролю">
          {rules.map((r) => {
            const ok = r.test(password)
            return (
              <li key={r.label} className={cn('flex items-center gap-1', ok ? 'text-success' : 'text-muted')}>
                <Check className={cn('size-3.5', !ok && 'opacity-40')} aria-hidden />
                {r.label}
              </li>
            )
          })}
        </ul>

        <fieldset className="flex flex-col gap-3 border-t border-border pt-5">
          <legend className="sr-only">{t('auth.orgMode')}</legend>
          <span className="text-sm font-medium" aria-hidden>
            {t('auth.orgMode')}
          </span>
          <div className="grid grid-cols-2 gap-1 rounded-md bg-surface-2 p-1" role="radiogroup">
            {(['join', 'create'] as const).map((m) => (
              <label
                key={m}
                className={cn(
                  'flex h-9 cursor-pointer items-center justify-center whitespace-nowrap rounded px-2 text-sm transition-colors duration-150',
                  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                  mode === m ? 'bg-surface font-medium text-fg shadow-sm' : 'text-muted hover:text-fg'
                )}
              >
                <input type="radio" value={m} className="sr-only" {...register('orgMode')} />
                {m === 'join' ? 'Существующая' : 'Новая'}
              </label>
            ))}
          </div>

          {mode === 'join' ? (
            <FormField
              label={t('auth.orgSelect')}
              required
              error={errors.organizationId?.message}
              hint="Администратор организации подтвердит ваш запрос"
            >
              {(p) => (
                <Select {...p} {...register('organizationId')}>
                  <option value="">Не выбрано</option>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} · ИНН {o.inn}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          ) : (
            <div className="grid gap-5 sm:grid-cols-[1fr_140px]">
              <FormField label={t('auth.orgName')} required error={errors.orgName?.message}>
                {(p) => <Input {...p} placeholder="ООО «Название»" {...register('orgName')} />}
              </FormField>
              <FormField label={t('auth.orgInn')} required error={errors.orgInn?.message}>
                {(p) => <Input {...p} inputMode="numeric" maxLength={10} placeholder="7704512398" {...register('orgInn')} />}
              </FormField>
              <p className="text-xs text-muted sm:col-span-2">Вы станете администратором новой организации.</p>
            </div>
          )}
        </fieldset>

        <Checkbox label={t('auth.terms')} error={errors.terms?.message} {...register('terms')} />

        <Button type="submit" size="lg" loading={state === 'submitting'} className="w-full">
          {state === 'submitting' ? 'Создаём учётную запись…' : t('common.register')}
        </Button>
      </form>

      <p className="mt-8 text-sm text-muted">
        {t('auth.hasAccount')} <TextLink onClick={onLogin}>{t('common.login')}</TextLink>
      </p>
    </AuthLayout>
  )
}

const rules = [
  { label: '10+ символов', test: (v: string) => v.length >= 10 },
  { label: 'заглавная буква', test: (v: string) => /[A-ZА-ЯЁ]/.test(v) },
  { label: 'цифра', test: (v: string) => /\d/.test(v) },
]
