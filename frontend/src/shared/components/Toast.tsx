import React, { createContext, useCallback, useContext, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

type Tone = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  tone: Tone
  title: string
  body?: string
}

const ToastContext = createContext<(t: Omit<ToastItem, 'id'>) => void>(() => {})

export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const dismiss = (id: number) => setItems((s) => s.filter((i) => i.id !== id))
  const push = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = Date.now() + Math.random()
    setItems((s) => [...s.slice(-2), { ...toast, id }])
    setTimeout(() => dismiss(id), 5000)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(380px,calc(100%-2rem))] flex-col gap-2" aria-live="polite">
        <AnimatePresence initial={false}>
          {items.map((item) => {
            const Icon = { success: CheckCircle2, error: AlertCircle, info: Info }[item.tone]
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="pointer-events-auto flex gap-3 rounded-lg border border-border bg-surface p-3.5 shadow-lg shadow-black/5"
              >
                <Icon
                  className={
                    'mt-0.5 size-4 shrink-0 ' +
                    (item.tone === 'success' ? 'text-success' : item.tone === 'error' ? 'text-danger' : 'text-primary')
                  }
                  aria-hidden
                />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium text-fg">{item.title}</p>
                  {item.body && <p className="mt-0.5 text-muted">{item.body}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  aria-label="Закрыть"
                  className="grid size-6 place-items-center rounded text-muted hover:text-fg"
                >
                  <X className="size-4" />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
