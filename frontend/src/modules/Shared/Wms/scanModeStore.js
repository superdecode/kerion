import { create } from 'zustand'

// Persisted input mode for every scan field across WMS modules.
//   'pda'     → hardware/laser scanner (PDA). The field never raises the on-screen
//               keyboard (inputMode: 'none') so the whole viewport stays available
//               for the scan stream. This is the default: the operators run PDAs.
//   'teclado' → manual capture, on-screen keyboard allowed.
// The camera scanner is not a mode: it is a one-shot action available from the
// same bar in either mode.
const STORAGE_KEY = 'kirion_scan_input_mode'
export const SCAN_MODES = ['pda', 'teclado']
export const DEFAULT_SCAN_MODE = 'pda'

function readStoredMode() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return SCAN_MODES.includes(saved) ? saved : DEFAULT_SCAN_MODE
  } catch {
    return DEFAULT_SCAN_MODE
  }
}

export const useScanModeStore = create((set) => ({
  mode: readStoredMode(),
  setMode: (mode) => {
    const next = SCAN_MODES.includes(mode) ? mode : DEFAULT_SCAN_MODE
    try { localStorage.setItem(STORAGE_KEY, next) } catch {}
    set({ mode: next })
  },
  toggleMode: () => set((s) => {
    const next = s.mode === 'pda' ? 'teclado' : 'pda'
    try { localStorage.setItem(STORAGE_KEY, next) } catch {}
    return { mode: next }
  }),
}))

// `inputMode: 'none'` keeps the soft keyboard closed for PDA guns while still
// receiving their keystrokes. Desktop is unaffected — it has no soft keyboard.
export function scanInputModeAttr(mode) {
  return mode === 'pda' ? 'none' : 'text'
}
