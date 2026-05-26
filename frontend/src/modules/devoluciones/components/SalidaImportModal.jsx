import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import Modal from '../../../core/components/common/Modal'
import { importarSalida } from '../services/devolucionesService'
import { useToastStore } from '../../../core/stores/toastStore'

export default function SalidaImportModal({ isOpen, onClose, onImport }) {
  const toast = useToastStore()
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
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await importarSalida(fd)
      const enc = res.data?.encontrados || res.encontrados || []
      const noEnc = res.data?.no_encontrados || res.no_encontrados || []
      setEncontrados(enc)
      setNoEncontrados(noEnc)
      setChecked(enc.map((_, i) => i))
      setStep('review')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al procesar archivo')
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
    if (!selected.length) { toast.error('Selecciona al menos una línea'); return }
    onImport(selected)
    reset()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { onClose(); reset() }}
      title="Importar desde Excel"
      icon={FileSpreadsheet}
      size="xl"
      footer={
        step === 'review' ? (
          <>
            <button onClick={reset} className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600">Subir otro</button>
            <button onClick={() => { onClose(); reset() }} className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600">Cancelar</button>
            <button
              onClick={handleConfirm}
              disabled={checked.length === 0}
              className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              Agregar {checked.length} líneas
            </button>
          </>
        ) : null
      }
    >
      {step === 'upload' && (
        <div className="py-6 text-center space-y-4">
          <div className="text-sm text-warm-600">
            El archivo Excel debe tener columnas: <span className="font-mono bg-warm-100 px-1.5 py-0.5 rounded text-xs">sku</span> y <span className="font-mono bg-warm-100 px-1.5 py-0.5 rounded text-xs">cantidad</span>
          </div>
          <motion.label
            whileHover={{ scale: 1.01 }}
            className="flex flex-col items-center justify-center gap-3 w-full h-36 border-2 border-dashed border-warm-300 rounded-2xl cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-all"
          >
            {loading ? (
              <div className="text-sm text-warm-500">Procesando...</div>
            ) : (
              <>
                <Upload className="w-8 h-8 text-warm-300" />
                <div className="text-sm text-warm-500">Haz clic o arrastra tu archivo .xlsx aquí</div>
              </>
            )}
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} disabled={loading} />
          </motion.label>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-5">
          {/* Encontrados */}
          {encontrados.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-success-600" />
                <span className="text-sm font-semibold text-success-700">{encontrados.length} coincidencias encontradas</span>
              </div>
              <div className="border border-warm-100 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase text-warm-400 border-b border-warm-100 bg-warm-50">
                      <th className="px-3 py-2 w-8" />
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2">Código</th>
                      <th className="px-3 py-2 text-right">Disp.</th>
                      <th className="px-3 py-2 text-right">Solicitada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {encontrados.map((row, i) => {
                      const insuficiente = row.cantidad_solicitada > row.cantidad_disponible
                      return (
                        <tr
                          key={i}
                          className={`border-b border-warm-50 cursor-pointer transition-colors ${checked.includes(i) ? 'bg-success-50/50' : 'hover:bg-warm-50'}`}
                          onClick={() => toggleCheck(i)}
                        >
                          <td className="px-3 py-2"><input type="checkbox" readOnly checked={checked.includes(i)} className="rounded" /></td>
                          <td className="px-3 py-2 font-medium text-warm-800">{row.sku}</td>
                          <td className="px-3 py-2 font-mono">{row.codigo_trazabilidad || '—'}</td>
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

          {/* No encontrados */}
          {noEncontrados.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-4 h-4 text-danger-500" />
                <span className="text-sm font-semibold text-danger-700">{noEncontrados.length} sin coincidencia</span>
              </div>
              <div className="border border-warm-100 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase text-warm-400 border-b border-warm-100 bg-warm-50">
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2 text-right">Cantidad</th>
                      <th className="px-3 py-2">Motivo</th>
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
              No se encontró ningún SKU en inventario disponible.
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
