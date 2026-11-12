import { ru, type Dictionary } from './ru'

export type Locale = 'ru'

const dictionaries: Record<Locale, Dictionary> = { ru }

let current: Locale = 'ru'

export function setLocale(locale: Locale) {
  current = locale
}

type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>
}[keyof T & string]

export type TKey = Paths<Dictionary>

/** Look up a string by dotted key, e.g. t('auth.loginTitle'). */
export function t(key: TKey): string {
  const value = key.split('.').reduce<unknown>((node, part) => {
    return node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined
  }, dictionaries[current])
  return typeof value === 'string' ? value : key
}
