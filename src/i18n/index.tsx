import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react"
import { en, type MessageKey } from "./en"
import { es } from "./es"

export type Lang = "en" | "es"
const TABLES: Record<Lang, Record<MessageKey, string>> = { en, es }
const LANG_KEY = "p2p.lang"

export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === "en" || saved === "es") return saved
  } catch {
    // Storage blocked: fall back to the browser language.
  }
  return navigator.language.toLowerCase().startsWith("es") ? "es" : "en"
}

export function translate(
  lang: Lang,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const template = TABLES[lang][key]
  if (!vars) return template
  const fmt = new Intl.NumberFormat(lang)
  return template.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = vars[name]
    if (v === undefined) return m
    return typeof v === "number" ? fmt.format(v) : v
  })
}

type I18n = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
  n: (value: number) => string
}

const I18nContext = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    document.documentElement.lang = next
    try {
      localStorage.setItem(LANG_KEY, next)
    } catch {
      // Not persisted; fine.
    }
  }, [])
  const value = useMemo<I18n>(() => {
    const fmt = new Intl.NumberFormat(lang)
    return {
      lang,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
      n: (v) => fmt.format(v),
    }
  }, [lang, setLang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error("useI18n outside I18nProvider")
  return ctx
}
