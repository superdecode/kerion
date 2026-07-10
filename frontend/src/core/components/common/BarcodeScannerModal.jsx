import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, AlertTriangle, Camera } from 'lucide-react'

// Loaded on demand — most sessions never open the scanner, so this keeps
// the ~150kb zxing decoder out of the main bundle entirely.
let zxingPromise = null
function loadZXing() {
  if (!zxingPromise) {
    zxingPromise = Promise.all([
      import('@zxing/browser'),
      import('@zxing/library'),
    ]).then(([browser, library]) => ({ ...browser, ...library }))
  }
  return zxingPromise
}

const CORNER_POSITIONS = [
  'top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-2xl',
  'top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-2xl',
  'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-2xl',
  'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-2xl',
]

// Full-screen camera scanner for barcodes and QR codes. Uses getUserMedia +
// ZXing (pure JS, no WASM/native API dependency) so it works on older
// browsers/WebViews that don't implement the native BarcodeDetector API.
export default function BarcodeScannerModal({ isOpen, onClose, onScan }) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const [status, setStatus] = useState('starting') // starting | scanning | error
  const [errorMsg, setErrorMsg] = useState('')
  const [successFlash, setSuccessFlash] = useState(false)

  useEffect(() => {
    if (!isOpen) return undefined
    let cancelled = false
    setStatus('starting')
    setErrorMsg('')
    setSuccessFlash(false)

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          const err = new Error('Este navegador no soporta acceso a la cámara.')
          err.code = 'UNSUPPORTED'
          throw err
        }
        const {
          BrowserMultiFormatReader,
          BarcodeFormat,
          DecodeHintType,
        } = await loadZXing()
        if (cancelled) return

        const hints = new Map()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.QR_CODE,
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.AZTEC,
          BarcodeFormat.PDF_417,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.CODABAR,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.ITF,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.RSS_14,
          BarcodeFormat.RSS_EXPANDED,
        ])
        hints.set(DecodeHintType.TRY_HARDER, true)
        hints.set(DecodeHintType.ASSUME_GS1, true)

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 80,
          delayBetweenScanSuccess: 500,
          tryPlayVideoTimeout: 8000,
        })

        const controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              aspectRatio: { ideal: 1.7777777778 },
            },
            audio: false,
          },
          videoRef.current,
          (result) => {
            if (result && !cancelled) handleDetected(result.getText())
            // A "not found" error fires on every frame with no code in view —
            // that's the normal scanning state, not a failure. Only errors
            // thrown by decodeFromConstraints itself (caught below) matter.
          }
        )
        if (cancelled) { controls.stop(); return }
        controlsRef.current = controls
        const track = videoRef.current?.srcObject?.getVideoTracks?.()?.[0]
        if (track?.applyConstraints) {
          const capabilities = track.getCapabilities?.() || {}
          const advanced = []
          if (capabilities.focusMode?.includes?.('continuous')) {
            advanced.push({ focusMode: 'continuous' })
          }
          if (typeof capabilities.zoom?.max === 'number' && capabilities.zoom.max >= 1.5) {
            advanced.push({ zoom: Math.min(2, capabilities.zoom.max) })
          }
          if (advanced.length > 0) {
            track.applyConstraints({ advanced }).catch(() => {})
          }
        }
        setStatus('scanning')
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          setErrorMsg('Permiso de cámara denegado. Habilítalo en la configuración del navegador e intenta de nuevo.')
        } else if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') {
          setErrorMsg('No se encontró una cámara disponible en este dispositivo.')
        } else if (err?.code === 'UNSUPPORTED') {
          setErrorMsg(err.message)
        } else {
          setErrorMsg('No se pudo iniciar la cámara. Intenta de nuevo.')
        }
      }
    }
    start()

    return () => {
      cancelled = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  function handleDetected(text) {
    if (!controlsRef.current) return // already handled this frame batch
    controlsRef.current.stop()
    controlsRef.current = null
    if (navigator.vibrate) navigator.vibrate(200)
    setSuccessFlash(true)
    setTimeout(() => onScan(text), 240)
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[10050] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <p className="text-sm font-semibold text-white">Escanear código</p>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full text-white/80 hover:bg-white/10 hover:text-white transition-colors"
          aria-label="Cerrar escáner"
        >
          <X size={20} />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline autoPlay />

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/95 px-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-warning-500/15 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-warning-400" />
            </div>
            <p className="text-white text-sm max-w-xs">{errorMsg}</p>
          </div>
        )}

        {status === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 pointer-events-none">
            <Camera className="w-8 h-8 text-white/60 animate-pulse" />
            <p className="text-white/60 text-xs">Iniciando cámara...</p>
          </div>
        )}

        {status === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-[78vw] max-w-[22rem] h-[11rem] sm:w-80 sm:h-56">
              <div className="absolute inset-0 rounded-[1.75rem] border border-white/20" />
              <div className="absolute inset-x-[19%] inset-y-[14%] rounded-[1.4rem] border border-dashed border-white/15" />
              {CORNER_POSITIONS.map((cls) => (
                <div key={cls} className={`absolute w-9 h-9 border-primary-400 ${cls}`} />
              ))}
              <motion.div
                className="absolute left-2 right-2 h-0.5 rounded-full bg-primary-400"
                style={{ boxShadow: '0 0 12px 2px rgba(46,87,254,0.75)' }}
                animate={{ top: ['10%', '88%', '10%'] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          </div>
        )}

        <AnimatePresence>
          {successFlash && (
            <motion.div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <motion.div
                className="w-24 h-24 rounded-full bg-primary-400"
                initial={{ scale: 0.3, opacity: 0.9 }}
                animate={{ scale: 2.4, opacity: 0 }}
                transition={{ duration: 0.55, ease: 'easeOut' }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="text-center text-white/60 text-xs py-3 shrink-0 px-6">
        {status === 'scanning' ? 'Apunta la cámara al código de barras o QR' : ' '}
      </p>
    </div>,
    document.body
  )
}
