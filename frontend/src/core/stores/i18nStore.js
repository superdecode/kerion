import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import es from './locales/es.js'
import zh from './locales/zh.js'

// Both supported dictionaries are loaded atomically. Lazy-loading Chinese caused
// tooltips mounted during the first render to receive the Spanish fallback and, in
// long-lived table rows, keep that stale label until another render occurred.
const loaded = { es, zh }

const localeLoaders = {}

function makeTFunc(locale) {
  return (key) => loaded[locale]?.[key] || es[key] || key
}

async function ensureLocale(locale, set, get) {
  if (loaded[locale] || !localeLoaders[locale]) return
  try {
    const mod = await localeLoaders[locale]()
    loaded[locale] = mod.default
    // Only rebuild t if this locale is still the active one when the load lands.
    if (get().locale === locale) set({ t: makeTFunc(locale) })
  } catch (e) {
    // Keep the Spanish fallback on failure — never break the UI over i18n.
    console.error('[i18n] failed to load locale', locale, e?.message)
  }
}

export const useI18nStore = create(
  persist(
    (set, get) => ({
      locale: 'es',
      t: makeTFunc('es'),
      setLocale: (locale) => {
        set({ locale, t: makeTFunc(locale) })
        ensureLocale(locale, set, get)
      },
    }),
    {
      name: 'wms-i18n',
      partialize: (s) => ({ locale: s.locale }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.t = makeTFunc(state.locale)
        // A returning user whose stored locale is lazy needs it fetched now.
        if (state.locale !== 'es') {
          ensureLocale(state.locale, useI18nStore.setState, useI18nStore.getState)
        }
      },
    }
  )
)
