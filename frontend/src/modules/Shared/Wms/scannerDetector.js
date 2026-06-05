/**
 * Anti-manual scanner detector.
 * Hardware scanners fire all characters within ~50ms; human typing takes >500ms per char.
 *
 * Usage:
 *   const detector = createScannerDetector(onScanComplete)
 *   inputElement.addEventListener('keydown', detector.onKeyDown)
 *   inputElement.addEventListener('keyup', detector.onKeyUp)
 *
 * Ported from upapex/apps/validate/app.js scanner threshold logic.
 */

const SCANNER_THRESHOLD_MS = 500

/**
 * @param {(value: string) => void} onScan - Called with the full scanned value when a scanner event is detected.
 * @returns {{ onKeyDown: (e: KeyboardEvent) => void, reset: () => void }}
 */
export function createScannerDetector(onScan) {
  let buffer = ''
  let lastKeyTime = 0

  function onKeyDown(e) {
    const now = Date.now()
    const delta = now - lastKeyTime
    lastKeyTime = now

    if (e.key === 'Enter') {
      if (buffer.length > 0) {
        onScan(buffer)
        buffer = ''
      }
      return
    }

    // Gap larger than threshold → this is a human keypress, not scanner
    if (delta > SCANNER_THRESHOLD_MS && buffer.length > 0) {
      buffer = ''
    }

    if (e.key.length === 1) {
      buffer += e.key
    }
  }

  function reset() {
    buffer = ''
    lastKeyTime = 0
  }

  return { onKeyDown, reset }
}

/**
 * React hook variant — returns an onChange handler that only calls onScan
 * when the full value arrives via Enter key within the scanner threshold.
 *
 * Attach to an <input> element:
 *   <input onKeyDown={detector.handleKeyDown} onChange={e => setValue(e.target.value)} />
 *
 * @param {(value: string) => void} onScan
 * @param {(isManual: boolean) => void} [onManualDetected]
 */
export function useScannerInput(onScan, onManualDetected) {
  const stateRef = { buffer: '', lastKeyTime: 0 }

  function handleKeyDown(e) {
    const now = Date.now()
    const delta = now - stateRef.lastKeyTime
    stateRef.lastKeyTime = now

    if (e.key === 'Enter') {
      const val = e.target.value.trim()
      if (!val) return

      const isManual = delta > SCANNER_THRESHOLD_MS
      if (isManual) {
        onManualDetected?.(true)
        e.target.value = ''
        return
      }

      onScan(val)
      e.target.value = ''
      stateRef.buffer = ''
      return
    }
  }

  return { handleKeyDown }
}
