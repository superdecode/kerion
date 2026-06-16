import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, Tag } from 'lucide-react'
import { motion } from 'framer-motion'
import Modal from '../../../core/components/common/Modal'
import { previewImportarSalida } from '../services/devolucionesService'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'

function normalizeKey(k) {
  return String(k).toLowerCase().trim().replace(/[^a-z0-9]/g, '')
}

function parseExcelRows(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
        const rows = raw.map(r => {
          const out = {}
          for (const [k, v] of Object.entries(r)) out[normalizeKey(k)] = v
          const sku = out.sku || out.codigo || out.guia || out.embalaje || out.embalaje1 || ''
          const cantidad = Number(out.cantidad || out.qty || out.piezas || 0)
          return { sku: String(sku).trim(), cantidad }
        }).filter(r => r.sku && r.cantidad > 0)
        resolve(rows)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

export default function SalidaImportModal({ isOpen, onClose, onImport }) {
  const toast = useToastStore()
  const { t } = useI18nStore()
  const fileRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [encontrados, setEncontrados] = useState([])
  const [noEncontrados, setNoEncontrados] = useState([])
  const [checked, setChecked] = useState([])
  const [step, setStep] = useState('upload')

  const reset = () => {
    setStep('upload')
    setEncontrados([])
    setNoEncontrados([])
    setChecked([])
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const rows = await parseExcelRows(file)
      if (rows.length === 0) {
        toast.error(t('dev.salida_import.err.vacio'))
        return
      }
      const res = await previewImportarSalida(rows)
      const enc = res.encontrados || []
      const noEnc = res.no_encontrados || []
      setEncontrados(enc)
      setNoEncontrados(noEnc)
      setChecked(enc.map((_, i) => i))
      setStep('review')
    } catch (err) {
      toast.error(err.response?.data?.error || t('dev.salida_import.err.procesar'))
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  const toggleCheck = (i) => {
    setChecked(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])
  }

  const handleConfirm = () => {
    const selected = encontrados.filter((_, i) => checked.includes(i))
    if (!selected.length) { toast.error(t('dev.salida_import.err.sin_validas')); return }
    onImport(selected)
    reset()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { onClose(); reset() }}
      title={t('dev.salida_import.title')}
      icon={FileSpreadsheet}
      size="xl"
      footer={
        step === 'review' ? (
          <>
            <button onClick={reset} className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600">{t('dev.salida_import.subir_otro')}</button>
            <button onClick={() => { onClose(); reset() }} className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600">{t('dev.salida_import.cancelar')}</button>
            <button
              onClick={handleConfirm}
              disabled={checked.length === 0}
              className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {t('dev.salida_import.agregar')} {checked.length}
            </button>
          </>
        ) : null
      }
    >
      {step === 'upload' && (
        <div className="py-6 text-center space-y-4">
          <div className="text-sm text-warm-600">
            {t('dev.salida_import.upload.desc')} <span className="font-mono bg-warm-100 px-1.5 py-0.5 rounded text-xs">sku</span> y <span className="font-mono bg-warm-100 px-1.5 py-0.5 rounded text-xs">cantidad</span>.
            <br />
            <span className="text-warm-400 text-xs mt-1 block">{t('dev.salida_import.upload.guia')}</span>
          </div>
          <motion.label
            whileHover={{ scale: 1.01 }}
            className="flex flex-col items-center justify-center gap-3 w-full h-36 border-2 border-dashed border-warm-300 rounded-2xl cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-all"
          >
            {loading ? (
              <div className="text-sm text-warm-500">{t('dev.salida_import.procesando')}</div>
            ) : (
              <>
                <Upload className="w-8 h-8 text-warm-300" />
                <div className="text-sm text-warm-500">{t('dev.salida_import.upload.click')}</div>
              </>
            )}
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} disabled={loading} />
          </motion.label>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-5">
          {encontrados.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-success-600" />
                <span className="text-sm font-semibold text-success-700">{encontrados.length} {t('dev.salida_import.encontrados')}</span>
                {encontrados.some(r => r.match_type === 'guia') && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-100 text-accent-700 text-[10px] font-semibold">
                    <Tag className="w-3 h-3" /> {t('dev.salida_import.guia_match')}
                  </span>
                )}
              </div>
              <div className="border border-warm-100 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase text-warm-400 border-b border-warm-100 bg-warm-50">
                      <th className="px-3 py-2 w-8" />
                      <th className="px-3 py-2">{t('dev.salida_import.col.sku')}</th>
                      <th className="px-3 py-2">{t('dev.salida_import.col.codigo')}</th>
                      <th className="px-3 py-2">{t('dev.salida_import.col.coincidencia')}</th>
                      <th className="px-3 py-2 text-right">{t('dev.salida_import.col.disp')}</th>
                      <th className="px-3 py-2 text-right">{t('dev.salida_import.col.solicitada')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {encontrados.map((row, i) => {
                      const insuficiente = row.cantidad_solicitada > row.cantidad_disponible
                      const byGuia = row.match_type === 'guia'
                      return (
                        <tr
                          key={i}
                          className={`border-b border-warm-50 cursor-pointer transition-colors ${checked.includes(i) ? (byGuia ? 'bg-accent-50/50' : 'bg-success-50/50') : 'hover:bg-primary-100'}`}
                          onClick={() => toggleCheck(i)}
                        >
                          <td className="px-3 py-2"><input type="checkbox" readOnly checked={checked.includes(i)} className="cb pointer-events-none" /></td>
                          <td className="px-3 py-2 font-medium text-warm-800">{row.sku}</td>
                          <td className="px-3 py-2 font-mono text-warm-500">{row.codigo_trazabilidad || '—'}</td>
                          <td className="px-3 py-2">
                            {byGuia ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent-100 text-accent-700 text-[10px] font-semibold">
                                <Tag className="w-2.5 h-2.5" /> Guía: {row.guia_buscada}
                              </span>
                            ) : (
                              <span className="text-[10px] text-warm-400">{t('dev.salida_import.sku_directo')}</span>
                            )}
                          </td>
                          <td className={`px-3 py-2 text-right font-medium ${insuficiente ? 'text-warning-600' : 'text-success-700'}`}>
                            {row.cantidad_disponible}
                          </td>
                          <td className="px-3 py-2 text-right">{row.cantidad_solicitada}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {noEncontrados.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-4 h-4 text-danger-500" />
                <span className="text-sm font-semibold text-danger-700">{noEncontrados.length} {t('dev.salida_import.no_encontrados')}</span>
              </div>
              <div className="border border-warm-100 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase text-warm-400 border-b border-warm-100 bg-warm-50">
                      <th className="px-3 py-2">{t('dev.salida_import.col.sku_guia')}</th>
                      <th className="px-3 py-2 text-right">{t('dev.salida_import.col.cantidad')}</th>
                      <th className="px-3 py-2">{t('dev.salida_import.col.motivo')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {noEncontrados.map((row, i) => (
                      <tr key={i} className="border-b border-warm-50 bg-danger-50/30">
                        <td className="px-3 py-2 font-medium text-warm-700">{row.sku || '—'}</td>
                        <td className="px-3 py-2 text-right">{row.cantidad}</td>
                        <td className="px-3 py-2 text-danger-600">{row.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {encontrados.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-warning-700 bg-warning-50 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {t('dev.salida_import.sin_nada')}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
