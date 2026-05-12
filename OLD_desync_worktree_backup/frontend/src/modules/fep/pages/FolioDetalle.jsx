import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import {
  FileText, ArrowLeft, Printer, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight,
  Clock, User, Package, CheckCircle, XCircle, Download, Copy
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useToastStore } from '../../../core/stores/toastStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { getFolio, getFolioLog, downloadPdf } from '../services/fepService'
import { fmtDate, fmtDateTime, getToday } from '../../../core/utils/dateFormat'

const ESTADO_COLORS = {
  ACTIVO: 'bg-success-100 text-success-700',
  CANCELADO: 'bg-danger-100 text-danger-700',
  COMPLETADO: 'bg-primary-100 text-primary-700',
}

const TABS = [
  { id: 'guias', label: 'Guías', icon: FileText },
  { id: 'tarimas', label: 'Tarimas', icon: Package },
  { id: 'historial', label: 'Historial', icon: Clock },
]

const GUIAS_PER_PAGE = 25

export default function FolioDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToastStore.getState()
  const { getPermissionLevel } = useAuthStore()

  const [activeTab, setActiveTab] = useState('guias')
  const [expandedTarima, setExpandedTarima] = useState(null)
  const [guiaPage, setGuiaPage] = useState(1)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [copiedCode, setCopiedCode] = useState(null)
  const foliosLevel = getPermissionLevel('fep.folios')
  const canPrintFolios = ['crear', 'actualizar', 'eliminar'].includes(foliosLevel)
  const canExportFolios = ['actualizar', 'eliminar'].includes(foliosLevel)

  const { data: detailData, isLoading } = useQuery({
    queryKey: ['fep-folio-detail', id],
    queryFn: () => getFolio(id),
  })
  const { data: logData } = useQuery({
    queryKey: ['fep-folio-log', id],
    queryFn: () => getFolioLog(id),
  })

  const folio = detailData?.folio
  const tarimas = detailData?.tarimas || []
  const guias = detailData?.guias || []
  const log = logData?.log || []

  // Guías pagination
  const guiaPages = Math.max(1, Math.ceil(guias.length / GUIAS_PER_PAGE))
  const guiasPage = guias.slice((guiaPage - 1) * GUIAS_PER_PAGE, guiaPage * GUIAS_PER_PAGE)

  const handlePrint = async () => {
    if (!folio || !canPrintFolios) return
    setDownloadingPdf(true)
    try {
      const blob = await downloadPdf(id)
      const url = URL.createObjectURL(blob)
      const iframe = document.createElement('iframe')
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;'
      document.body.appendChild(iframe)
      iframe.src = url
      iframe.onload = () => {
        iframe.contentWindow.focus()
        iframe.contentWindow.print()
        setTimeout(() => {
          document.body.removeChild(iframe)
          URL.revokeObjectURL(url)
        }, 5000)
      }
    } catch {
      toast.error('Error generando PDF')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCode(text)
      setTimeout(() => setCopiedCode(null), 1500)
    })
  }

  const handleExcelExport = () => {
    if (!folio || !canExportFolios) return
    try {
      const wb = XLSX.utils.book_new()
      const wsData = [
        ['Folio', folio.folio_numero],
        ['Empresa', folio.empresa_nombre],
        ['Estado', folio.estado],
        ['Creado por', folio.creado_por_nombre || ''],
        ['Fecha creación', fmtDateTime(folio.created_at)],
        ['Total tarimas', folio.total_tarimas],
        ['Total guías', folio.total_guias],
        ...(folio.motivo_cancelacion ? [['Motivo cancelación', folio.motivo_cancelacion]] : []),
        [],
        ['#', 'Código Guía', 'Tarima', 'Canal', 'Posición', 'Hora Escaneo'],
        ...guias.map((g, i) => [
          i + 1,
          g.codigo_guia,
          g.tarima_codigo,
          g.canal_nombre,
          g.posicion,
          g.timestamp_escaneo ? fmtDateTime(g.timestamp_escaneo) : '',
        ]),
      ]
      const ws = XLSX.utils.aoa_to_sheet(wsData)
      ws['!cols'] = [{ wch: 18 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 22 }]
      XLSX.utils.book_append_sheet(wb, ws, 'Folio')
      XLSX.writeFile(wb, `${folio.folio_numero}_${getToday()}.xlsx`)
    } catch {
      toast.error('Error exportando Excel')
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Detalle de Folio" />
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner text="Cargando folio..." />
        </div>
      </div>
    )
  }

  if (!folio) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Detalle de Folio" />
        <div className="flex-1 flex items-center justify-center flex-col gap-3 text-warm-400">
          <FileText className="w-10 h-10 opacity-40" />
          <p className="text-sm">Folio no encontrado</p>
          <button onClick={() => navigate('/dropscan/folios')}
            className="text-xs text-primary-600 hover:underline font-semibold">
            Volver a Folios
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title={
          <div className="flex items-center gap-2.5">
            <span>{folio.folio_numero}</span>
            <span className={`badge text-xs px-2.5 py-0.5 ${ESTADO_COLORS[folio.estado] || 'bg-warm-100 text-warm-600'}`}>
              {folio.estado}
            </span>
          </div>
        }
        subtitle={`${folio.empresa_nombre} · ${folio.creado_por_nombre || ''}`}
        actions={
          <div className="flex items-center gap-2">
            {canExportFolios && (
              <button onClick={handleExcelExport}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-success-50 text-success-700 border border-success-200 rounded-xl hover:bg-success-100 transition-colors">
                <Download className="w-4 h-4" />
                Exportar Excel
              </button>
            )}
            {canPrintFolios && (
              <button onClick={handlePrint} disabled={downloadingPdf}
                className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
                {downloadingPdf
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Printer className="w-4 h-4" />}
                {downloadingPdf ? 'Generando...' : 'Imprimir'}
              </button>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4 w-full">
          {/* Back button + cancel reason */}
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/dropscan/folios')}
              className="p-2 rounded-xl hover:bg-warm-100 text-warm-500 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            {folio.motivo_cancelacion && (
              <span className="text-xs text-danger-600 font-medium">⚠ {folio.motivo_cancelacion}</span>
            )}
          </div>

          {/* Info cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Empresa', value: folio.empresa_nombre, icon: Package },
              { label: 'Creación', value: fmtDateTime(folio.created_at), icon: Clock },
              { label: 'Tarimas', value: folio.total_tarimas, icon: Package },
              { label: 'Guías', value: folio.total_guias, icon: FileText },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="card p-4">
                <div className="flex items-center gap-1.5 text-warm-400 text-xs mb-1">
                  <Icon className="w-3.5 h-3.5" /> {label}
                </div>
                <div className="font-semibold text-warm-800 text-sm truncate">{value}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="card overflow-hidden">
            <div className="flex border-b border-warm-100">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                    activeTab === tab.id
                      ? 'text-primary-600 border-primary-500 bg-primary-50/30'
                      : 'text-warm-500 border-transparent hover:text-warm-700 hover:bg-warm-50'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                  {tab.id === 'guias' && (
                    <span className="ml-1 badge bg-warm-100 text-warm-500 text-[10px]">{guias.length}</span>
                  )}
                  {tab.id === 'tarimas' && (
                    <span className="ml-1 badge bg-warm-100 text-warm-500 text-[10px]">{tarimas.length}</span>
                  )}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                {/* ── Tab: Guías ── */}
                {activeTab === 'guias' && (
                  <div>
                    {guias.length === 0 ? (
                      <div className="p-12 text-center text-sm text-warm-400">Sin guías registradas</div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-warm-50 border-b border-warm-100">
                                <th className="table-header w-12 text-center">#</th>
                                <th className="table-header">Guía</th>
                                <th className="table-header">Tarima</th>
                                <th className="table-header">Canal</th>
                                <th className="table-header text-center">Pos.</th>
                                <th className="table-header">Hora Escaneo</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-warm-50">
                              {guiasPage.map((g, i) => (
                                <tr key={g.codigo_guia + i} className="hover:bg-warm-50/50 transition-colors">
                                  <td className="table-cell text-center text-warm-400 text-xs">
                                    {(guiaPage - 1) * GUIAS_PER_PAGE + i + 1}
                                  </td>
                                  <td className="table-cell font-mono font-semibold text-warm-800">{g.codigo_guia}</td>
                                  <td className="table-cell font-mono text-warm-600 text-xs">{g.tarima_codigo}</td>
                                  <td className="table-cell text-warm-500">{g.canal_nombre}</td>
                                  <td className="table-cell text-center text-warm-500">{g.posicion}</td>
                                  <td className="table-cell text-warm-400 text-xs">
                                    {g.timestamp_escaneo ? fmtDateTime(g.timestamp_escaneo) : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {/* Pagination */}
                        {guiaPages > 1 && (
                          <div className="flex items-center justify-between px-5 py-3 border-t border-warm-100 bg-warm-50/30">
                            <p className="text-xs text-warm-400">
                              Página {guiaPage}/{guiaPages} · {guias.length} guías
                            </p>
                            <div className="flex items-center gap-1">
                              <button onClick={() => setGuiaPage(1)} disabled={guiaPage === 1}
                                className="px-2 py-1.5 rounded-lg text-xs text-warm-500 hover:bg-warm-100 disabled:opacity-30 transition-all">«</button>
                              <button onClick={() => setGuiaPage(p => Math.max(1, p - 1))} disabled={guiaPage === 1}
                                className="p-1.5 rounded-lg hover:bg-warm-100 disabled:opacity-30 transition-all">
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                              <span className="px-2 text-xs font-semibold text-warm-600">{guiaPage}</span>
                              <button onClick={() => setGuiaPage(p => Math.min(guiaPages, p + 1))} disabled={guiaPage === guiaPages}
                                className="p-1.5 rounded-lg hover:bg-warm-100 disabled:opacity-30 transition-all">
                                <ChevronRight className="w-4 h-4" />
                              </button>
                              <button onClick={() => setGuiaPage(guiaPages)} disabled={guiaPage === guiaPages}
                                className="px-2 py-1.5 rounded-lg text-xs text-warm-500 hover:bg-warm-100 disabled:opacity-30 transition-all">»</button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* ── Tab: Tarimas ── */}
                {activeTab === 'tarimas' && (
                  <div>
                    {tarimas.length === 0 ? (
                      <div className="p-12 text-center text-sm text-warm-400">Sin tarimas</div>
                    ) : (
                      <div className="divide-y divide-warm-50">
                        {tarimas.map(t => {
                          const tGuias = guias.filter(g => g.tarima_codigo === t.codigo)
                          return (
                            <div key={t.id}>
                              <button
                                onClick={() => setExpandedTarima(expandedTarima === t.id ? null : t.id)}
                                className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-warm-50/60 text-left transition-colors group/row"
                              >
                                <div className="flex-1 grid grid-cols-4 gap-4 text-sm">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono font-semibold text-primary-700">{t.codigo}</span>
                                    <button
                                      onClick={e => { e.stopPropagation(); copyToClipboard(t.codigo) }}
                                      className="opacity-0 group-hover/row:opacity-100 p-0.5 rounded hover:bg-primary-100 text-warm-400 hover:text-primary-600 transition-all"
                                      title="Copiar código"
                                    >
                                      {copiedCode === t.codigo
                                        ? <CheckCircle className="w-3.5 h-3.5 text-success-500" />
                                        : <Copy className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                  <span className="text-warm-600">{t.canal_nombre}</span>
                                  <span className="text-warm-500">{t.cantidad_guias} guías</span>
                                  <span className="text-warm-400 text-xs">{fmtDate(t.fecha_inicio)}</span>
                                </div>
                                {expandedTarima === t.id
                                  ? <ChevronUp className="w-4 h-4 text-warm-400 shrink-0" />
                                  : <ChevronDown className="w-4 h-4 text-warm-400 shrink-0" />}
                              </button>

                              <AnimatePresence>
                                {expandedTarima === t.id && (
                                  <motion.div
                                    initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="px-5 pb-4 bg-warm-50/40 space-y-3">
                                      {/* Info cards */}
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3">
                                        {[
                                          { icon: Package, label: 'Canal', value: t.canal_nombre },
                                          { icon: FileText, label: 'Guías', value: t.cantidad_guias },
                                          { icon: Clock, label: 'Inicio', value: fmtDate(t.fecha_inicio) },
                                          { icon: Clock, label: 'Cierre', value: t.fecha_cierre ? fmtDate(t.fecha_cierre) : '—' },
                                        ].map(({ icon: Icon, label, value }) => (
                                          <div key={label} className="flex items-start gap-2 p-2 rounded-lg bg-white border border-warm-100">
                                            <Icon className="w-3.5 h-3.5 text-warm-400 mt-0.5 shrink-0" />
                                            <div className="min-w-0">
                                              <p className="text-[9px] text-warm-400 font-semibold uppercase tracking-wider">{label}</p>
                                              <p className="text-xs font-semibold text-warm-700 truncate">{value}</p>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                      {tGuias.length === 0 ? (
                                        <p className="text-xs text-warm-400 py-2">Sin guías</p>
                                      ) : (
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="text-warm-400 border-b border-warm-100">
                                              <th className="text-left py-1.5 pr-4 font-semibold">#</th>
                                              <th className="text-left pr-4 font-semibold">Guía</th>
                                              <th className="text-left font-semibold">Hora Escaneo</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {tGuias.map((g, i) => (
                                              <tr key={g.codigo_guia + i} className="border-b border-warm-50 last:border-0">
                                                <td className="py-1 pr-4 text-warm-400">{i + 1}</td>
                                                <td className="font-mono pr-4 text-warm-700">{g.codigo_guia}</td>
                                                <td className="text-warm-400">{g.timestamp_escaneo ? fmtDateTime(g.timestamp_escaneo) : '—'}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Tab: Historial ── */}
                {activeTab === 'historial' && (
                  <div className="p-5 space-y-5">
                    {/* Summary */}
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold text-warm-500 uppercase tracking-wider">Registro del folio</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          { label: 'Creado por', value: folio.creado_por_nombre || '—', icon: User },
                          { label: 'Fecha creación', value: fmtDateTime(folio.created_at), icon: Clock },
                          { label: 'Empresa', value: folio.empresa_nombre, icon: Package },
                          { label: 'Estado actual', value: folio.estado, icon: CheckCircle },
                          { label: 'Total tarimas', value: folio.total_tarimas, icon: Package },
                          { label: 'Total guías', value: folio.total_guias, icon: FileText },
                        ].map(({ label, value, icon: Icon }) => (
                          <div key={label} className="flex items-start gap-3 p-3 rounded-xl bg-warm-50 border border-warm-100">
                            <Icon className="w-4 h-4 text-warm-400 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[10px] text-warm-400 font-semibold uppercase tracking-wider">{label}</p>
                              <p className="text-sm font-semibold text-warm-800 truncate">{value}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Log timeline */}
                    {log.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-xs font-bold text-warm-500 uppercase tracking-wider">Línea de tiempo</h3>
                        <div className="space-y-2">
                          {log.map(entry => (
                            <div key={entry.id} className="flex items-start gap-3 text-sm">
                              <div className="w-2 h-2 rounded-full bg-primary-400 mt-1.5 shrink-0" />
                              <div className="flex-1 pb-2 border-b border-warm-50 last:border-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-warm-700">{entry.accion}</span>
                                  <span className="text-warm-400 text-xs">{fmtDateTime(entry.timestamp)}</span>
                                  {entry.usuario_nombre && (
                                    <span className="text-warm-500 text-xs flex items-center gap-1">
                                      <User className="w-3 h-3" /> {entry.usuario_nombre}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
