import { useState, useRef, useMemo } from 'react'
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, X, Search, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { usePreloaderStore } from '../../../core/stores/preloaderStore'
import { createOrder } from '../services/recepcionService'
import ColumnMappingModal from './ColumnMappingModal'

const SYSTEM_FIELDS = [
  { key: 'cliente',            label: 'Client / Cliente' },
  { key: 'inbound_order_no',   label: 'Inbound Order No.' },
  { key: 'tracking_no',        label: 'Tracking No. / Cargo No.' },
  { key: 'reference_no',       label: 'Reference No.' },
  { key: 'box_type',           label: 'Box Type' },
  { key: 'custom_box_barcode', label: 'Custom Box Barcode' },
  { key: 'sku',                label: 'SKU' },
  { key: 'qty_per_box',        label: 'Qty per box' },
  { key: 'length_oms',         label: 'Length from OMS / OMS长' },
  { key: 'width_oms',          label: 'Width from OMS / OMS宽' },
  { key: 'height_oms',         label: 'Height from OMS / OMS高' },
  { key: 'dimension_unit',     label: 'Unit / 单位 (dimensión)' },
  { key: 'weight_oms',         label: 'Weight from OMS / OMS重量' },
  { key: 'weight_unit',        label: 'Unit / 单位 (peso)' },
]

const HEADER_MAP = {
  // Order-level
  client:                'cliente',
  cliente:               'cliente',
  inboundorderno:        'inbound_order_no',
  trackingno:            'tracking_no',
  cargono:               'tracking_no',
  trackingnocargono:     'tracking_no',
  referenceno:           'reference_no',
  reference:             'reference_no',
  // Line-level
  boxtype:               'box_type',
  customboxbarcode:      'custom_box_barcode',
  sku:                   'sku',
  qtyperbox:             'qty_per_box',
  qtyperctn:             'qty_per_box',
  quantity:              'qty_per_box',
  // Dimensions — "Length from OMS/OMS长" normalizes to "lengthfromomsoms"
  lengthfromomsoms:      'length_oms',
  widthfromomsoms:       'width_oms',
  heightfromomsoms:      'height_oms',
  // Weight — "Weight from OMS/OMS重量" normalizes to "weightfromomsoms"
  weightfromomsoms:      'weight_oms',
  // Units — first "Unit/单位" → "unit", second duplicate → "unit1" (xlsx appends _1)
  unit:                  'dimension_unit',
  unit1:                 'weight_unit',
  // Fallback short forms
  length:                'length_oms',
  width:                 'width_oms',
  height:                'height_oms',
  weight:                'weight_oms',
  omslong:               'length_oms',
  omskuan:               'width_oms',
  omsgao:                'height_oms',
  omszhongliang:         'weight_oms',
}

function normalizeHeader(h) {
  return String(h).toLowerCase().trim().replace(/[^a-z0-9]/g, '')
}

async function parseExcelOnMainThread(file) {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json(worksheet, { defval: '' })
}

function parseExcel(file) {
  return new Promise((resolve, reject) => {
    let worker

    try {
      worker = new Worker(new URL('../workers/importExcel.worker.js', import.meta.url), {
        type: 'module',
      })
    } catch (error) {
      reject(error)
      return
    }

    const cleanup = () => worker.terminate()

    worker.onmessage = (event) => {
      cleanup()
      if (event.data?.ok) {
        resolve(event.data.rows || [])
        return
      }
      reject(new Error(event.data?.error || 'No se pudo procesar el archivo'))
    }

    worker.onerror = () => {
      cleanup()
      reject(new Error('No se pudo procesar el archivo'))
    }

    file.arrayBuffer()
      .then((buffer) => worker.postMessage({ buffer }, [buffer]))
      .catch((error) => {
        cleanup()
        reject(error)
    })
  })
}

function applyMapping(rawRows, mapping) {
  return rawRows.map(row => {
    const out = {}
    for (const [fileCol, sysKey] of Object.entries(mapping)) {
      if (sysKey) out[sysKey] = row[fileCol] ?? ''
    }
    if (out.qty_per_box !== undefined) out.qty_per_box = Number(out.qty_per_box) || null
    if (out.length_oms !== undefined) out.length_oms = Number(out.length_oms) || null
    if (out.width_oms !== undefined) out.width_oms = Number(out.width_oms) || null
    if (out.height_oms !== undefined) out.height_oms = Number(out.height_oms) || null
    if (out.weight_oms !== undefined) out.weight_oms = Number(out.weight_oms) || null
    return out
  })
}

export default function ImportarOrdenModal({ isOpen, onClose, onCreated }) {
  const toast = useToastStore()
  const { t } = useI18nStore()
  const beginPreloader = usePreloaderStore(s => s.begin)
  const endPreloader = usePreloaderStore(s => s.end)
  const fileRef = useRef(null)
  const [step, setStep] = useState('upload') // upload | mapping | review
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [rawRows, setRawRows] = useState([])
  const [fileHeaders, setFileHeaders] = useState([])
  const [mapping, setMapping] = useState({})
  const [mappedRows, setMappedRows] = useState([])
  const [reviewSearch, setReviewSearch] = useState('')
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [duplicateError, setDuplicateError] = useState(null)

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const reset = () => {
    setStep('upload'); setRawRows([]); setFileHeaders([]); setMapping({})
    setMappedRows([]); setReviewSearch(''); setSortKey(null); setSortDir('asc')
    setDuplicateError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const preloaderTask = beginPreloader('Procesando archivo...', 2000)
    setLoading(true)
    try {
      const raw = await parseExcel(file)
      if (raw.length === 0) { toast.error(t('rec.import.err.vacio')); return }

      const headers = Object.keys(raw[0])
      setFileHeaders(headers)
      setRawRows(raw)

      // Try auto-mapping
      const autoMap = {}
      let allMapped = true
      for (const h of headers) {
        const norm = normalizeHeader(h)
        autoMap[h] = HEADER_MAP[norm] || null
        if (!autoMap[h]) allMapped = false
      }
      setMapping(autoMap)

      if (allMapped) {
        setMappedRows(applyMapping(raw, autoMap))
        setStep('review')
      } else {
        setStep('mapping')
      }
    } catch (workerError) {
      try {
        const raw = await parseExcelOnMainThread(file)
        if (raw.length === 0) { toast.error(t('rec.import.err.vacio')); return }

        const headers = Object.keys(raw[0])
        setFileHeaders(headers)
        setRawRows(raw)

        const autoMap = {}
        let allMapped = true
        for (const h of headers) {
          const norm = normalizeHeader(h)
          autoMap[h] = HEADER_MAP[norm] || null
          if (!autoMap[h]) allMapped = false
        }
        setMapping(autoMap)

        if (allMapped) {
          setMappedRows(applyMapping(raw, autoMap))
          setStep('review')
        } else {
          setStep('mapping')
        }
      } catch (fallbackError) {
        const message = fallbackError?.message || workerError?.message || t('rec.import.err.file')
        toast.error(`Error al importar archivo: ${message}`)
      }
    } finally {
      endPreloader(preloaderTask)
      setLoading(false)
      if (e.target) e.target.value = ''
    }
  }

  const handleMappingConfirm = (newMapping) => {
    setMapping(newMapping)
    setMappedRows(applyMapping(rawRows, newMapping))
    setStep('review')
  }

  const handleConfirm = async () => {
    if (mappedRows.length === 0) return
    setDuplicateError(null)
    const count = mappedRows.length
    const preloaderTask = beginPreloader('Importando orden...', 8000)
    setSubmitting(true)
    let result
    try {
      const first = mappedRows[0]
      const payload = {
        cliente: first.cliente || null,
        inbound_order_no: first.inbound_order_no || null,
        tracking_no: first.tracking_no || null,
        reference_no: first.reference_no || null,
        lines: mappedRows.map(r => ({
          box_type: r.box_type || null,
          custom_box_barcode: r.custom_box_barcode || null,
          sku: r.sku || null,
          qty_per_box: r.qty_per_box || null,
          length_oms: r.length_oms || null,
          width_oms: r.width_oms || null,
          height_oms: r.height_oms || null,
          dimension_unit: r.dimension_unit || null,
          weight_oms: r.weight_oms || null,
          weight_unit: r.weight_unit || null,
        })),
      }
      result = await createOrder(payload)
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.duplicateInboundOrder) {
        setDuplicateError(err.response.data)
        return
      }
      const isTimeout = !err.response && (err.code === 'ECONNABORTED' || /timeout/i.test(err.message || ''))
      if (isTimeout) {
        toast.error('La solicitud tardó demasiado. Verifica en la lista si la orden fue creada antes de reintentar.')
      } else {
        toast.error(err.response?.data?.error || t('rec.import.err.file'))
      }
      return
    } finally {
      endPreloader(preloaderTask)
      setSubmitting(false)
    }

    // Success path — reset and navigate
    const order = result?.order
    reset()
    onClose?.()
    toast.success(`Orden ${order?.folio ?? ''} creada con ${count} cajas`)
    try {
      await Promise.resolve(onCreated?.(order))
    } catch (callbackError) {
      console.error('[recepcion] post-import callback:', callbackError)
    }
  }

  const filteredRows = useMemo(() => {
    let rows = reviewSearch
      ? mappedRows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(reviewSearch.toLowerCase())))
      : mappedRows
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortKey] ?? ''
        const bv = b[sortKey] ?? ''
        const an = Number(av), bn = Number(bv)
        const cmp = (!isNaN(an) && !isNaN(bn)) ? an - bn : String(av).localeCompare(String(bv))
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return rows
  }, [mappedRows, reviewSearch, sortKey, sortDir])

  const emptyFieldRows = mappedRows.filter(r =>
    !r.custom_box_barcode && !r.box_type
  ).length

  return (
    <>
      <Modal
        isOpen={isOpen && step !== 'mapping'}
        onClose={() => { onClose(); reset() }}
        title={t('rec.import.title')}
        icon={FileSpreadsheet}
        size="xl"
        footer={
          step === 'review' ? (
            <div className="flex items-center gap-2 w-full">
              <span className="text-xs text-warm-500 flex-1">
                {mappedRows.length} {t('rec.import.detected')}
                {emptyFieldRows > 0 && (
                  <span className="ml-2 text-warning-600">
                    · {emptyFieldRows} {t('rec.import.warn.empty_fields')}
                  </span>
                )}
              </span>
              <button onClick={reset} className="px-4 py-2 rounded-xl border border-warm-200 text-sm text-warm-600">
                {t('rec.import.btn.cancel')}
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting || mappedRows.length === 0}
                className="btn-primary text-sm disabled:opacity-50"
              >
                {submitting ? t('common.loading') : t('rec.import.btn.confirm')}
              </button>
            </div>
          ) : null
        }
      >
        {step === 'upload' && (
          <div className="py-8 text-center space-y-4">
            <div className="text-sm text-warm-600 mb-4">
              {t('rec.import.drag')}
            </div>
            <label className="flex flex-col items-center justify-center gap-3 w-full h-36 border-2 border-dashed border-warm-300 rounded-2xl cursor-pointer hover:border-sky-400 hover:bg-sky-50/30 transition-all">
              {loading ? (
                <div className="text-sm text-warm-500">{t('rec.import.processing')}</div>
              ) : (
                <>
                  <Upload className="w-9 h-9 text-warm-300" />
                  <span className="text-sm text-warm-500">{t('rec.import.drag')}</span>
                  <span className="text-xs text-warm-400">.xlsx / .xls</span>
                </>
              )}
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} disabled={loading} />
            </label>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-3">
            {duplicateError && (
              <div className="flex items-start gap-3 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3">
                <AlertCircle className="w-4 h-4 text-danger-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-danger-700">Orden duplicada — no se puede importar</p>
                  <p className="text-xs text-danger-600 mt-0.5">{duplicateError.error}</p>
                  {duplicateError.existingOrder?.folio && (
                    <p className="text-xs font-mono text-danger-800 mt-1">Orden existente: {duplicateError.existingOrder.folio}</p>
                  )}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success-600" />
              <span className="text-sm font-semibold text-success-700">
                {mappedRows.length} {t('rec.import.detected')}
              </span>
              {emptyFieldRows > 0 && (
                <span className="flex items-center gap-1 text-xs text-warning-600 bg-warning-50 px-2 py-0.5 rounded-full">
                  <AlertCircle className="w-3 h-3" />
                  {emptyFieldRows} {t('rec.import.warn.empty_fields')}
                </span>
              )}
              <div className="ml-auto relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-warm-300" />
                <input
                  value={reviewSearch}
                  onChange={e => setReviewSearch(e.target.value)}
                  placeholder={t('rec.import.search')}
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-warm-200 text-xs focus:outline-none focus:border-primary-400 w-52"
                />
                {reviewSearch && (
                  <button onClick={() => setReviewSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-warm-300">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="border border-warm-100 rounded-xl overflow-hidden">
              <div className="overflow-auto max-h-[50vh]">
                <table className="w-full text-xs table-fixed">
                  <colgroup>
                    <col style={{ width: '2.5rem' }} />
                    <col style={{ width: '9rem' }} />
                    <col style={{ width: '11rem' }} />
                    <col style={{ width: '8rem' }} />
                    <col style={{ width: '5rem' }} />
                    <col style={{ width: '10rem' }} />
                    <col style={{ width: '7rem' }} />
                    <col style={{ width: '9rem' }} />
                    <col style={{ width: '9rem' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-warm-50 border-b border-warm-100 sticky top-0 z-[2]">
                      {[
                        { key: null,               label: '#',                  align: '' },
                        { key: 'box_type',         label: 'Box Type',           align: '' },
                        { key: 'custom_box_barcode', label: 'Custom Barcode',   align: '' },
                        { key: 'sku',              label: 'SKU',                align: '' },
                        { key: 'qty_per_box',      label: 'Qty',                align: 'text-right' },
                        { key: null,               label: 'Medidas (L×W×H)',    align: '' },
                        { key: 'weight_oms',       label: 'Peso',               align: 'text-right' },
                        { key: 'cliente',          label: 'Cliente',            align: '' },
                        { key: 'inbound_order_no', label: 'Orden WMS',          align: '' },
                      ].map(({ key, label, align }, ci) => (
                        <th key={ci} className={`table-header whitespace-nowrap ${align}`}>
                          {key ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 hover:text-primary-700 transition-colors"
                              onClick={() => handleSort(key)}
                            >
                              {label}
                              {sortKey === key
                                ? sortDir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                                : <ArrowUpDown size={10} className="opacity-40" />}
                            </button>
                          ) : label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-50">
                    {filteredRows.map((row, i) => {
                      const hasIssue = !row.custom_box_barcode && !row.box_type
                      const cell = 'px-3 py-2 truncate max-w-0'
                      return (
                        <tr key={i} className={hasIssue ? 'bg-warning-50/40' : ''}>
                          <td className="px-3 py-2 text-warm-400 tabular-nums">{i + 1}</td>
                          <td className={`${cell} font-mono text-warm-600`} title={row.box_type || ''}>
                            {row.box_type || <span className="text-warm-300">—</span>}
                          </td>
                          <td className={`${cell} font-mono text-warm-700`} title={row.custom_box_barcode || ''}>
                            {row.custom_box_barcode || <span className="text-warning-500">vacío</span>}
                          </td>
                          <td className={`${cell} text-warm-700`} title={row.sku || ''}>
                            {row.sku || '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-warm-600 tabular-nums">
                            {row.qty_per_box ?? '—'}
                          </td>
                          <td className={`${cell} font-mono text-warm-500`}>
                            {[row.length_oms, row.width_oms, row.height_oms].some(Boolean)
                              ? `${row.length_oms||'?'}×${row.width_oms||'?'}×${row.height_oms||'?'}${row.dimension_unit ? ` ${row.dimension_unit}` : ''}`
                              : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-warm-500 tabular-nums">
                            {row.weight_oms ? `${row.weight_oms}${row.weight_unit ? ` ${row.weight_unit}` : ''}` : '—'}
                          </td>
                          <td className={`${cell} text-warm-600`} title={row.cliente || ''}>
                            {row.cliente || '—'}
                          </td>
                          <td className={`${cell} font-mono text-warm-500`} title={row.inbound_order_no || ''}>
                            {row.inbound_order_no || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ColumnMappingModal
        isOpen={isOpen && step === 'mapping'}
        fileHeaders={fileHeaders}
        currentMapping={mapping}
        systemFields={SYSTEM_FIELDS}
        onClose={() => { onClose(); reset() }}
        onConfirm={handleMappingConfirm}
      />

    </>
  )
}
