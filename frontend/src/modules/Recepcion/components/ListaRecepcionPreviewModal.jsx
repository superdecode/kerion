import { Download, Printer, X } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import PrintListaRecepcion from './PrintListaRecepcion'
import { useI18nStore } from '../../../core/stores/i18nStore'

function printHtml(nodeId) {
  const el = document.getElementById(nodeId)
  if (!el) return
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head><title>Lista de recepción</title>
    <style>
      *{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#1a1a1a;margin:0;padding:16px}
      @page{size:A4 portrait;margin:12mm 14mm}
      table{width:100%;border-collapse:collapse;page-break-inside:auto}
      tr{page-break-inside:avoid;page-break-after:auto}
      thead{display:table-header-group}
    </style>
  </head><body>${el.outerHTML}</body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 300)
}

export default function ListaRecepcionPreviewModal({ isOpen, onClose, data, loading, onExport }) {
  const { t } = useI18nStore()
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('rec.lista.preview.title')}
      icon={Printer}
      size="xl"
      headerAction={!loading ? (
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-primary-100/60 text-warm-400 hover:text-primary-600 transition-all duration-200">
          <X className="w-4 h-4" />
        </button>
      ) : null}
      footer={data && !loading ? (
        <div className="flex w-full justify-end gap-3">
          <button className="btn-success inline-flex items-center gap-2" onClick={onExport}>
            <Download size={14} /> {t('rec.lista.export')}
          </button>
          <button className="btn-primary inline-flex items-center gap-2" onClick={() => printHtml('print-lista-recepcion')}>
            <Printer size={14} /> {t('rec.lista.print')}
          </button>
        </div>
      ) : null}
    >
      {loading ? (
        <div className="py-16">
          <LoadingSpinner text={t('rec.lista.generating')} />
        </div>
      ) : data ? (
        <PrintListaRecepcion data={data} />
      ) : (
        <div className="py-12 text-center text-sm text-warm-400">{t('rec.lista.noData')}</div>
      )}
    </Modal>
  )
}
