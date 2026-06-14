// frontend/src/modules/Despacho/components/AgendaView.jsx
import { useState, useMemo } from 'react'
import { ArrowLeft, Printer, CalendarDays, Package, Search, X } from 'lucide-react'
import { fmtDate, fmtTimeShort } from '../../../core/utils/dateFormat'

const DISPATCH_LABEL = {
  pendiente:  'Pendiente',
  cargado:    'Cargado',
  entregado:  'Entregado',
  devolucion: 'Devolución',
}

const DISPATCH_CLS = {
  pendiente:  'text-warm-500',
  cargado:    'text-primary-700',
  entregado:  'text-success-700',
  devolucion: 'text-danger-600',
}

export default function AgendaView({ orders = [], dispatchMap, dateFrom, dateTo, onClose }) {
  const [q, setQ] = useState('')

  const groups = useMemo(() => {
    const search = q.trim().toLowerCase()
    const map = new Map()

    for (const order of orders) {
      const customer = order.customerName || order.cliente || 'Sin cliente'
      const orderNo  = order.outboundOrderNo || order.order_no || ''
      if (search && !orderNo.toLowerCase().includes(search) && !customer.toLowerCase().includes(search)) continue

      if (!map.has(customer)) map.set(customer, [])
      map.get(customer).push(order)
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([customer, rows]) => ({
        customer,
        rows,
        totalBultos: rows.reduce((s, o) => s + (Number(o.outboundBoxCount) || 0), 0),
      }))
  }, [orders, q])

  const totalOrders = orders.length
  const totalBultos = useMemo(
    () => orders.reduce((s, o) => s + (Number(o.outboundBoxCount) || 0), 0),
    [orders]
  )

  function printAgenda() {
    const rows = groups.map(g => `
      <div class="group">
        <div class="group-header">DESTINO: ${g.customer}</div>
        <table>
          <thead><tr><th>Horario</th><th>Orden</th><th>Bultos</th><th>Estado</th></tr></thead>
          <tbody>
            ${g.rows.map(o => {
              const orderNo  = o.outboundOrderNo || o.order_no || ''
              const dispatch = dispatchMap?.get(orderNo)
              const estado   = dispatch ? DISPATCH_LABEL[dispatch.order_estado] ?? dispatch.order_estado : 'Sin folio'
              const time     = o.outboundTime || o.expectedTime || ''
              return `<tr>
                <td>${time ? new Date(time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td class="mono">${orderNo}</td>
                <td class="center">${o.outboundBoxCount ?? '—'}</td>
                <td>${estado}</td>
              </tr>`
            }).join('')}
          </tbody>
          <tfoot><tr><td colspan="4">Subtotal ${g.customer}: ${g.rows.length} orden${g.rows.length !== 1 ? 'es' : ''} · ${g.totalBultos} bultos</td></tr></tfoot>
        </table>
      </div>`).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Agenda Despacho</title>
      <style>
        @page { size: letter; margin: 15mm; }
        body { font-family: Segoe UI, sans-serif; font-size: 10pt; color: #334155; }
        .header { background: #ffedd5; border: 1px solid #fed7aa; padding: 8px 12px; margin-bottom: 12px; }
        .header h1 { margin: 0; color: #9a3412; font-size: 13pt; }
        .header p { margin: 2px 0 0; font-size: 9pt; color: #78716c; }
        .group { margin-bottom: 16px; }
        .group-header { background: #fff7ed; border: 1px solid #fed7aa; padding: 6px 10px; font-weight: 700; font-size: 9.5pt; color: #9a3412; }
        table { width: 100%; border-collapse: collapse; border: 1px solid #fed7aa; }
        th { background: #fff7ed; padding: 5px 6px; font-size: 8.5pt; border-bottom: 1px solid #fed7aa; text-align: left; }
        td { padding: 5px 6px; border-bottom: 1px solid #fee2ca; font-size: 9pt; }
        tfoot td { background: #f1f5f9; font-weight: 700; }
        .mono { font-family: monospace; font-weight: 600; }
        .center { text-align: center; }
        @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
      </style></head><body>
      <div class="header">
        <h1>Agenda de Despacho</h1>
        <p>${dateFrom} → ${dateTo} · ${totalOrders} órdenes · ${totalBultos} bultos</p>
      </div>
      ${rows}
    </body></html>`

    const popup = window.open('', '_blank', 'width=820,height=700,scrollbars=yes')
    if (!popup) return
    popup.document.write(html)
    popup.document.close()
    popup.onafterprint = () => popup.close()
    popup.focus()
    popup.print()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header */}
      <div className="sticky top-0 z-[100] bg-white/90 backdrop-blur-2xl border-b border-warm-100/60 px-5 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-warm-100 text-warm-500 hover:text-warm-700 transition-all">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary-600" />
                <span className="font-bold text-warm-800 text-sm">Agenda de Despacho</span>
              </div>
              <p className="text-xs text-warm-500 ml-6">{dateFrom} → {dateTo}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="badge bg-primary-100 text-primary-700 text-[11px] font-bold">{totalOrders} órdenes</span>
            <span className="badge bg-warm-100 text-warm-600 text-[11px] font-bold">{totalBultos} bultos</span>
            <button onClick={printAgenda} className="btn-ghost text-xs flex items-center gap-1.5">
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-9 max-w-xs transition-all focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100">
          <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
          <input
            type="text"
            placeholder="Buscar orden o cliente..."
            value={q}
            onChange={e => setQ(e.target.value)}
            className="flex-1 text-xs outline-none bg-transparent text-warm-700 focus-visible:outline-none focus-visible:ring-0"
          />
          {q && <button onClick={() => setQ('')}><X className="w-3 h-3 text-warm-400 hover:text-warm-600" /></button>}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16">
            <Package className="w-8 h-8 text-warm-200" />
            <p className="text-sm text-warm-400 font-medium">Sin órdenes para mostrar</p>
          </div>
        ) : groups.map(({ customer, rows, totalBultos: gtb }) => (
          <div key={customer} className="rounded-2xl border border-warm-100 overflow-hidden shadow-sm bg-white">
            {/* Group header */}
            <div className="bg-warm-50 px-4 py-2.5 border-b border-warm-100 flex items-center justify-between">
              <span className="text-xs font-bold text-warm-700 uppercase tracking-wide">DESTINO: {customer}</span>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-warm-400">{rows.length} órdenes</span>
                <span className="text-[10px] text-warm-400">·</span>
                <span className="text-[10px] text-warm-400">{gtb} bultos</span>
              </div>
            </div>

            {/* Table */}
            <table className="w-full text-sm">
              <thead className="bg-warm-50 sticky top-0 z-[5] border-b border-warm-100">
                <tr>
                  <th className="table-header">Horario</th>
                  <th className="table-header">Orden</th>
                  <th className="table-header text-center">Bultos</th>
                  <th className="table-header">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-50">
                {rows.map(order => {
                  const orderNo  = order.outboundOrderNo || order.order_no || ''
                  const dispatch = dispatchMap?.get(orderNo)
                  const estado   = dispatch?.order_estado
                  const time     = order.outboundTime || order.expectedTime || ''
                  return (
                    <tr key={orderNo} className="hover:bg-warm-50/60 transition-colors">
                      <td className="px-4 py-2.5 text-xs text-warm-500">
                        {time ? fmtTimeShort(time) : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs font-semibold text-primary-700">{orderNo}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-xs font-bold text-warm-700">{order.outboundBoxCount ?? '—'}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {estado
                          ? <span className={`text-xs font-semibold ${DISPATCH_CLS[estado] ?? 'text-warm-500'}`}>{DISPATCH_LABEL[estado] ?? estado}</span>
                          : <span className="text-xs text-warm-300">Sin folio</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {/* Subtotal */}
              <tfoot>
                <tr className="bg-warm-50/80">
                  <td colSpan={4} className="px-4 py-2 text-[11px] font-bold text-warm-600">
                    Subtotal {customer}: {rows.length} orden{rows.length !== 1 ? 'es' : ''} · {gtb} bultos
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
