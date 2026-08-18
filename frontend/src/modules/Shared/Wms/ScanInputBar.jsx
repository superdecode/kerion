import { memo, useCallback, useState } from 'react'
import { Loader2, ScanLine, X } from 'lucide-react'
import BarcodeScannerModal from '../../../core/components/common/BarcodeScannerModal'
import { useI18nStore } from '../../../core/stores/i18nStore'

/**
 * Scan field shared by the Despacho validation screens.
 *
 * `variant="mobile"` renders the large, thumb-reachable bar meant to sit pinned at
 * the bottom of the viewport on phones and PDAs; `variant="inline"` renders the
 * compact desktop row.
 *
 * The leading icon doubles as the camera trigger below `sm`, matching the pattern
 * in Surtido validation and the Rastreo search modal. `inputMode="none"` keeps the
 * on-screen keyboard closed so the PDA gun owns the whole viewport — same as
 * Recepción's scan field.
 */
const ScanInputBar = memo(function ScanInputBar({
  inputRef,
  onSubmit,
  placeholder,
  buttonLabel,
  disabled = false,
  loading = false,
  variant = 'inline',
  hint = null,
}) {
  const { t } = useI18nStore()
  const [value, setValue] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => inputRef?.current?.focus())
  }, [inputRef])

  const submit = useCallback((raw) => {
    const text = String(raw ?? value).trim()
    if (!text || disabled) return
    setValue('')
    onSubmit(text)
    focusInput()
  }, [disabled, focusInput, onSubmit, value])

  const handleCameraScan = useCallback((text) => {
    setScannerOpen(false)
    submit(text)
  }, [submit])

  const isMobile = variant === 'mobile'

  return (
    <>
      <div className="space-y-2">
        <div className={isMobile ? 'space-y-2' : 'flex flex-col gap-2 sm:flex-row sm:items-center'}>
          <div
            className={`flex min-w-0 items-center gap-2 rounded-2xl border-2 bg-white transition-colors border-primary-200 focus-within:border-primary-400 ${
              isMobile ? 'h-14 px-3' : 'h-11 flex-1 px-3'
            } ${disabled ? 'opacity-60' : ''}`}
          >
            <ScanLine className={`hidden shrink-0 text-primary-400 sm:block ${isMobile ? 'h-5 w-5' : 'h-3.5 w-3.5'}`} />
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              disabled={disabled}
              aria-label={t('common.scanBarcodeOrQr')}
              title={t('common.scanCode')}
              className="shrink-0 p-0.5 text-primary-600 transition-colors hover:text-primary-700 disabled:opacity-40 sm:hidden"
            >
              <ScanLine className={isMobile ? 'h-6 w-6' : 'h-[18px] w-[18px]'} />
            </button>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder={placeholder}
              disabled={disabled}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="none"
              aria-label={placeholder}
              className={`min-w-0 flex-1 bg-transparent font-mono tracking-wide outline-none placeholder:font-sans placeholder:text-warm-400 ${
                isMobile ? 'text-lg text-warm-900' : 'text-sm'
              }`}
            />
            {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary-400" />}
            {!loading && value && (
              <button
                type="button"
                onClick={() => { setValue(''); focusInput() }}
                aria-label={t('common.clear')}
                className="shrink-0 rounded-lg p-1 text-warm-400 transition-colors hover:text-warm-600"
              >
                <X className={isMobile ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => submit()}
            disabled={!value.trim() || disabled}
            className={`btn-primary flex w-full items-center justify-center gap-1.5 rounded-2xl disabled:opacity-50 ${
              isMobile ? 'h-12 text-base' : 'h-11 px-4 text-sm sm:w-auto sm:shrink-0'
            }`}
          >
            <ScanLine className={isMobile ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
            {buttonLabel}
          </button>
        </div>

        {hint && <p className="text-center text-[10px] leading-tight text-warm-400">{hint}</p>}
      </div>

      <BarcodeScannerModal
        isOpen={scannerOpen}
        onClose={() => { setScannerOpen(false); focusInput() }}
        onScan={handleCameraScan}
      />
    </>
  )
})

export default ScanInputBar
