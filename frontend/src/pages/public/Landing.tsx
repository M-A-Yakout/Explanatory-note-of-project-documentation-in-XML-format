import React from 'react'
import { ArrowRight, CircleAlert, TriangleAlert } from 'lucide-react'
import { Button, cn } from '../../shared/components/ui'
import { Logo } from '../../shared/components/Logo'
import { t } from '../../shared/i18n'

export const args = {
  signedIn: false,
}

export const argTypes = {
  signedIn: { control: 'boolean' },
}

type Props = Partial<typeof args> & {
  onLogin?: () => void
  onRegister?: () => void
  onDashboard?: () => void
}

export default function Landing(props: Props) {
  const { signedIn, onLogin, onRegister, onDashboard } = { ...args, ...props }

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-5 sm:px-8">
          <Logo />
          <nav className="flex items-center gap-2">
            {signedIn ? (
              <Button onClick={onDashboard}>
                {t('common.toDashboard')}
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={onLogin}>
                  {t('common.login')}
                </Button>
                <Button onClick={onRegister} className="hidden sm:inline-flex">
                  {t('common.register')}
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* Hero: what it is, and a real look at the product */}
        <section className="mx-auto grid max-w-[1200px] items-center gap-12 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:pt-20">
          <div className="min-w-0">
            <h1 className="text-[34px] font-semibold leading-[1.15] tracking-tight sm:text-[44px]">
              Пояснительная записка в XML — без ошибок схемы на экспертизе
            </h1>
            <p className="mt-5 max-w-[520px] text-base leading-7 text-muted sm:text-lg">
              Заполните раздел в веб-формах, а сервис соберёт XML по действующей схеме Минстроя России, проверит его по XSD
              и бизнес-правилам и подготовит файл для государственной или негосударственной экспертизы.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {signedIn ? (
                <Button size="lg" onClick={onDashboard}>
                  {t('common.toDashboard')}
                </Button>
              ) : (
                <>
                  <Button size="lg" onClick={onRegister}>
                    Начать работу
                  </Button>
                  <Button size="lg" variant="secondary" onClick={onLogin}>
                    У меня есть учётная запись
                  </Button>
                </>
              )}
            </div>
            <p className="mt-6 text-sm text-muted">
              Схема по умолчанию: <span className="font-mono text-fg">ExplanatoryNote 01.05</span> · обновлена 1 сентября 2024
            </p>
          </div>

          <ProductGlimpse />
        </section>

        {/* How it works — genuinely sequential, so numbered */}
        <section className="border-y border-border bg-surface">
          <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8">
            <h2 className="text-2xl font-semibold tracking-tight">От формы до файла для экспертизы</h2>
            <ol className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s, i) => (
                <li key={s.title} className="relative flex flex-col border-t-2 border-border pt-5">
                  <span className="font-mono text-sm text-primary">{i + 1}</span>
                  <h3 className="mt-2 font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Who it's for: roles differ in what they can do — a comparison table */}
        <section className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Одна запись — вся команда</h2>
              <p className="mt-3 leading-7 text-muted">
                Проектировщики заполняют, эксперты проверяют, администраторы управляют доступом. Данные каждой организации
                изолированы.
              </p>
            </div>
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border-strong text-muted">
                    <th className="py-3 pr-4 font-medium">Возможность</th>
                    {roleCols.map((r) => (
                      <th key={r} className="px-3 py-3 font-medium">
                        {t(`roles.${r}` as const)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row) => (
                    <tr key={row.label} className="border-b border-border">
                      <td className="py-3 pr-4">{row.label}</td>
                      {row.cells.map((c, i) => (
                        <td key={i} className={cn('px-3 py-3', c ? 'text-fg' : 'text-subtle')}>
                          {c ? 'Да' : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-6 px-5 py-14 sm:px-8 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Подключите организацию за один день</h2>
              <p className="mt-2 text-muted">Регистрация бесплатна, приглашения коллегам — из панели администратора.</p>
            </div>
            {!signedIn && (
              <div className="flex flex-wrap gap-3">
                <Button size="lg" onClick={onRegister}>
                  {t('common.register')}
                </Button>
                <Button size="lg" variant="secondary" onClick={onLogin}>
                  {t('common.login')}
                </Button>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-4 px-5 py-8 text-sm text-muted sm:px-8">
        <span>© 2025 ПЗ Генератор</span>
        <span>Соответствует требованиям Постановления Правительства РФ № 87 и приказам Минстроя России</span>
      </footer>
    </div>
  )
}

/** A static excerpt of the editor with its validation panel — the actual product, not an illustration. */
function ProductGlimpse() {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface shadow-xl shadow-black/[0.04]">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">ПЗ — Раздел 1. ЖК на ул. Зорге, вл. 9</p>
          <p className="text-xs text-muted">Технико-экономические показатели · сохранено 07:58</p>
        </div>
        <span className="shrink-0 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">Черновик</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="px-4 py-2 font-medium">Показатель</th>
            <th className="px-2 py-2 font-medium">Ед.</th>
            <th className="px-4 py-2 text-right font-medium">Значение</th>
          </tr>
        </thead>
        <tbody>
          {tei.map((r) => (
            <tr key={r.name} className="border-b border-border last:border-0">
              <td className="px-4 py-2.5">{r.name}</td>
              <td className="px-2 py-2.5 text-muted">{r.unit}</td>
              <td className={cn('px-4 py-2.5 text-right font-mono text-[13px]', r.bad && 'text-danger')}>
                {r.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-border bg-bg px-4 py-3">
        <p className="text-xs font-medium text-muted">Проверка · 4 ошибки, 7 предупреждений</p>
        <ul className="mt-2 space-y-1.5 text-sm">
          <li className="flex gap-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            <span>Площадь застройки больше площади участка</span>
          </li>
          <li className="flex gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>
              Не указан <span className="font-mono text-[13px]">FireResistanceDegree</span> для корпуса 2
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}

const steps = [
  { title: 'Заполните формы', body: 'Сведения об объекте, ТЭП, состав документации и нормативные ссылки — с подсказками по каждому полю.' },
  { title: 'Или загрузите XML', body: 'Импорт существующего файла с сопоставлением полей и отчётом о том, что не удалось перенести.' },
  { title: 'Проверьте', body: 'XSD-валидация и бизнес-правила. Каждая ошибка ведёт к конкретному полю формы.' },
  { title: 'Скачайте файл', body: 'Итоговый XML и протокол проверки — готово к загрузке в ЕГРЗ или негосударственную экспертизу.' },
]

const roleCols = ['designer', 'expert', 'org_admin'] as const

const matrix = [
  { label: 'Заполнение и импорт документов', cells: [true, false, true] },
  { label: 'Просмотр XML и протоколов проверки', cells: [true, true, true] },
  { label: 'Замечания к разделам', cells: [false, true, true] },
  { label: 'Выгрузка итогового XML', cells: [true, true, true] },
  { label: 'Приглашение коллег и роли', cells: [false, false, true] },
]

const tei = [
  { name: 'Площадь участка', unit: 'м²', value: '8 412,0' },
  { name: 'Площадь застройки', unit: 'м²', value: '8 960,5', bad: true },
  { name: 'Количество квартир', unit: 'шт.', value: '412' },
  { name: 'Этажность', unit: 'эт.', value: '17–24' },
]
