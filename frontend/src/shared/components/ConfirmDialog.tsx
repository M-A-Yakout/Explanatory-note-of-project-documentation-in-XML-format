import React, { useEffect, useRef } from 'react'
import { Button } from './ui'

/** Modal confirmation for destructive actions. Esc / backdrop click cancel; focus starts on "Отмена". */
export function ConfirmDialog({
  open, title, children, confirmLabel = 'Подтвердить', busy, onConfirm, onCancel,
}: {
  open: boolean
  title: string
  children: React.ReactNode
  confirmLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const h = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, busy, onCancel])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl">
        <h2 id="confirm-title" className="text-base font-semibold">{title}</h2>
        <div className="mt-2 text-sm text-muted">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel} className="inline-flex h-10 items-center rounded-md border border-border-strong bg-surface px-4 text-sm hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-primary">Отмена</button>
          <Button variant="danger" loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}
