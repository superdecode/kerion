import * as XLSX from 'xlsx'
import { Download, Printer } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import PrintFolioContent, { getOrderCodes } from './PrintFolioContent'

function printHtml(nodeId) {
  const el = document.getElementById(nodeId)
  if (!el) return
  const win = window.open('', '_blank', 'width=820,height=700,scrollbars=yes')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head><title>Folio</title>
    <style>
      *{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#1a1a1a;margin:0;padding:16px}
      @page{size:letter portrait;margin:15mm}
      table{width:100%;border-collapse:collapse;page-break-inside:auto}
      tr{page-break-inside:avoid;page-break-after:auto}
      thead{display:table-header-group}
      @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    </style>
  </head><body>${el.outerHTML}</body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 300)
}

function exportExcel(folio, orders) {
  const rows = orders.map((o, i) => {
    const codes = getOrderCodes(o)
    const codesStr = codes.map(([base, count]) => `${base} (${count})`).join('\n')
    return [
      i + 1,
      o.outbound_order_no || '',
      codesStr,
      o.bultos ?? '',
      o.peso_kg != null ? Number(o.peso_kg).toFixed(2) : '',
      o.estado || 'pendiente',
    ]
  })

  const totalBultos = orders.reduce((s, o) => s + (Number(o.bultos) || 0), 0)
  const totalPeso = orders.reduce((s, o) => s + (Number(o.peso_kg) || 0), 0)

  const sheetData = [
    [`Folio: ${folio.folio_numero}`, '', '', '', '', ''],
    [`Conductor: ${folio.conductor_nombre || '—'}`, '', `Unidad: ${folio.unidad_placa || '—'}`, '', `Estado: ${folio.estado || '—'}`, ''],
    [],
    ['#', 'Orden', 'Código', 'Bultos', 'Peso kg', 'Estado'],
    ...rows,
    [],
    ['', '', 'TOTALES', totalBultos, totalPeso > 0 ? totalPeso.toFixed(2) : '—', `${orders.length} orden${orders.length !== 1 ? 'es' : ''}`],
  ]

  const ws = XLSX.utils.aoa_to_sheet(sheetData)
  ws['!cols'] = [{ wch: 4 }, { wch: 22 }, { wch: 26 }, { wch: 8 }, { wch: 10 }, { wch: 12 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Folio Despacho')
  XLSX.writeFile(wb, `folio-${folio.folio_numero}.xlsx`)
}

export default function FolioPreviewModal({ isOpen, onClose, folio, orders }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={folio ? `Folio ${folio.folio_numero}` : 'Folio de Despacho'}
      icon={Printer}
      size="xl"
      footer={folio && orders?.length ? (
        <div className="flex w-full justify-end gap-3">
          <button className="btn-ghost inline-flex items-center gap-2 text-sm" onClick={() => exportExcel(folio, orders)}>
            <Download size={14} /> Exportar Excel
          </button>
          <button className="btn-primary inline-flex items-center gap-2 text-sm" onClick={() => printHtml('print-folio-content')}>
            <Printer size={14} /> Imprimir
          </button>
        </div>
      ) : null}
    >
      {folio && orders ? (
        <PrintFolioContent folio={folio} orders={orders} />
      ) : (
        <div className="py-12 text-center text-sm text-warm-400">Sin datos para mostrar</div>
      )}
    </Modal>
  )
}
