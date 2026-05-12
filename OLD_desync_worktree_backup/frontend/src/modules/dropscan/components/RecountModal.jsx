import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import * as ds from '../services/dropscanService'
import {
  X, ScanBarcode, CheckCircle, XCircle, AlertTriangle,
  Plus, RotateCcw, Hash
} from 'lucide-react'

/**
 * Recount Mode Modal — overlay for quick guide validation against the current tarima.
 * 
 * Props:
 *  - isOpen: boolean
 *  - onClose: () => void
 *  - tarima: current tarima object (with id, codigo, cantidad_guias)
 *  - sessionId: active session id
 *  - onGuideAdded: (guia) => void — called when a missing guide is added from recount
 */
export default function RecountModal({ isOpen, onClose, tarima, sessionId, onGuideAdded }) {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const [scanInput, setScanInput] = useState('')
  const [scans, setScans] = useState([])
  const [isAdding, setIsAdding] = useState(null) // guia code being added
  const inputRef = useRef(null)

  // Focus input on open
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
    if (!isOpen) {
      setScans([])
      setScanInput('')
    }
  }, [isOpen])

  // Load tarima guides for comparison
  const [tarimaGuias, setTarimaGuias] = useState([])
  useEffect(() => {
    if (isOpen && tarima?.id) {
      ds.getTarimaDetail(tarima.id).then(data => {
        setTarimaGuias((data.guias || []).map(g => g.codigo_guia.toUpperCase()))
      }).catch(() => setTarimaGuias([]))
    }
  }, [isOpen, tarima?.id])

  const handleScan = useCallback((e) => {
    e.preventDefault()
    const code = scanInput.trim().toUpperCase()
    if (!code) return
    setScanInput('')

    // Check if already scanned in this recount session
    const alreadyScanned = scans.find(s => s.code === code)
    if (alreadyScanned) {
      setScans(prev => [
        { code, status: 'duplicate', timestamp: new Date() },
        ...prev
      ])
      return
    }

    // Check if exists in tarima
    const exists = tarimaGuias.includes(code)
    setScans(prev => [
      { code, status: exists ? 'exists' : 'missing', timestamp: new Date() },
      ...prev
    ])
  }, [scanInput, scans, tarimaGuias])

  const handleAddToTarima = async (code) => {
    if (!sessionId || !tarima?.id) return
    setIsAdding(code)
    try {
      const data = await ds.scanGuia(sessionId, code, tarima.id)
      setTarimaGuias(prev => [...prev, code.toUpperCase()])
      setScans(prev => prev.map(s =>
        s.code === code && s.status === 'missing'
          ? { ...s, status: 'added' }
          : s
      ))
      toast.success(`${t('recount.added')}: ${code}`)
      if (onGuideAdded) onGuideAdded(data)
    } catch (err) {
      const errData = err.response?.data
      if (errData?.error === 'DUPLICADO' && errData?.duplicado_en === 'otra_tarima') {
        // Show inline warning — guide belongs to another tarima, cannot add
        setScans(prev => prev.map(s =>
          s.code === code && s.status === 'missing'
            ? { ...s, status: 'in_other_tarima', otherTarima: errData.tarima_original }
            : s
        ))
      } else {
        toast.error(errData?.error === 'DUPLICADO' ? errData.message : errData?.error || t('toast.error'))
      }
    } finally {
      setIsAdding(null)
    }
  }

  // Stats
  const existsCount = scans.filter(s => s.status === 'exists').length
  const missingCount = scans.filter(s => s.status === 'missing').length
  const addedCount = scans.filter(s => s.status === 'added').length
  const duplicateCount = scans.filter(s => s.status === 'duplicate').length
  const inOtherCount = scans.filter(s => s.status === 'in_other_tarima').length

  if (!isOpen) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal content */}
          <motion.div
            className="relative w-full max-w-lg mx-4 max-h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-warm-100 bg-gradient-to-r from-primary-50 to-accent-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                  <RotateCcw className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-warm-800">{t('recount.title')}</h3>
                  <p className="text-[10px] text-warm-500">{t('recount.subtitle')}</p>
                </div>
              </div>
              <button onClick={onClose}
                className="p-2 rounded-xl hover:bg-warm-100 text-warm-400 hover:text-warm-600 transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tarima info bar */}
            <div className="px-5 py-2.5 bg-warm-50/50 border-b border-warm-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-warm-600">{tarima?.codigo || '—'}</span>
                <span className="text-[10px] text-warm-400">{tarima?.cantidad_guias || 0}/100</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-bold">
                <span className="text-success-600">{existsCount} {t('recount.exists')}</span>
                <span className="text-danger-600">{missingCount} {t('recount.missing')}</span>
                {addedCount > 0 && <span className="text-primary-600">+{addedCount}</span>}
                {inOtherCount > 0 && <span className="text-orange-500">{inOtherCount} otra tarima</span>}
                {duplicateCount > 0 && <span className="text-warning-600">{duplicateCount} dup</span>}
              </div>
            </div>

            {/* Scan input */}
            <div className="px-5 pt-4 pb-3">
              <form onSubmit={handleScan}>
                <div className="relative">
                  <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-warm-300" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={scanInput}
                    onChange={e => setScanInput(e.target.value)}
                    placeholder={t('recount.scanPlaceholder')}
                    autoComplete="off"
                    className="w-full pl-12 pr-4 py-3.5 text-base bg-white border-2 border-warm-200 rounded-xl
                      focus:border-primary-500 focus:ring-4 focus:ring-primary-100 focus:shadow-glow
                      transition-all outline-none placeholder:text-warm-300 font-mono tracking-wide"
                  />
                </div>
              </form>
            </div>

            {/* Results list */}
            <div className="flex-1 overflow-y-auto px-5 pb-4 scrollbar-thin">
              {scans.length === 0 ? (
                <div className="py-12 text-center">
                  <ScanBarcode className="w-10 h-10 text-warm-200 mx-auto mb-3" />
                  <p className="text-sm text-warm-400">{t('recount.noScans')}</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {scans.map((scan, i) => (
                    <motion.div
                      key={`${scan.code}-${i}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                        scan.status === 'exists' ? 'bg-success-50/50 border-success-200'
                        : scan.status === 'missing' ? 'bg-danger-50/50 border-danger-200'
                        : scan.status === 'added' ? 'bg-primary-50/50 border-primary-200'
                        : scan.status === 'in_other_tarima' ? 'bg-orange-50/50 border-orange-200'
                        : 'bg-warning-50/50 border-warning-200'
                      }`}
                    >
                      {/* Status icon */}
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        scan.status === 'exists' ? 'bg-success-100 text-success-600'
                        : scan.status === 'missing' ? 'bg-danger-100 text-danger-600'
                        : scan.status === 'added' ? 'bg-primary-100 text-primary-600'
                        : scan.status === 'in_other_tarima' ? 'bg-orange-100 text-orange-600'
                        : 'bg-warning-100 text-warning-600'
                      }`}>
                        {scan.status === 'exists' ? <CheckCircle className="w-4 h-4" />
                          : scan.status === 'missing' ? <XCircle className="w-4 h-4" />
                          : scan.status === 'added' ? <Plus className="w-4 h-4" />
                          : <AlertTriangle className="w-4 h-4" />}
                      </div>

                      {/* Code & status label */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-mono font-semibold text-warm-700 truncate">{scan.code}</p>
                        <p className={`text-[10px] font-bold ${
                          scan.status === 'exists' ? 'text-success-600'
                          : scan.status === 'missing' ? 'text-danger-600'
                          : scan.status === 'added' ? 'text-primary-600'
                          : scan.status === 'in_other_tarima' ? 'text-orange-600'
                          : 'text-warning-600'
                        }`}>
                          {scan.status === 'exists' ? t('recount.exists')
                            : scan.status === 'missing' ? t('recount.missing')
                            : scan.status === 'added' ? t('recount.added')
                            : scan.status === 'in_other_tarima' ? `En tarima ${scan.otherTarima}`
                            : t('recount.duplicate')}
                        </p>
                      </div>

                      {/* Add to tarima button (only for missing) */}
                      {scan.status === 'missing' && (
                        <button
                          onClick={() => handleAddToTarima(scan.code)}
                          disabled={isAdding === scan.code}
                          className="px-3 py-1.5 rounded-lg bg-primary-500 text-white text-xs font-bold hover:bg-primary-600 transition-all disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                        >
                          <Plus className="w-3 h-3" />
                          {isAdding === scan.code ? '...' : t('recount.addToTarima')}
                        </button>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer stats */}
            {scans.length > 0 && (
              <div className="px-5 py-3 border-t border-warm-100 bg-warm-50/50 flex items-center justify-between">
                <span className="text-xs text-warm-500">
                  {t('recount.scanned')}: <span className="font-bold text-warm-700">{scans.length}</span>
                </span>
                <button onClick={() => { setScans([]); inputRef.current?.focus() }}
                  className="text-xs font-semibold text-warm-500 hover:text-primary-600 transition-colors flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
