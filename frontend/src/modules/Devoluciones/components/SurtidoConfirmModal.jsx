import { useState, useEffect, useMemo } from 'react'
import { PackageCheck, Search, X, ChevronsUpDown, ChevronUp, ChevronDown, CheckCheck, Printer, AlertTriangle } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import { fmtDate, fmtDateString } from '../../../core/utils/dateFormat'
import { useI18nStore } from '../../../core/stores/i18nStore'

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
        checked ? 'bg-success-500' : 'bg-warm-200'
      }`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-5' : 'translate-x-0.5'
      }`} />
    </button>
  )
}

function SortTh({ label, field, currentField, dir, onSort, className = '' }) {
  const active = field === currentField
  return (
    <th
      className={`py-2 pr-3 text-left text-xs uppercase tracking-wide text-warm-500 cursor-pointer select-none hover:text-warm-700 transition-colors ${className}`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {active
          ? dir === 'asc' ? <ChevronUp className="w-3 h-3 text-primary-500" /> : <ChevronDown className="w-3 h-3 text-primary-500" />
          : <ChevronsUpDown className="w-3 h-3 text-warm-300" />
        }
      </div>
    </th>
  )
}

export default function SurtidoConfirmModal({ isOpen, onClose, items = [], salida = null, onConfirm, saving = false }) {
  const { t } = useI18nStore()
  const [local, setLocal] = useState([])
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  useEffect(() => {
    setLocal(items.map(it => ({
      salida_item_id: it.id,
      sku: it.sku,
      descripcion: it.descripcion,
      codigo_trazabilidad: it.codigo_trazabilidad,
      embalaje1: it.embalaje1,
      ubicacion_nombre: it.ubicacion_nombre || it.ubicacion_codigo,
      cantidad_solicitada: it.cantidad_solicitada,
      cantidad_disponible: it.cantidad_disponible,
      cantidad_surtida: it.cantidad_solicitada,
      surtido: false,
    })))
    setSearch('')
    setSortField(null)
  }, [items, isOpen])

  const update = (id, key, val) =>
    setLocal(prev => prev.map(r => r.salida_item_id === id ? { ...r, [key]: val } : r))

  const markAll = () => {
    const anyOff = local.some(r => !r.surtido)
    setLocal(prev => prev.map(r => ({ ...r, surtido: anyOff })))
  }

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const handleConfirm = () => {
    onConfirm(local.map(r => ({
      salida_item_id: r.salida_item_id,
      cantidad_surtida: r.surtido ? Number(r.cantidad_surtida) : 0,
      surtido: r.surtido,
    })))
  }

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=900,height=700')
    const now = fmtDateString(new Date())
    const codigo = salida?.codigo || '—'
    const responsable = salida?.responsable_nombre || '—'
    const fecha = salida?.created_at ? fmtDate(salida.created_at) : '—'
    const rows = local.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="mono">${r.codigo_trazabilidad || '—'}</td>
        <td><strong>${r.sku || '—'}</strong>${r.descripcion ? `<br><small>${r.descripcion}</small>` : ''}</td>
        <td class="mono">${r.embalaje1 || '—'}</td>
        <td class="center">${r.cantidad_solicitada}</td>
        <td class="center">${r.ubicacion_nombre || '—'}</td>
        <td class="center">${r.surtido ? '✓' : '—'}</td>
      </tr>
    `).join('')
    win.document.write(`<!DOCTYPE html><html><head><title>Orden ${codigo}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Helvetica Neue', sans-serif; font-size: 11px; color: #1a1a1a; padding: 24px; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 12px; }
      .title { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
      .meta { color: #555; font-size: 10px; line-height: 1.6; }
      .meta strong { color: #111; }
      .print-date { font-size: 9px; color: #888; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      thead { background: #f5f5f5; }
      th { padding: 6px 8px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #ddd; }
      td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
      .mono { font-family: monospace; font-size: 10px; }
      .center { text-align: center; }
      tr:nth-child(even) { background: #fafafa; }
      small { color: #888; font-size: 9px; }
      @media print { body { padding: 0; } }
    </style></head><body>
    <div class="header">
      <div>
        <div class="title">Orden de Salida ${codigo}</div>
        <div class="meta">
          <strong>Responsable:</strong> ${responsable}<br>
          <strong>Fecha orden:</strong> ${fecha}<br>
          <strong>Total líneas:</strong> ${local.length} · <strong>Piezas:</strong> ${local.reduce((a, r) => a + Number(r.cantidad_solicitada), 0)}
        </div>
      </div>
      <div class="print-date">Impreso: ${now}</div>
    </div>
    <table>
      <thead><tr>
        <th>#</th><th>Código trazabilidad</th><th>SKU / Descripción</th><th>Embalaje</th><th>Cantidad</th><th>Ubicación</th><th>Surtido</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  const display = useMemo(() => {
    let result = [...local]
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(r =>
        r.sku?.toLowerCase().includes(q) ||
        r.codigo_trazabilidad?.toLowerCase().includes(q) ||
        r.descripcion?.toLowerCase().includes(q) ||
        r.ubicacion_nombre?.toLowerCase().includes(q)
      )
    }
    if (sortField) {
      result = result.slice().sort((a, b) => {
        const av = a[sortField] ?? ''
        const bv = b[sortField] ?? ''
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    }
    return result
  }, [local, search, sortField, sortDir])

  const surtidoCount = local.filter(r => r.surtido).length
  const allSurtido = local.length > 0 && local.every(r => r.surtido)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('dev.surtido_confirm.title')}
      icon={PackageCheck}
      size="xl"
      footer={
        <>
          <div className="flex items-center gap-2 mr-auto">
            <span className="text-xs text-warm-500">
              <span className={`font-bold ${surtidoCount === 0 ? 'text-warm-400' : 'text-success-700'}`}>{surtidoCount}</span>
              <span className="text-warm-400"> / {local.length} {t('dev.surtido_confirm.lineas_surtidas')}</span>
            </span>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-warm-200 bg-warm-50 text-warm-600 hover:bg-warm-100 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" /> {t('dev.surtido_confirm.imprimir')}
            </button>
          </div>
          <button onClick={onClose} className="btn-ghost inline-flex min-w-24 items-center justify-center">{t('dev.surtido_confirm.cancelar')}</button>
          <button
            onClick={handleConfirm}
            disabled={saving || surtidoCount === 0}
            className="btn-primary disabled:opacity-60 inline-flex min-w-36 items-center justify-center gap-2"
          >
            <PackageCheck className="w-4 h-4" />
            {saving ? t('dev.surtido_confirm.completando') : t('dev.surtido_confirm.completar')}
          </button>
        </>
      }
    >
      <div className="space-y-3">

        {/* Summary + irreversibility warning */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-warm-100 bg-warm-50 px-3 py-2">
            <p className="text-[10px] font-bold text-warm-400 uppercase tracking-wide">{t('dev.surtido_confirm.lineas')}</p>
            <p className="text-lg font-black text-warm-800">{local.length}</p>
          </div>
          <div className="rounded-xl border border-primary-100 bg-primary-50 px-3 py-2">
            <p className="text-[10px] font-bold text-primary-400 uppercase tracking-wide">{t('dev.surtido_confirm.piezas_sol')}</p>
            <p className="text-lg font-black text-primary-700">{local.reduce((a, r) => a + Number(r.cantidad_solicitada), 0)}</p>
          </div>
          <div className="rounded-xl border border-success-100 bg-success-50 px-3 py-2">
            <p className="text-[10px] font-bold text-success-500 uppercase tracking-wide">{t('dev.surtido_confirm.lineas_surt')}</p>
            <p className="text-lg font-black text-success-700">{surtidoCount}</p>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-warning-200 bg-warning-50 px-3 py-2.5 text-xs text-warning-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px text-warning-500" />
          <span><span className="font-bold">{t('dev.surtido_confirm.irrev')}</span> {t('dev.surtido_confirm.warning')}</span>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1 bg-warm-50 border border-warm-200 rounded-xl px-3 py-1.5">
            <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('dev.surtido_confirm.search')}
              className="text-xs outline-none bg-transparent text-warm-700 flex-1"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-warm-400 hover:text-warm-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <button
            onClick={markAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-warm-200 bg-warm-50 text-warm-600 hover:bg-warm-100 transition-colors shrink-0"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            {allSurtido ? t('dev.surtido_confirm.desmarcar_todo') : t('dev.surtido_confirm.marcar_todo')}
          </button>
        </div>

        {/* Legend */}
        <p className="text-[11px] text-warm-400">
          {t('dev.surtido_confirm.leyenda')}
        </p>

        {/* Table */}
        <div className="border border-warm-100 rounded-xl overflow-hidden">
          <div className="overflow-y-auto max-h-[360px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-warm-50/95 backdrop-blur-sm border-b border-warm-100">
                <tr>
                  <SortTh label={t('dev.surtido_confirm.col.sku')} field="sku" currentField={sortField} dir={sortDir} onSort={handleSort} className="pl-4" />
                  <SortTh label={t('dev.surtido_confirm.col.codigo')} field="codigo_trazabilidad" currentField={sortField} dir={sortDir} onSort={handleSort} />
                  <SortTh label={t('dev.surtido_confirm.col.ubicacion')} field="ubicacion_nombre" currentField={sortField} dir={sortDir} onSort={handleSort} />
                  <SortTh label={t('dev.surtido_confirm.col.solicitada')} field="cantidad_solicitada" currentField={sortField} dir={sortDir} onSort={handleSort} className="text-right" />
                  <th className="py-2 pr-3 text-right text-xs uppercase tracking-wide text-warm-500">{t('dev.surtido_confirm.col.real')}</th>
                  <th className="py-2 pr-4 text-center text-xs uppercase tracking-wide text-warm-500">{t('dev.surtido_confirm.col.surtido')}</th>
                </tr>
              </thead>
              <tbody>
                {display.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-warm-400">{t('dev.surtido_confirm.sin_resultados')}</td>
                  </tr>
                ) : display.map((row) => {
                  const overStock = !row.surtido && Number(row.cantidad_surtida) > (row.cantidad_disponible ?? Infinity)
                  return (
                    <tr key={row.salida_item_id} className={`border-b border-warm-50 last:border-0 transition-colors ${
                      row.surtido ? 'bg-success-50/30 opacity-60' : 'hover:bg-primary-50/30'
                    }`}>
                      <td className="py-2.5 pl-4 pr-3">
                        <div className="code-main">{row.sku}</div>
                        {row.descripcion && <div className="text-[11px] text-warm-400 mt-0.5">{row.descripcion}</div>}
                      </td>
                      <td className="py-2.5 pr-3"><span className="code-main">{row.codigo_trazabilidad || '—'}</span></td>
                      <td className="py-2.5 pr-3 text-xs text-warm-500">{row.ubicacion_nombre || '—'}</td>
                      <td className="py-2.5 pr-3 text-right text-xs font-medium text-warm-700">{row.cantidad_solicitada}</td>
                      <td className="py-2.5 pr-3 text-right">
                        <input
                          type="number" min="0"
                          value={row.cantidad_surtida}
                          onChange={e => update(row.salida_item_id, 'cantidad_surtida', e.target.value)}
                          onFocus={e => e.target.select()}
                          disabled={row.surtido}
                          className={`w-20 px-2 py-1 rounded-lg border text-xs text-right focus:outline-none focus:ring-2 focus:ring-primary-200 ${
                            overStock ? 'border-danger-400 bg-danger-50 text-danger-700' : 'border-warm-200 bg-white'
                          } disabled:bg-success-50 disabled:border-success-200 disabled:text-success-700`}
                        />
                        {overStock && <div className="text-[10px] text-danger-500 mt-0.5 text-right">{t('dev.surtido_confirm.excede_stock')}</div>}
                      </td>
                      <td className="py-2.5 pr-4 text-center">
                        <Toggle
                          checked={row.surtido}
                          onChange={(v) => update(row.salida_item_id, 'surtido', v)}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  )
}
