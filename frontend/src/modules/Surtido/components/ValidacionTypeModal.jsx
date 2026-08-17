import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { List, Layers, CalendarDays, ScanBarcode, ArrowRight, Package, Boxes, Loader2 } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { getOutboundBatchByDate } from '../services/surtidoService'
import { buildLotePool } from '../utils/lotePool'

const EASE = [0.16, 1, 0.3, 1]

const TIPO_DEFS = [
  {
    value: 'por_orden',
    icon: List,
    ring: 'border-primary-400',
    gradient: 'from-primary-50/80 to-white',
    iconBg: 'bg-primary-100',
    iconFg: 'text-primary-600',
    dotBg: 'bg-primary-500',
    dotBorder: 'border-primary-400',
    labelKey: 'surtido.lote.tipo.porOrden.label',
    descKey: 'surtido.lote.tipo.porOrden.desc',
  },
  {
    value: 'por_lote',
    icon: Layers,
    ring: 'border-accent-400',
    gradient: 'from-accent-50/80 to-white',
    iconBg: 'bg-accent-100',
    iconFg: 'text-accent-600',
    dotBg: 'bg-accent-500',
    dotBorder: 'border-accent-400',
    labelKey: 'surtido.lote.tipo.porLote.label',
    descKey: 'surtido.lote.tipo.porLote.desc',
  },
]

// Fecha local, no UTC: toISOString() adelanta un día en zonas al oeste de
// Greenwich, que es justo donde opera el almacén.
export function todayDateKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function ValidacionTypeModal({ isOpen, onClose, onSelect }) {
  const { t } = useI18nStore()
  const [tipo, setTipo] = useState(null)
  const [fecha, setFecha] = useState(todayDateKey())

  useEffect(() => {
    if (isOpen) {
      setTipo(null)
      setFecha(todayDateKey())
    }
  }, [isOpen])

  // Al escoger la fecha del lote, se carga de inmediato cuántas órdenes y
  // cajas hay que validar — el operador ve el tamaño del trabajo antes de
  // comprometerse a iniciarlo.
  const { data: batchData, isFetching: cargandoResumen } = useQuery({
    queryKey: ['surtido-lote-preview', fecha],
    queryFn: () => getOutboundBatchByDate(fecha),
    enabled: isOpen && tipo === 'por_lote' && Boolean(fecha),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  })
  const resumenFecha = useMemo(() => {
    if (!batchData) return null
    const pool = buildLotePool(batchData.data?.orders ?? [], fecha)
    return {
      ordenes: pool.orders.length,
      cajas: pool.orders.reduce((sum, o) => sum + o.expectedCount, 0),
    }
  }, [batchData, fecha])

  const puedeContinuar = tipo === 'por_orden' || (tipo === 'por_lote' && Boolean(fecha))

  function handleSubmit() {
    if (!puedeContinuar) return
    onSelect(tipo === 'por_lote' ? { tipo, fecha } : { tipo })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('surtido.lote.tipoModal.title')}
      icon={ScanBarcode}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-sm">
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!puedeContinuar}
            className="btn-primary inline-flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {tipo === 'por_lote' ? t('surtido.lote.iniciar') : t('surtido.validacion.new_tab')}
            <ArrowRight size={14} />
          </button>
        </div>
      }
    >
      <p className="text-xs text-warm-500 mb-3">{t('surtido.lote.tipoModal.subtitle')}</p>

      <div className="space-y-2">
        {TIPO_DEFS.map(opt => {
          const Icon = opt.icon
          const active = tipo === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => setTipo(opt.value)}
              className={`group w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl border-2 transition-all duration-200
                ${active
                  ? `${opt.ring} bg-gradient-to-br ${opt.gradient} shadow-[0_4px_16px_-4px_rgba(0,0,0,0.12)]`
                  : 'border-warm-200 bg-white hover:border-warm-300 hover:shadow-sm'
                }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200
                ${active ? opt.iconBg : 'bg-warm-100 group-hover:bg-warm-200/60'}`}>
                <Icon className={`w-4 h-4 transition-colors duration-200 ${active ? opt.iconFg : 'text-warm-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-xs leading-tight transition-colors duration-200 ${active ? 'text-warm-900' : 'text-warm-600'}`}>
                  {t(opt.labelKey)}
                </p>
                <p className={`text-[11px] mt-0.5 leading-snug transition-colors duration-200 ${active ? 'text-warm-500' : 'text-warm-400'}`}>
                  {t(opt.descKey)}
                </p>
              </div>
              <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all duration-200
                ${active ? `${opt.dotBorder} ${opt.dotBg}` : 'border-warm-300 bg-white'}`}>
                {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
            </button>
          )
        })}
      </div>

      <AnimatePresence>
        {tipo === 'por_lote' && (
          <motion.div
            key="fecha-lote"
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-xl border border-accent-200 bg-accent-50/40 px-3 py-2.5">
              <label className="block text-[11px] font-semibold text-warm-600 mb-1 flex items-center gap-1">
                <CalendarDays size={10} /> {t('surtido.lote.fecha.label')}
              </label>
              <input
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                className="input-field w-full text-xs"
              />
              <p className="mt-1 text-[11px] text-warm-500">{t('surtido.lote.fecha.help')}</p>

              {cargandoResumen ? (
                <div className="mt-2.5 flex items-center gap-2 text-xs text-warm-500">
                  <Loader2 size={12} className="animate-spin" />
                  {t('surtido.lote.fecha.cargandoResumen')}
                </div>
              ) : resumenFecha && (
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-1.5 rounded-lg bg-white/80 border border-accent-200 px-2.5 py-1.5">
                    <Package size={12} className="text-accent-600 shrink-0" />
                    <span className="text-xs font-bold text-warm-800 tabular-nums">{resumenFecha.ordenes}</span>
                    <span className="text-[10px] text-warm-500">{t('surtido.lote.fecha.ordenes')}</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg bg-white/80 border border-accent-200 px-2.5 py-1.5">
                    <Boxes size={12} className="text-accent-600 shrink-0" />
                    <span className="text-xs font-bold text-warm-800 tabular-nums">{resumenFecha.cajas}</span>
                    <span className="text-[10px] text-warm-500">{t('surtido.lote.fecha.cajas')}</span>
                  </div>
                  {resumenFecha.ordenes === 0 && (
                    <p className="col-span-2 text-[11px] text-warning-700">{t('surtido.lote.fecha.sinOrdenes')}</p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  )
}
