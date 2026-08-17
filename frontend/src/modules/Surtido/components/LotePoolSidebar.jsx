import { memo, useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { CheckCircle2, PanelRightClose, Search, X, Copy, Trash2 } from 'lucide-react'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { fmtTimeShort, fmtDateTime } from '../../../core/utils/dateFormat'

// Mismo patrón que OrderSearchBox en Despacho/ValidarPorDestino: debounce corto,
// input controlado localmente para no re-renderizar la lista en cada tecla.
const SidebarSearchBox = memo(function SidebarSearchBox({ onSearchChange, placeholder }) {
  const [value, setValue] = useState('')
  const timerRef = useRef(null)

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const commit = useCallback((nextValue, delay = 120) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onSearchChange(nextValue), delay)
  }, [onSearchChange])

  const update = (nextValue) => { setValue(nextValue); commit(nextValue) }
  const clear = () => { setValue(''); commit('', 0) }

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-primary-100/80 bg-gradient-to-r from-white via-primary-50/55 to-white px-3 h-9 shadow-[0_8px_18px_-14px_rgba(37,99,235,0.45)] focus-within:border-primary-300 focus-within:ring-1 focus-within:ring-primary-100 transition-all">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100/80 shrink-0">
        <Search className="w-3 h-3 text-primary-500" />
      </div>
      <input
        value={value}
        onChange={e => update(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent text-[13px] text-warm-700 outline-none placeholder:text-warm-400 focus-visible:outline-none"
      />
      {value && (
        <button type="button" onClick={clear} className="text-warm-400 hover:text-warm-600 shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
})

// Estado único por orden — reemplaza el desglose "falta N" repetido por caja:
// un solo badge que dice qué hace falta hacer con la orden. Una orden ya
// validada (en este lote o en cualquier otra sesión) se llama "Validada" sin
// más — no hay un estado distinto de "ya" para el operador.
function estadoOrden(completa, t) {
  if (completa) return { label: t('surtido.lote.panel.validada'), cls: 'bg-success-100 text-success-700' }
  return { label: t('surtido.lote.panel.pendiente'), cls: 'bg-warm-100 text-warm-600' }
}

function OrderDetail({ progreso, operadorNombre, ubicacionPorTarima, snapshot, canRemoveScanById, onRemoveScan, t }) {
  // Validada en otra sesión (por orden, o por lote en otro momento): no hay
  // desglose de cajas que mostrar aquí — esos escaneos viven en aquella
  // sesión, no en este borrador. Se muestra quién y cuándo la cerró.
  if (snapshot) {
    return (
      <div className="px-3.5 pb-3.5 pt-1 border-t border-warm-100">
        <div className="rounded-lg bg-success-50 border border-success-100 px-3 py-2.5">
          <p className="text-[11px] font-semibold text-success-700">
            {t('surtido.lote.panel.validadaPrevia')}
          </p>
          <p className="text-[10px] text-warm-500 mt-0.5">
            {snapshot.operator_nombre || '—'}
            {snapshot.completed_at ? ` · ${fmtDateTime(snapshot.completed_at)}` : ''}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-3.5 pb-3.5 pt-1 border-t border-warm-100">
      {progreso.pendingBoxes.length > 0 && (
        <div className="mb-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-warm-400 mb-1">
            {t('surtido.lote.panel.cajasPendientes')} ({progreso.pendingBoxes.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {progreso.pendingBoxes.map(box => (
              <span key={box.canonical} className="badge text-[10px] font-mono font-semibold bg-warm-100 text-warm-600">
                {box.canonical}
              </span>
            ))}
          </div>
        </div>
      )}

      {progreso.validated.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-warm-400 mb-1">
            {t('surtido.lote.panel.cajasValidadas')} ({progreso.validated.length})
          </p>
          <div className="space-y-1">
            {progreso.validated.map(scan => {
              const puedeBorrar = canRemoveScanById?.(scan.id)
              return (
                <div key={scan.id} className="flex items-center gap-1.5 text-[11px]">
                  <CheckCircle2 size={10} className="text-success-500 shrink-0" />
                  <span className="font-mono text-warm-600 truncate">{scan.code}</span>
                  {scan.forcedDateMismatch && (
                    <span className="badge text-[9px] font-semibold bg-warning-50 text-warning-700 shrink-0">
                      {t('surtido.lote.forzada')}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-warm-400 tabular-nums">{fmtTimeShort(new Date(scan.ts))}</span>
                  <span className="shrink-0 font-mono font-semibold text-primary-700">{scan.tarimaRef}</span>
                  {puedeBorrar && (
                    <button
                      onClick={() => onRemoveScan(scan.id)}
                      aria-label={t('surtido.lote.scan.eliminar')}
                      className="shrink-0 text-warm-300 hover:text-danger-600 transition-colors"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-1.5 text-[10px] text-warm-400">
            {operadorNombre} · {ubicacionPorTarima.get(progreso.validated[0]?.tarimaRef) || '—'}
          </p>
        </div>
      )}
    </div>
  )
}

function OrderCard({ order, progreso, expandido, onToggle, operadorNombre, ubicacionPorTarima, snapshot, canRemoveScanById, onRemoveScan, t, addToast }) {
  // Una orden ya validada en otra sesión no tiene escaneos EN ESTE borrador
  // (progreso.validated viene vacío) — su conteo real es el que reporta el
  // snapshot del servidor, no el de este lote.
  const completa = Boolean(snapshot) || progreso.complete
  const validadas = snapshot ? snapshot.total_scanned : progreso.validated.length
  const esperadas = snapshot ? snapshot.total_expected : order.expectedCount
  const estado = estadoOrden(completa, t)

  return (
    <div className={`rounded-2xl border transition-all ${
      completa ? 'border-success-200 bg-gradient-to-br from-success-50/60 via-white to-white' : 'border-warm-200/90 bg-white'
    }`}>
      <button type="button" onClick={onToggle} className="w-full text-left p-3">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation()
              try { await navigator.clipboard.writeText(order.outboundOrderNo); addToast(t('surtido.lote.panel.ordenCopiada'), 'success') } catch {}
            }}
            title={t('surtido.lote.panel.copiarOrden')}
            className="group inline-flex min-w-0 items-start gap-1.5 text-left"
          >
            <span className="min-w-0 font-mono text-xs font-black text-primary-700 break-all">{order.outboundOrderNo}</span>
            <Copy className="h-3 w-3 shrink-0 text-warm-300 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black tabular-nums ${
            completa ? 'bg-success-100 text-success-700' : 'bg-warm-100 text-warm-600'
          }`}>
            {validadas}/{esperadas}
          </span>
        </div>
        {order.receiverName && (
          <p className="mt-1 text-[11px] text-warm-500 font-medium truncate">{order.receiverName}</p>
        )}
        <span className={`mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${estado.cls}`}>
          {estado.label}
        </span>
      </button>
      {expandido && (
        <OrderDetail
          progreso={progreso}
          operadorNombre={operadorNombre}
          ubicacionPorTarima={ubicacionPorTarima}
          snapshot={snapshot}
          canRemoveScanById={canRemoveScanById}
          onRemoveScan={onRemoveScan}
          t={t}
        />
      )}
    </div>
  )
}

const FILTROS = ['todas', 'pendientes', 'completas']

export default function LotePoolSidebar({ pool, progress, visible, onToggle, operadorNombre, ubicacionPorTarima, validatedOrders, validationSnapshots, canRemoveScanById, onRemoveScan }) {
  const { t } = useI18nStore()
  const { addToast } = useToastStore()
  const [expandida, setExpandida] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todas')

  // Efectivamente completa: o se llenó en este borrador, o el servidor ya
  // reporta la orden como validada en otra sesión. Los filtros y el conteo de
  // arriba tienen que coincidir con lo que ve cada tarjeta.
  const esCompleta = useCallback((o) => (
    (validatedOrders?.has(o.outboundOrderNo) ?? false) || (progress.get(o.outboundOrderNo)?.complete ?? false)
  ), [validatedOrders, progress])

  const buscadas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return pool.orders
    return pool.orders.filter(o =>
      o.outboundOrderNo.toLowerCase().includes(q) || o.receiverName?.toLowerCase().includes(q)
    )
  }, [pool.orders, busqueda])

  const counts = useMemo(() => ({
    todas: buscadas.length,
    pendientes: buscadas.filter(o => !esCompleta(o)).length,
    completas: buscadas.filter(o => esCompleta(o)).length,
  }), [buscadas, esCompleta])

  const filtradas = useMemo(() => {
    if (filtro === 'pendientes') return buscadas.filter(o => !esCompleta(o))
    if (filtro === 'completas') return buscadas.filter(o => esCompleta(o))
    return buscadas
  }, [buscadas, filtro, esCompleta])

  // El botón para reabrir el panel colapsado vive en la cabecera de la
  // página (junto a Cancelar/Confirmar) — no aquí, para no duplicar controles.
  if (!visible) return null

  return (
    <aside className="w-full lg:w-[22rem] shrink-0 border-t lg:border-t-0 lg:border-l border-warm-100 bg-gradient-to-b from-white via-white to-primary-50/20 flex flex-col min-h-0">
      <div className="px-3.5 pt-3 pb-2.5 border-b border-warm-100 shrink-0">
        <div className="flex items-center gap-2 mb-2.5">
          <h4 className="min-w-0 flex-1 truncate text-[13px] font-bold text-warm-700">{t('surtido.lote.panel.title')}</h4>
          <span className="badge shrink-0 bg-primary-100 text-primary-700 text-[11px] font-semibold">{pool.orders.length}</span>
          <button
            onClick={onToggle}
            aria-label={t('common.close')}
            className="hidden lg:flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-warm-400 hover:bg-warm-100 transition-colors"
          >
            <PanelRightClose size={14} />
          </button>
        </div>

        <SidebarSearchBox onSearchChange={setBusqueda} placeholder={t('surtido.lote.panel.buscarPlaceholder')} />

        <div className="grid grid-cols-3 gap-1.5 mt-2">
          {FILTROS.map(k => (
            <button
              key={k}
              onClick={() => setFiltro(k)}
              className={`h-8 px-2 text-[11px] font-semibold rounded-lg border transition-all ${
                filtro === k
                  ? k === 'completas' ? 'bg-success-100 text-success-700 border-success-200'
                    : k === 'pendientes' ? 'bg-warning-100 text-warning-700 border-warning-200'
                    : 'bg-primary-100 text-primary-700 border-primary-200'
                  : 'bg-white text-warm-500 border-warm-200 hover:border-warm-300'
              }`}
            >
              <span className="flex items-center justify-between gap-1">
                <span>{t(`surtido.lote.panel.filtro.${k}`)}</span>
                <span className={`inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums ${
                  filtro === k ? 'bg-white/70' : 'bg-warm-100 text-warm-600'
                }`}>
                  {counts[k]}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtradas.length === 0 ? (
          <div className="py-9 text-center text-sm text-warm-400">
            {busqueda ? t('surtido.lote.panel.sinResultados') : t('surtido.lote.panel.sinOrdenes')}
          </div>
        ) : (
          filtradas.map(order => (
            <OrderCard
              key={order.outboundOrderNo}
              order={order}
              progreso={progress.get(order.outboundOrderNo)}
              expandido={expandida === order.outboundOrderNo}
              onToggle={() => setExpandida(expandida === order.outboundOrderNo ? null : order.outboundOrderNo)}
              operadorNombre={operadorNombre}
              ubicacionPorTarima={ubicacionPorTarima}
              snapshot={validationSnapshots?.get(order.outboundOrderNo) ?? null}
              canRemoveScanById={canRemoveScanById}
              onRemoveScan={onRemoveScan}
              t={t}
              addToast={addToast}
            />
          ))
        )}
      </div>
    </aside>
  )
}
