import React from 'react'
import { FileCheck2 } from 'lucide-react'
import { Logo } from './Logo'

/**
 * Two-pane auth layout: the form on the left, a quiet panel on the right
 * that shows what the user is signing in to (a real validation summary),
 * collapsed on phones.
 */
export function AuthLayout({
  children,
  onLogo,
  aside = true,
}: {
  children: React.ReactNode
  onLogo?: () => void
  aside?: boolean
}) {
  return (
    <div className="flex min-h-screen w-full bg-bg text-fg">
      <div className="flex min-w-0 flex-1 flex-col px-5 py-6 sm:px-10">
        <button type="button" onClick={onLogo} className="self-start rounded outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo />
        </button>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[420px]">{children}</div>
        </main>
        <footer className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
          <span>© 2026 ПЗ Генератор</span>
          <span>Поддержка: support@pz-xml.ru</span>
        </footer>
      </div>
      {aside && (
        <aside className="hidden w-[44%] max-w-[600px] flex-col justify-between border-l border-border bg-surface p-10 lg:flex">
          <div />
          <div className="rounded-lg border border-border bg-bg p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileCheck2 className="size-4 text-success" aria-hidden />
              ПЗ — Школа на 1100 мест, Опалиха
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted">Схема</dt>
              <dd className="font-mono text-[13px]">ExplanatoryNote 01.05</dd>
              <dt className="text-muted">Проверка XSD</dt>
              <dd className="text-success">Пройдена</dd>
              <dt className="text-muted">Бизнес-правила</dt>
              <dd>1 предупреждение</dd>
              <dt className="text-muted">Версия</dt>
              <dd>11 · 6 марта, 16:40</dd>
            </dl>
            <pre className="mt-4 overflow-hidden rounded-md bg-surface-2 p-3 font-mono text-[12px] leading-5 text-muted">
{`<ExplanatoryNote SchemaVersion="01.05">
  <ObjectInfo>
    <Name>Общеобразовательная школа…</Name>
    <CadastralNumber>50:11:0020406:3381</CadastralNumber>
  </ObjectInfo>`}
            </pre>
          </div>
          <p className="max-w-[440px] text-sm leading-6 text-muted">
            Формирование раздела «Пояснительная записка» по XML-схемам Минстроя России — с проверкой до отправки в экспертизу.
          </p>
        </aside>
      )}
    </div>
  )
}
