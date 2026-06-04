# Translation Audit Report — zh-CN (Simplified Chinese)

Date: 2026-06-03  
Project: Kirion WMS Frontend  
Auditor: Automated i18n audit

---

## Summary

| Metric | Value |
|--------|-------|
| Total zh keys (before) | 1,198 |
| Total zh keys (after)  | 1,283 |
| **Net zh keys added**  | **85** |
| es-only keys that had no zh equivalent (before) | 9 |
| Hardcoded Spanish strings replaced in JSX | 47 |
| Files modified (i18nStore + JSX) | 10 |

---

## Step 1 — Missing zh Keys Fixed

The following 9 keys existed in `es` but had no matching entry in `zh`. All have been added:

| Key | zh Translation |
|-----|---------------|
| `config.companySaved` | 公司已保存 |
| `config.channelSaved` | 通道已保存 |
| `config.noCompaniesConfigured` | 未配置公司 |
| `config.noChannelsConfigured` | 未配置通道 |
| `scan.cancelPallet` | 取消托盘 |
| `header.welcome` | 欢迎 |
| `header.language` | 语言 |
| `header.spanish` | 西班牙语 |
| `header.chinese` | 中文 |

Additionally, 76 new keys were added to both `zh` and `es` covering previously untranslated UI strings (see Step 3).

---

## Step 2 — Hardcoded Spanish Strings Found

The following files had hardcoded Spanish text not wrapped in `t()`:

| File | Strings Found |
|------|--------------|
| `src/core/components/auth/Login.jsx` | Form labels: "Usuario", "Contraseña" |
| `src/core/components/layout/Sidebar.jsx` | Button title: "Expandir", "Colapsar" |
| `src/core/components/layout/Header.jsx` | Password modal labels, validation errors, language display |
| `src/core/components/common/ConnectionBanner.jsx` | Offline/sync status messages |
| `src/core/components/common/SubscriptionGuard.jsx` | All renewal modal and blocked page text |
| `src/pages/NotFound.jsx` | 404 page title, description, buttons |
| `src/modules/fep/pages/Folios.jsx` | Excel export headers, toast error fallbacks |
| `src/modules/fep/pages/FolioDetalle.jsx` | Excel export headers, tab labels, page title, toast errors |

---

## Step 3 — Fixes Applied

### 3a. New i18n keys added to i18nStore.js

New key groups added to both `zh` and `es`:

- **`auth.*`** — Login form labels (`auth.usernameLabel`, `auth.passwordLabel`), password change modal labels and validation messages (9 new keys)
- **`nav.expand` / `nav.collapse`** — Sidebar collapse toggle tooltip
- **`notfound.*`** — 404 page text (4 keys)
- **`connection.*`** — Offline/sync banner messages (6 keys)
- **`sub.*`** — SubscriptionGuard renewal modal and blocked page (21 keys)
- **`fep.excel.*`** — FEP Excel export column headers (14 keys)
- **`fep.cancelError` / `fep.deleteError` / `fep.createError`** — FEP toast fallbacks (3 keys)

### 3b. JSX files updated

**`src/core/components/auth/Login.jsx`**  
- Replaced "Usuario" label with `t('auth.usernameLabel')`  
- Replaced "Contraseña" label with `t('auth.passwordLabel')`

**`src/core/components/layout/Sidebar.jsx`**  
- Replaced `title="Expandir"/"Colapsar"` with `t('nav.expand')` / `t('nav.collapse')`

**`src/core/components/layout/Header.jsx`**  
- Replaced 3 validation error strings with i18n keys  
- Replaced language display string `'Idioma: Español'` with `t('auth.languageLabel') + t('auth.languageEs/Zh')`  
- Replaced password-updated confirmation strings  
- Replaced 3 password modal field labels and placeholder  
- Added `useI18nStore` import (already present)

**`src/core/components/common/ConnectionBanner.jsx`**  
- Added `useI18nStore` import  
- Replaced all 5 hardcoded status strings with i18n keys  
- Replaced hardcoded sync toast messages

**`src/core/components/common/SubscriptionGuard.jsx`**  
- Added `useI18nStore` import  
- Added `const { t } = useI18nStore()` to `RenewalModal`, `BlockedPage`, and `CountdownBanner` sub-components  
- Replaced all hardcoded Spanish strings across all 3 sub-components (~25 replacements)

**`src/pages/NotFound.jsx`**  
- Added `useI18nStore` import  
- Replaced 404 page title, description, and 2 button labels

**`src/modules/fep/pages/Folios.jsx`**  
- Replaced Excel export row headers (9 strings) with `t('fep.excel.*')` keys  
- Replaced 3 toast fallback error strings

**`src/modules/fep/pages/FolioDetalle.jsx`**  
- Replaced Excel export row headers and column headers (~10 strings)  
- Replaced 2 toast error strings  
- Replaced hardcoded page title "Detalle de Folio" with `t('fep.detail.record')`  
- Replaced hardcoded loading text with `t('fep.detail.loading')`  
- Replaced static `TABS` array with `getTabConfig(t)` function for reactive labels

---

## Step 4 — Language Reactivity Fix

**Problem found:** The original `t` function was stored as a static method in Zustand state. Since the function reference never changed when locale changed, components that only destructured `t` (not `locale`) would not re-render on locale switch.

**Fix applied:** Refactored `useI18nStore` to generate a new `t` function reference whenever `setLocale` is called:

```js
function makeTFunc(locale) {
  return (key) => translations[locale]?.[key] || translations.es[key] || key
}

// setLocale now stores a new t function:
setLocale: (locale) => set({ locale, t: makeTFunc(locale) })
```

`onRehydrateStorage` ensures the `t` function is reconstructed from the persisted `locale` on page load.

This means all components using `const { t } = useI18nStore()` will now correctly re-render when the locale changes, without needing to also subscribe to `locale`.

---

## Files Modified

| File | Type |
|------|------|
| `src/core/stores/i18nStore.js` | i18n store — added 85 keys to zh, 76 keys to es, fixed reactivity |
| `src/core/components/auth/Login.jsx` | Replaced 2 hardcoded labels |
| `src/core/components/layout/Sidebar.jsx` | Replaced 1 hardcoded tooltip |
| `src/core/components/layout/Header.jsx` | Replaced ~10 hardcoded strings |
| `src/core/components/common/ConnectionBanner.jsx` | Added i18n, replaced ~7 strings |
| `src/core/components/common/SubscriptionGuard.jsx` | Added i18n, replaced ~25 strings |
| `src/pages/NotFound.jsx` | Added i18n, replaced 4 strings |
| `src/modules/fep/pages/Folios.jsx` | Replaced ~12 hardcoded strings |
| `src/modules/fep/pages/FolioDetalle.jsx` | Replaced ~15 hardcoded strings |

---

## Strings NOT Translated (Intentional)

| String | Reason |
|--------|--------|
| `Landing.jsx` — entire file | Public marketing page, intentionally Spanish-only for the target market |
| `src/modules/superadmin/**` | Admin-only, excluded per task instructions |
| `src/modules/devoluciones/**` | Module does not use i18n at all; full migration would require a separate large refactor |
| `LANG_LABELS = { es: 'Español', zh: '中文' }` in OnboardingTour | Language names in their own language — conventional, not a localization issue |
| `SubscriptionGuard` — `toLocaleDateString('es-MX', ...)` | Date formatting locale — separate from UI string i18n |
| Timezone identifiers (`America/Mexico_City`, etc.) | Technical IANA timezone codes, not UI strings |
| Brand names: `Kirion`, `DropScan`, `WMS`, `SKU` | Proper nouns / technical terms, not translated |
| Email addresses (`contacto@kirion.app`) | Contact data, not UI text |

---

## Build Status

`npm run build` passes with 0 errors after all changes.  
Pre-existing warnings (chunk size, dynamic import mixing) are unrelated to this audit.
