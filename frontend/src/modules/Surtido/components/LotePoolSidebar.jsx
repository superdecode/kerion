import { useState } from 'react'
import { CheckCircle2, Clock3, ChevronRight, PanelRightClose, PanelRightOpen, Package } from 'lucide-react'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { fmtTimeShort } from '../../../core/utils/dateFormat'

function OrderDetail({ progreso, operadorNombre, ubicacionPorTarima, t }) {
  return (
    <div className="px-3 pb-3 pt-1 bg-warm-50/60">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-warm-400 mb-1">
        {t('surtido.lote.panel.cajasValidadas')}
      </p>
      {progreso.validated.length === 0 ? (
        <p className="text-[11px] text-warm-400 py-1">{t('surtido.lote.panel.sinValidadas')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-warm-100 bg-white">
          <table className="w-full text-left">
            <thead className="bg-warm-50 sticky top-0 z-[5] border-b border-warm-100">
              <tr>
                <th className="table-header">{t('surtido.validacion.code_header')}</th>
                <th className="table-header">{t('surtido.lote.panel.hora')}</th>
                <th className="table-header">{t('surtido.lote.panel.usuario')}</th>
                <th className="table-header">{t('surtido.lote.panel.ubicacion')}</th>
                <th className="table-header">{t('surtido.lote.panel.tarima')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-100">
              {progreso.validated.map(scan => {
                const ubicacion = ubicacionPorTarima.get(scan.tarimaRef)
                return (
                  <tr key={scan.id}>
                    <td className="px-3 py-1.5 font-mono text-xs text-warm-600">
                      {scan.code}
                      {scan.forcedDateMismatch && (
                        <span className="badge text-[10px] font-semibold ml-1.5 bg-warning-50 text-warning-700">
                          {t('surtido.lote.forzada')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-[11px] text-warm-500 tabular-nums whitespace-nowrap">
                      {fmtTimeShort(new Date(scan.ts))}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-warm-700 font-medium whitespace-nowrap">
                      {operadorNombre}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs text-warm-600 whitespace-nowrap">
                      {ubicacion || (
                        <span className="text-[11px] italic text-warm-400 font-sans">
                          {t('surtido.lote.panel.enTarimaAbierta')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-primary-700 font-semibold whitespace-nowrap">
                      {scan.tarimaRef}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {progreso.pendingBoxes.length > 0 && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-warm-400 mt-2.5 mb-1">
            {t('surtido.lote.panel.cajasPendientes')}
          </p>
          <div className="flex flex-wrap gap-1">
            {progreso.pendingBoxes.map(box => (
              <span
                key={box.canonical}
                className="badge text-[10px] font-semibold bg-warm-100 text-warm-600 font-mono"
              >
                {box.canonical} · {t('surtido.lote.panel.faltan').replace('{n}', box.faltan)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function OrderRow({ order, progreso, expandido, onToggle, operadorNombre, ubicacionPorTarima, t }) {
  const validadas = progreso.validated.length
  return (
    <div className="border-b border-warm-100 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-warm-50 transition-colors"
      >
        <ChevronRight
          size={12}
          className={`shrink-0 text-warm-400 transition-transform ${expandido ? 'rotate-90' : ''}`}
        />
        <div className="min-w-0 flex-1">
          <p className="font-mono font-semibold text-primary-700 text-xs truncate">{order.outboundOrderNo}</p>
          {order.receiverName && (
            <p className="text-xs text-warm-700 font-medium truncate">{order.receiverName}</p>
          )}
        </div>
        <span className="text-[11px] font-semibold text-warm-500 tabular-nums shrink-0">
          {validadas}/{order.expectedCount}
        </span>
      </button>
      {expandido && (
        <OrderDetail
          progreso={progreso}
          operadorNombre={operadorNombre}
          ubicacionPorTarima={ubicacionPorTarima}
          t={t}
        />
      )}
    </div>
  )
}

function Section({ icon: Icon, title, count, tone, children }) {
  return (
    <div>
      <div className="px-3 py-2 flex items-center gap-2 bg-warm-50 border-b border-warm-100">
        <Icon size={12} className={tone} />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-warm-500">{title}</span>
        <span className="ml-auto text-[11px] font-bold text-warm-600 tabular-nums">{count}</span>
      </div>
      {children}
    </div>
  )
}

export default function LotePoolSidebar({ pool, progress, visible, onToggle, operadorNombre, ubicacionPorTarima }) {
  const { t } = useI18nStore()
  const [expandida, setExpandida] = useState(null)

  const completas = pool.orders.filter(o => progress.get(o.outboundOrderNo)?.complete)
  const pendientes = pool.orders.filter(o => !progress.get(o.outboundOrderNo)?.complete)

  if (!visible) {
    return (
      <button
        onClick={onToggle}
        aria-label={t('surtido.lote.panel.title')}
        className="hidden lg:flex w-9 shrink-0 items-start justify-center pt-3 border-l border-warm-100 bg-white text-warm-400 hover:text-warm-700 transition-colors"
      >
        <PanelRightOpen size={16} />
      </button>
    )
  }

  return (
    <aside className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-warm-100 bg-white flex flex-col min-h-0">
      <div className="px-3 py-2.5 border-b border-warm-100 flex items-center gap-2 shrink-0">
        <Package size={13} className="text-primary-500 shrink-0" />
        <span className="text-xs font-semibold text-warm-700">{t('surtido.lote.panel.title')}</span>
        <button
          onClick={onToggle}
          aria-label={t('common.close')}
          className="ml-auto hidden lg:flex w-7 h-7 items-center justify-center rounded-lg text-warm-400 hover:bg-warm-100 transition-colors"
        >
          <PanelRightClose size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <Section
          icon={Clock3}
          title={t('surtido.lote.panel.pendientes')}
          count={pendientes.length}
          tone="text-warning-500"
        >
          {pendientes.map(order => (
            <OrderRow
              key={order.outboundOrderNo}
              order={order}
              progreso={progress.get(order.outboundOrderNo)}
              expandido={expandida === order.outboundOrderNo}
              onToggle={() => setExpandida(expandida === order.outboundOrderNo ? null : order.outboundOrderNo)}
              operadorNombre={operadorNombre}
              ubicacionPorTarima={ubicacionPorTarima}
              t={t}
            />
          ))}
        </Section>

        <Section
          icon={CheckCircle2}
          title={t('surtido.lote.panel.completas')}
          count={completas.length}
          tone="text-success-500"
        >
          {completas.map(order => (
            <OrderRow
              key={order.outboundOrderNo}
              order={order}
              progreso={progress.get(order.outboundOrderNo)}
              expandido={expandida === order.outboundOrderNo}
              onToggle={() => setExpandida(expandida === order.outboundOrderNo ? null : order.outboundOrderNo)}
              operadorNombre={operadorNombre}
              ubicacionPorTarima={ubicacionPorTarima}
              t={t}
            />
          ))}
        </Section>
      </div>
    </aside>
  )
}
