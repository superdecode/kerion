import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { listOrders, getListaRecepcion } from '../services/recepcionService'
import { buildListaRecepcionData, generateListaRecepcionXlsx } from '../utils/listaRecepcionReport'
import { useToastStore } from '../../../core/stores/toastStore'
import ListaRecepcionPreviewModal from './ListaRecepcionPreviewModal'

export default function ListaRecepcionSelectorModal({ isOpen, onClose }) {
  const { t } = useI18nStore()
  const toast = useToastStore()
  const [selectedId, setSelectedId] = useState('')
  const [withTarimas, setWithTarimas] = useState(false)
  const [loading, setLoading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewData, setPreviewData] = useState(null)

  const { data } = useQuery({
    queryKey: ['recepcion-orders-selector'],
    queryFn: () => listOrders({ limit: 100 }),
    enabled: isOpen,
  })

  const orders = data?.orders || []

  const handleGenerate = async () => {
    if (!selectedId) return
    setLoading(true)
    try {
      const result = await getListaRecepcion(selectedId)
      setPreviewData(buildListaRecepcionData(result.order, result.lines, withTarimas))
      setPreviewOpen(true)
    } catch {
      toast.error(t('rec.lista.error_generate'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={t('rec.lista.title')}
        icon={Printer}
        size="md"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600">
              {t('common.cancel')}
            </button>
            <button
              onClick={handleGenerate}
              disabled={!selectedId || loading}
              className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {loading ? t('common.loading') : t('rec.btn.listaRecepcion')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-warm-700 mb-1.5">{t('rec.lista.select_order_label')}</label>
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="w-full border border-warm-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary-400"
            >
              <option value="">{t('rec.lista.select_order_placeholder')}</option>
              {orders.map(o => (
                <option key={o.id} value={o.id}>
                  {o.folio} — {o.cliente || t('rec.lista.select_no_client')} ({o.total_cajas} cajas)
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={withTarimas}
              onChange={e => setWithTarimas(e.target.checked)}
              className="cb"
            />
            <span className="text-sm text-warm-700">{t('rec.tarimas.toggle')}</span>
          </label>
        </div>
      </Modal>

      <ListaRecepcionPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        data={previewData}
        loading={loading && !previewData}
        onExport={() => {
          if (!previewData) return
          generateListaRecepcionXlsx(previewData)
        }}
      />
    </>
  )
}
