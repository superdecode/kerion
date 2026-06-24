import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Save,
  Link2,
  Wifi,
  WifiOff,
  Lock,
  ShieldCheck,
  Info,
  FileSpreadsheet,
  Copy,
  Download,
  ListChecks,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { useWmsHubStore } from '../stores/wmsHubStore'
import { fmtTime } from '../../../core/utils/dateFormat'
import { getConfig, saveSheetConfig } from '../services/wmsHubService'
import { testSheetUrl, invalidateUrlCache, getCacheTimestamp } from '../services/googleSheetsService'

const SHEET_TEMPLATES = [
  {
    key: 'inventory',
    titleKey: 'wmshub.config.guide.inventory_title',
    descriptionKey: 'wmshub.config.guide.inventory_desc',
    filename: 'plantilla_inventario_wms.csv',
    headers: [
      'Customize Barcode/自定义箱条码',
      'Available stock/可用库存',
      'Locked Inventory/锁定库存',
      'sku',
      'Box type No./箱类型号',
      'Product name/产品名称',
      'cell no/库位',
    ],
    sample: (t) => [
      'BX-000001',
      '1',
      '0',
      'SKU-001',
      'CAJA-M',
      t('wmshub.config.guide.sample_product'),
      'A01-01',
    ],
  },
  {
    key: 'outbound',
    titleKey: 'wmshub.config.guide.outbound_title',
    descriptionKey: 'wmshub.config.guide.outbound_desc',
    filename: 'plantilla_ordenes_wms.csv',
    headers: [
      'Outbound_出库单号',
      'Shipping service_物流渠道',
      '货件追踪码/Reference ID',
      'Reference order No._参考单号',
      'Recipient_收件人',
      'Expected Arrival Time _ 期望到仓时间',
      'Box type No_箱类型号',
      'Custom box barcode_自定义箱条码',
    ],
    sample: (t) => [
      'OBC-000001',
      t('wmshub.config.guide.sample_carrier'),
      'TRK-000001',
      'REF-000001',
      t('wmshub.config.guide.sample_customer'),
      '2026-06-23 09:00',
      'CAJA-M',
      'BX-000001',
    ],
  },
]

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function buildTemplateCsv(template, t) {
  return [template.headers, template.sample(t)]
    .map(row => row.map(csvEscape).join(','))
    .join('\n')
}

export default function Configuracion() {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const { getPermissionLevel, hasPermission } = useAuthStore()
  const wmsLevel = getPermissionLevel('sistema.wms')
  const canEdit = ['actualizar', 'eliminar'].includes(wmsLevel)
  const canOpenSetupGuide = hasPermission('sistema.wms', 'crear')

  const { sheetsValidated, setSheetsValidated, clearSheetsValidated } = useWmsHubStore()

  const [sheetInventoryUrl, setSheetInventoryUrl] = useState('')
  const [sheetOutboundUrl, setSheetOutboundUrl] = useState('')
  const [sheetTestResults, setSheetTestResults] = useState({})
  const [validating, setValidating] = useState(false)
  const [showSetupGuide, setShowSetupGuide] = useState(false)
  const [invTs] = useState(() => getCacheTimestamp('inventory'))
  const [outTs] = useState(() => getCacheTimestamp('outbound'))

  const { data: configData } = useQuery({
    queryKey: ['wms-config'],
    queryFn: getConfig,
    staleTime: 30000,
    retry: 0,
  })

  useEffect(() => {
    if (configData?.data?.sheet_inventory_url) setSheetInventoryUrl(configData.data.sheet_inventory_url)
    if (configData?.data?.sheet_outbound_url)  setSheetOutboundUrl(configData.data.sheet_outbound_url)
  }, [configData?.data?.sheet_inventory_url, configData?.data?.sheet_outbound_url])

  const saveSheetsMut = useMutation({
    mutationFn: () => saveSheetConfig({
      sheet_inventory_url: sheetInventoryUrl.trim() || null,
      sheet_outbound_url:  sheetOutboundUrl.trim()  || null,
    }),
    onSuccess: () => {
      invalidateUrlCache()
      toast.success(t('wmshub.config.sheet_saved'))
      qc.invalidateQueries({ queryKey: ['wms-config'] })
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  async function handleTestSheet(url, type) {
    setSheetTestResults(prev => ({ ...prev, [type]: { loading: true } }))
    try {
      const result = await testSheetUrl(url, type)
      setSheetTestResults(prev => ({ ...prev, [type]: { ok: true, rowCount: result.rowCount, mappedFields: result.mappedFields } }))
      return true
    } catch (err) {
      setSheetTestResults(prev => ({ ...prev, [type]: { ok: false, error: err.message } }))
      return false
    }
  }

  async function handleValidateAll() {
    if (!hasInventoryUrl && !hasOutboundUrl) return
    setValidating(true)
    const urls = [
      hasInventoryUrl && { url: configData.data.sheet_inventory_url, type: 'inventory' },
      hasOutboundUrl  && { url: configData.data.sheet_outbound_url,  type: 'outbound'  },
    ].filter(Boolean)
    const results = await Promise.all(urls.map(({ url, type }) => handleTestSheet(url, type)))
    const allOk = results.every(Boolean)
    setSheetsValidated(allOk)
    setValidating(false)
  }

  const hasInventoryUrl = !!configData?.data?.sheet_inventory_url
  const hasOutboundUrl  = !!configData?.data?.sheet_outbound_url
  const hasAnyUrl       = hasInventoryUrl || hasOutboundUrl
  const sessionOk       = sheetTestResults.inventory?.ok && sheetTestResults.outbound?.ok
  const sessionFailed   = sheetTestResults.inventory?.ok === false || sheetTestResults.outbound?.ok === false
  const storedOk        = sheetsValidated?.ok === true
  const storedFailed    = sheetsValidated?.ok === false
  const isVerified      = sessionOk || storedOk
  const hasFailed       = sessionFailed || storedFailed
  const isPending       = hasAnyUrl && !isVerified && !hasFailed
  const showValidateBtn = isPending && canEdit && !validating

  const statusColor = !hasAnyUrl
    ? { bg: 'bg-danger-50',  border: 'border-danger-200',  icon: 'text-danger-600',  dot: 'bg-danger-500',  label: 'text-danger-700' }
    : isVerified && !sessionFailed
      ? { bg: 'bg-success-50', border: 'border-success-200', icon: 'text-success-600', dot: 'bg-success-500', label: 'text-success-700' }
      : hasFailed
        ? { bg: 'bg-danger-50',  border: 'border-danger-200',  icon: 'text-danger-600',  dot: 'bg-danger-500',  label: 'text-danger-700' }
        : { bg: 'bg-primary-50', border: 'border-primary-200', icon: 'text-primary-600', dot: 'bg-primary-500', label: 'text-primary-700' }

  const statusText = !hasAnyUrl
    ? t('wmshub.config.status_no_url')
    : isVerified && !sessionFailed
      ? t('wmshub.config.status_ok')
      : hasFailed
        ? t('wmshub.config.status_error')
        : t('wmshub.config.status_pending')

  function fmtTs(ts) {
    if (!ts) return t('wmshub.config.sheet_never')
    return fmtTime(ts)
  }

  async function handleCopyHeaders(template) {
    const text = template.headers.join('\t')
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('wmshub.config.guide.headers_copied'))
    } catch (_err) {
      toast.error(t('wmshub.config.guide.headers_copy_error'))
    }
  }

  function handleDownloadTemplate(template) {
    const blob = new Blob(['\ufeff' + buildTemplateCsv(template, t)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = template.filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full">
      <Header title={t('wmshub.config.title')} subtitle={t('wms.title')} />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* Status card */}
          <motion.div
            initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className={`card border ${statusColor.border} ${statusColor.bg}`}>
            <div className="px-5 py-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${statusColor.bg}`}>
                {!hasAnyUrl
                  ? <WifiOff className={`w-4 h-4 ${statusColor.icon}`} />
                  : isVerified && !sessionFailed
                    ? <ShieldCheck className={`w-4 h-4 ${statusColor.icon}`} />
                    : <Wifi className={`w-4 h-4 ${statusColor.icon}`} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${statusColor.dot}`} />
                  <span className={`text-sm font-semibold ${statusColor.label}`}>
                    Google Sheets
                  </span>
                </div>
                <p className={`text-xs mt-0.5 ${statusColor.label}`}>{statusText}</p>
              </div>
              {showValidateBtn && (
                <button
                  className="btn-ghost text-xs shrink-0 inline-flex items-center gap-1.5"
                  onClick={handleValidateAll}>
                  <RefreshCw size={13} />
                  {t('wmshub.config.sheet_validate_btn')}
                </button>
              )}
              {validating && (
                <Loader2 size={16} className="animate-spin text-primary-500 shrink-0" />
              )}
            </div>
          </motion.div>

          {/* Sheets config card */}
          <motion.div
            initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="card">
            <div className="px-5 pt-5 pb-4 border-b border-warm-100 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
                <Link2 className="w-4 h-4 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-warm-900 text-sm">{t('wmshub.config.sheets_section')}</h2>
                <p className="text-xs text-warm-400">{t('wmshub.config.sheet_description')}</p>
              </div>
              {canOpenSetupGuide && (
                <button
                  type="button"
                  className="btn-ghost text-xs shrink-0 inline-flex items-center gap-1.5"
                  onClick={() => setShowSetupGuide(true)}
                  title={t('wmshub.config.guide.open_title')}>
                  <Info size={14} />
                  {t('wmshub.config.guide.button')}
                </button>
              )}
            </div>

            <div className="p-5 space-y-4">
              {[
                { key: 'inventory', label: t('wmshub.config.sheet_inventory_label'), value: sheetInventoryUrl, set: setSheetInventoryUrl, ts: invTs },
                { key: 'outbound',  label: t('wmshub.config.sheet_outbound_label'),  value: sheetOutboundUrl,  set: setSheetOutboundUrl,  ts: outTs },
              ].map(({ key, label, value, set, ts }) => {
                const res = sheetTestResults[key]
                return (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-warm-600 mb-1.5 uppercase tracking-wide">{label}</label>
                    {canEdit ? (
                      <div className="flex gap-2">
                        <input
                          type="url"
                          className="input-field flex-1 text-xs font-mono"
                          placeholder={t('wmshub.config.sheet_placeholder')}
                          value={value}
                          onChange={e => { set(e.target.value); setSheetTestResults(p => ({ ...p, [key]: null })); clearSheetsValidated() }}
                        />
                        <button
                          className="btn-ghost text-xs shrink-0 inline-flex items-center gap-1"
                          disabled={!value.trim() || res?.loading}
                          onClick={() => handleTestSheet(value.trim(), key)}>
                          {res?.loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                          {t('wmshub.config.sheet_test_btn')}
                        </button>
                      </div>
                    ) : (
                      <div className="px-3 py-2 rounded-xl bg-warm-50 border border-warm-200 text-xs font-mono text-warm-600 truncate">
                        {value || <span className="text-warm-400 italic">{t('wmshub.config.sheet_not_configured')}</span>}
                      </div>
                    )}
                    {res && !res.loading && (
                      <p className={`mt-1 text-[11px] flex items-center gap-1 ${res.ok ? 'text-success-600' : 'text-danger-600'}`}>
                        {res.ok
                          ? <><CheckCircle2 size={11} /> {t('wmshub.config.sheet_test_ok')} — {res.rowCount} {t('wmshub.config.sheet_rows')}, {res.mappedFields?.length} {t('wmshub.config.sheet_fields')}</>
                          : <><XCircle size={11} /> {res.error}</>}
                      </p>
                    )}
                    {ts > 0 && (
                      <p className="mt-0.5 text-[10px] text-warm-400">
                        {t('wmshub.config.sheet_last_fetch')}: {fmtTs(ts)}
                      </p>
                    )}
                  </div>
                )
              })}

              {canEdit ? (
                <div className="flex justify-end">
                  <button
                    className="btn-primary inline-flex items-center gap-2"
                    disabled={saveSheetsMut.isPending}
                    onClick={() => saveSheetsMut.mutate()}>
                    {saveSheetsMut.isPending
                      ? <><Loader2 size={14} className="animate-spin" /> {t('common.saving')}</>
                      : <><Save size={14} /> {t('common.save')}</>}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-warm-50 border border-warm-200">
                  <Lock className="w-3.5 h-3.5 text-warm-400 shrink-0" />
                  <p className="text-xs text-warm-500">{t('wmshub.config.no_edit_permission')}</p>
                </div>
              )}
            </div>
          </motion.div>

        </div>
      </div>

      <Modal
        isOpen={showSetupGuide}
        onClose={() => setShowSetupGuide(false)}
        title={t('wmshub.config.guide.title')}
        icon={FileSpreadsheet}
        size="xl"
        footer={
          <button className="btn-secondary" onClick={() => setShowSetupGuide(false)}>
            {t('common.close')}
          </button>
        }>
        <div className="space-y-3">
          <div className="rounded-xl border border-primary-100 bg-primary-50/70 px-3 py-2.5 flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-white border border-primary-100 flex items-center justify-center shrink-0">
              <Info className="w-4 h-4 text-primary-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-warm-900">{t('wmshub.config.guide.before_title')}</h3>
              <p className="text-xs text-warm-600 mt-0.5 leading-relaxed">{t('wmshub.config.guide.before_body')}</p>
            </div>
          </div>

          <section className="rounded-xl border border-warm-100 bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-warm-100 bg-warm-50/70 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-warm-900">{t('wmshub.config.guide.publish_title')}</h3>
                <p className="text-xs text-warm-500 mt-0.5">{t('wmshub.config.guide.publish_desc')}</p>
              </div>
              <FileSpreadsheet className="w-4 h-4 text-primary-500 shrink-0" />
            </div>
            <div className="p-3 grid grid-cols-1 md:grid-cols-4 gap-2">
              {[
                ['1', t('wmshub.config.guide.publish_step_1')],
                ['2', t('wmshub.config.guide.publish_step_2')],
                ['3', t('wmshub.config.guide.publish_step_3')],
                ['4', t('wmshub.config.guide.publish_step_4')],
              ].map(([step, text]) => (
                <div key={step} className="rounded-lg border border-warm-100 bg-warm-50/60 p-2.5 flex gap-2">
                  <div className="w-5 h-5 rounded-md bg-primary-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{step}</div>
                  <p className="text-[11px] text-warm-600 leading-snug">{text}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {SHEET_TEMPLATES.map((template) => (
              <section key={template.key} className="rounded-xl border border-warm-100 bg-white overflow-hidden">
                <div className="px-3 py-2.5 border-b border-warm-100 bg-warm-50/70">
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                      <ListChecks className="w-4 h-4 text-primary-600" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-warm-900">{t(template.titleKey)}</h3>
                      <p className="text-[11px] text-warm-500 mt-0.5 leading-snug">{t(template.descriptionKey)}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-ghost px-3 py-1.5 text-xs inline-flex items-center gap-1.5"
                      onClick={() => handleCopyHeaders(template)}>
                      <Copy size={13} />
                      {t('wmshub.config.guide.copy_headers')}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary px-3 py-1.5 text-xs inline-flex items-center gap-1.5"
                      onClick={() => handleDownloadTemplate(template)}>
                      <Download size={13} />
                      {t('wmshub.config.guide.download_template')}
                    </button>
                  </div>
                </div>
                <div className="p-3">
                  <div className="overflow-x-auto rounded-lg border border-warm-100">
                    <table className="w-full text-left">
                      <thead className="bg-warm-50">
                        <tr>
                          <th className="px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-warm-400 font-bold w-8">#</th>
                          <th className="px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-warm-400 font-bold">{t('wmshub.config.guide.exact_header')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-warm-100">
                        {template.headers.map((header, idx) => (
                          <tr key={header}>
                            <td className="px-2.5 py-1.5 text-[11px] text-warm-400 font-mono">{idx + 1}</td>
                            <td className="px-2.5 py-1.5 text-[11px] text-warm-700 font-mono whitespace-nowrap">{header}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
