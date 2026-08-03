import { memo, useCallback, useState } from 'react'
import { Camera, Keyboard, Loader2, ScanLine, Smartphone, X } from 'lucide-react'
import BarcodeScannerModal from '../../../core/components/common/BarcodeScannerModal'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { scanInputModeAttr, useScanModeStore } from './scanModeStore'

// Segmented PDA / keyboard switch. Rendered next to the scan field so an operator
// can flip capture style without leaving the validation screen.
export const ScanModeSwitch = memo(function ScanModeSwitch({ className = '' }) {
  const { t } = useI18nStore()
  const mode = useScanModeStore(s => s.mode)
  const setMode = useScanModeStore(s => s.setMode)

  const options = [
    { value: 'pda', icon: Smartphone, label: t('scan.mode.pda') },
    { value: 'teclado', icon: Keyboard, label: t('scan.mode.teclado') },
  ]

  return (
    <div className={`inline-flex items-center rounded-xl border border-warm-200 bg-warm-50 p-0.5 ${className}`} role="group" aria-label={t('scan.mode.title')}>
      {options.map(({ value, icon: Icon, label }) => {
        const active = mode === value
        return (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            aria-pressed={active}
            title={value === 'pda' ? t('scan.mode.hint.pda') : t('scan.mode.hint.teclado')}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition-all ${
              active
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-warm-500 hover:text-warm-700'
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {label}
          </button>
        )
      })}
    </div>
  )
})

/**
 * Scan field shared by every WMS validation screen.
 *
 * `variant="mobile"` renders the large, thumb-reachable bar meant to sit pinned at
 * the bottom of the viewport on phones and PDAs; `variant="inline"` renders the
 * compact desktop row.
 */
const ScanInputBar = memo(function ScanInputBar({
  inputRef,
  onSubmit,
  placeholder,
  buttonLabel,
  disabled = false,
  loading = false,
  variant = 'inline',
  showModeSwitch = false,
  showCamera = true,
  hint = null,
}) {
  const { t } = useI18nStore()
  const mode = useScanModeStore(s => s.mode)
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

  const inputProps = {
    ref: inputRef,
    type: 'text',
    value,
    onChange: (e) => setValue(e.target.value),
    onKeyDown: (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        submit()
      }
    },
    placeholder,
    disabled,
    autoComplete: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    inputMode: scanInputModeAttr(mode),
    'aria-label': placeholder,
  }

  return (
    <>
      <div className="space-y-2">
      <div className={isMobile ? 'space-y-2' : 'flex flex-col gap-2 sm:flex-row sm:items-center'}>
        <div
          className={`flex items-center gap-2 rounded-2xl border-2 bg-white transition-colors border-primary-200 focus-within:border-primary-400 ${
            isMobile ? 'h-14 px-4' : 'h-11 flex-1 px-4'
          } ${disabled ? 'opacity-60' : ''}`}
        >
          <ScanLine className={`shrink-0 text-primary-400 ${isMobile ? 'h-5 w-5' : 'h-3.5 w-3.5'}`} />
          <input
            {...inputProps}
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
          {showCamera && (
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              disabled={disabled}
              aria-label={t('scan.mode.camara')}
              title={t('scan.mode.hint.camara')}
              className={`shrink-0 rounded-xl border border-primary-200 bg-primary-50 text-primary-600 transition-colors hover:bg-primary-100 disabled:opacity-40 ${
                isMobile ? 'flex h-10 w-10 items-center justify-center' : 'flex h-8 w-8 items-center justify-center'
              }`}
            >
              <Camera className={isMobile ? 'h-5 w-5' : 'h-4 w-4'} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 sm:shrink-0">
          <button
            type="button"
            onClick={() => submit()}
            disabled={!value.trim() || disabled}
            className={`btn-primary flex flex-1 items-center justify-center gap-1.5 rounded-2xl disabled:opacity-50 ${
              isMobile ? 'h-12 text-base' : 'h-11 px-4 text-sm sm:flex-none'
            }`}
          >
            <ScanLine className={isMobile ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
            {buttonLabel}
          </button>
          {showModeSwitch && <ScanModeSwitch className="shrink-0" />}
        </div>
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
