import type { BulkResult } from '../../shared/types'

type Toast = (t: { tone: 'success' | 'error' | 'info'; title: string; body?: string }) => void

const plural = (n: number, one: string, few: string, many: string) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many

export const docs = (n: number) => `${n} ${plural(n, 'документ', 'документа', 'документов')}`

/** Reports the outcome of a bulk action: successes and the first failure reason, per id. */
export function reportBulk(toast: Toast, res: BulkResult, done: string) {
  if (res.okCount) toast({ tone: 'success', title: `${done}: ${docs(res.okCount)}` })
  if (res.failedCount) {
    const first = res.results.find((r) => !r.ok)
    toast({ tone: 'error', title: `Не удалось обработать: ${docs(res.failedCount)}`, body: first?.message })
  }
}
