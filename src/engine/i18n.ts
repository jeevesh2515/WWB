import en from '../i18n/en.json'

export type Dictionary = Record<string, string>
const DICT: Dictionary = en

/** English-only text lookup; keeps UI copy in one dictionary with `{name}` placeholders. */
export class I18n {
  readonly locale = 'en'
  constructor() {
    document.documentElement.lang = 'en'
  }
  t(key: string, vars: Record<string, string | number> = {}): string {
    const text = DICT[key] ?? key
    return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`))
  }
}

export function translate(key: string, vars: Record<string, string | number> = {}): string {
  const text = DICT[key] ?? key
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`))
}

export const DICTIONARY_KEYS = Object.keys(en)
