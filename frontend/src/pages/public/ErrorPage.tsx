import React from 'react'
import { Button } from '../../shared/components/ui'
import { Logo } from '../../shared/components/Logo'
import { t } from '../../shared/i18n'

/** Routes: /403 (guard redirect) and * (any unknown path) · Public */
export const args = {
  code: '404',
  signedIn: true,
  path: '/app/documents/d-48/versions',
}

export const argTypes = {
  code: { control: 'radio', options: ['403', '404'] },
  signedIn: { control: 'boolean' },
  path: { control: 'text' },
}

type Props = Partial<typeof args> & {
  onHome?: () => void
  onBack?: () => void
}

export default function ErrorPage(props: Props) {
  const { code, signedIn, path, onHome, onBack } = { ...args, ...props }
  const forbidden = code === '403'

  return (
    <div className="flex min-h-screen flex-col bg-bg px-5 py-6 text-fg sm:px-10">
      <button type="button" onClick={onHome} className="self-start rounded outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Logo />
      </button>
      <main className="flex flex-1 items-center">
        <div className="mx-auto w-full max-w-[560px]">
          <p className="font-mono text-sm text-muted">Ошибка {code}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {forbidden ? 'Нет доступа к этому разделу' : 'Страница не найдена'}
          </h1>
          <p className="mt-4 leading-7 text-muted">
            {forbidden
              ? 'Ваша роль в организации не позволяет открыть этот раздел. Если доступ нужен для работы, попросите администратора организации изменить роль.'
              : 'Возможно, документ перенесён в архив или удалён, а ссылка устарела.'}
          </p>
          <p className="mt-4 break-all rounded-md bg-surface-2 px-3 py-2 font-mono text-[13px] text-muted">{path}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" onClick={onHome}>
              {signedIn ? t('common.toDashboard') : t('common.toHome')}
            </Button>
            <Button size="lg" variant="secondary" onClick={onBack}>
              {t('common.back')}
            </Button>
          </div>
          {forbidden && (
            <p className="mt-8 text-sm text-muted">
              Администратор вашей организации: Мельников Дмитрий Олегович, d.melnikov@psi-proekt.ru
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
