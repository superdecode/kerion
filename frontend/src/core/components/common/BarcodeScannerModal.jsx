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

function getPointPosition(result, videoElement) {
  const points = result?.getResultPoints?.() || []
  const videoWidth = videoElement?.videoWidth || 0
  const videoHeight = videoElement?.videoHeight || 0
  const clientWidth = videoElement?.clientWidth || 0
  const clientHeight = videoElement?.clientHeight || 0

  if (points.length === 0 || !videoWidth || !videoHeight || !clientWidth || !clientHeight) {
    return null
  }

  const scale = Math.max(clientWidth / videoWidth, clientHeight / videoHeight)
  const scaledWidth = videoWidth * scale
  const scaledHeight = videoHeight * scale
  const offsetX = (scaledWidth - clientWidth) / 2
  const offsetY = (scaledHeight - clientHeight) / 2

  const normalized = points
    .map((point) => ({
      x: (typeof point?.getX === 'function' ? point.getX() : point?.x) * scale - offsetX,
      y: (typeof point?.getY === 'function' ? point.getY() : point?.y) * scale - offsetY,
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))

  if (normalized.length === 0) return null

  const centerX = normalized.reduce((sum, point) => sum + point.x, 0) / normalized.length
  const centerY = normalized.reduce((sum, point) => sum + point.y, 0) / normalized.length

  return {
    left: Math.max(16, Math.min(clientWidth - 16, centerX)),
    top: Math.max(16, Math.min(clientHeight - 16, centerY)),
  }
}

function playScanSound() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return

  try {
    const context = new AudioContextClass()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(920, context.currentTime)
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.17)
    oscillator.onended = () => context.close().catch(() => {})
  } catch {
    // Ignore audio failures; scan still succeeds without sound.
  }
}

// Full-screen camera scanner for barcodes and QR codes. Uses getUserMedia +
// ZXing (pure JS, no WASM/native API dependency) so it works on older
// browsers/WebViews that don't implement the native BarcodeDetector API.
export default function BarcodeScannerModal({ isOpen, onClose, onScan }) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const detectedRef = useRef(false)
  const confirmedTextRef = useRef('')
  const [status, setStatus] = useState('starting') // starting | scanning | error
  const [errorMsg, setErrorMsg] = useState('')
  const [successFlash, setSuccessFlash] = useState(false)
  const [detectionPulse, setDetectionPulse] = useState(null)

  useEffect(() => {
    if (!isOpen) return undefined
    let cancelled = false
    setStatus('starting')
    setErrorMsg('')
    setSuccessFlash(false)
    setDetectionPulse(null)
    detectedRef.current = false
    confirmedTextRef.current = ''

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
          delayBetweenScanAttempts: 120,
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
            if (result && !cancelled && !detectedRef.current) {
              handleDetected(result)
            }
            // A "not found" error fires on every frame with no code in view —
            // that's the normal scanning state, not a failure. Only errors
            // thrown by decodeFromConstraints itself (caught below) matter.
          }
        )
        if (cancelled) { controls.stop(); return }
        controlsRef.current = controls
        if (detectedRef.current) {
          controls.stop()
          controlsRef.current = null
          return
        }
        const track = videoRef.current?.srcObject?.getVideoTracks?.()?.[0]
        if (track?.applyConstraints) {
          const capabilities = track.getCapabilities?.() || {}
          const advanced = []
          if (capabilities.focusMode?.includes?.('continuous')) {
            advanced.push({ focusMode: 'continuous' })
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
      setDetectionPulse(null)
      detectedRef.current = false
      confirmedTextRef.current = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  function handleDetected(result) {
    const rawText = typeof result === 'string' ? result : result?.getText?.()
    const normalizedText = String(rawText || '').trim()
    if (!normalizedText || detectedRef.current) return

    detectedRef.current = true
    confirmedTextRef.current = normalizedText
    const pointPosition = getPointPosition(result, videoRef.current)
    if (pointPosition) {
      setDetectionPulse({
        ...pointPosition,
        key: Date.now(),
      })
    }

    controlsRef.current?.stop()
    controlsRef.current = null
    if (navigator.vibrate) navigator.vibrate(200)
    playScanSound()
    setSuccessFlash(true)
    setTimeout(() => onScan(normalizedText), 140)
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
        <div className="absolute inset-0 bg-black" />
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover bg-black" muted playsInline autoPlay />

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
            <div className="relative w-[72vw] h-[72vw] max-w-[19rem] max-h-[19rem] sm:w-80 sm:h-80">
              <div className="absolute inset-0 rounded-[2rem] border border-white/20 bg-black/10 backdrop-blur-[1px]" />
              <div className="absolute inset-[11%] rounded-[1.5rem] border border-white/10" />
              {CORNER_POSITIONS.map((cls) => (
                <div key={cls} className={`absolute w-9 h-9 border-primary-400 ${cls}`} />
              ))}
              <div className="absolute inset-x-[12%] top-1/2 h-px -translate-y-1/2 bg-white/10" />
              <div className="absolute left-1/2 inset-y-[12%] w-px -translate-x-1/2 bg-white/10" />
              <motion.div
                className="absolute left-[10%] right-[10%] h-[2px] rounded-full bg-primary-400/90"
                style={{ boxShadow: '0 0 12px 2px rgba(46,87,254,0.55)' }}
                animate={{ top: ['14%', '86%', '14%'], opacity: [0.65, 1, 0.65] }}
                transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }}
                initial={{ top: '14%' }}
              />
            </div>
          </div>
        )}

        <AnimatePresence>
          {detectionPulse && status === 'scanning' && (
            <motion.div
              key={detectionPulse.key}
              className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-400 pointer-events-none"
              style={{ left: detectionPulse.left, top: detectionPulse.top }}
              initial={{ scale: 0.35, opacity: 0.95, boxShadow: '0 0 0 0 rgba(46,87,254,0.82)' }}
              animate={{ scale: 1, opacity: 1, boxShadow: '0 0 0 12px rgba(46,87,254,0)' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.34, ease: 'easeOut' }}
            >
              <div className="absolute inset-0 rounded-full bg-primary-300/85" />
            </motion.div>
          )}
        </AnimatePresence>

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
        {status === 'scanning' ? 'Escanea QR o código de barras dentro del cuadro, en vertical u horizontal' : ' '}
      </p>
    </div>,
    document.body
  )
}
