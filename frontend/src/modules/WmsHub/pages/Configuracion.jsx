import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { RefreshCw, CheckCircle2, XCircle, Loader2, Save, Link2, Wifi, WifiOff, Lock } from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useAuthStore } from '../../../core/stores/authStore'
import { fmtTime } from '../../../core/utils/dateFormat'
import { getConfig, saveSheetConfig } from '../services/wmsHubService'
import { testSheetUrl, invalidateUrlCache, getCacheTimestamp } from '../services/googleSheetsService'

export default function Configuracion() {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const { getPermissionLevel } = useAuthStore()
  const wmsLevel = getPermissionLevel('sistema.wms')
  const canEdit = ['actualizar', 'eliminar'].includes(wmsLevel)

  const [sheetInventoryUrl, setSheetInventoryUrl] = useState('')
  const [sheetOutboundUrl, setSheetOutboundUrl] = useState('')
  const [sheetTestResults, setSheetTestResults] = useState({})
  const [invTs] = useState(() => getCacheTimestamp('inventory'))
  const [outTs] = useState(() => getCacheTimestamp('outbound'))

  const { data: configData } = useQuery({
    queryKey: ['wms-config'],
    queryFn: getConfig,
    staleTime: 30000,
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
    } catch (err) {
      setSheetTestResults(prev => ({ ...prev, [type]: { ok: false, error: err.message } }))
    }
  }

  const hasInventoryUrl = !!configData?.data?.sheet_inventory_url
  const hasOutboundUrl  = !!configData?.data?.sheet_outbound_url
  const hasAnyUrl       = hasInventoryUrl || hasOutboundUrl
  const bothTested      = sheetTestResults.inventory?.ok && sheetTestResults.outbound?.ok
  const anyFailed       = sheetTestResults.inventory?.ok === false || sheetTestResults.outbound?.ok === false

  const statusColor = !hasAnyUrl
    ? { bg: 'bg-danger-50',  border: 'border-danger-200',  icon: 'text-danger-600',  dot: 'bg-danger-500',  label: 'text-danger-700' }
    : bothTested
      ? { bg: 'bg-success-50', border: 'border-success-200', icon: 'text-success-600', dot: 'bg-success-500', label: 'text-success-700' }
      : { bg: 'bg-primary-50', border: 'border-primary-200', icon: 'text-primary-600', dot: 'bg-primary-500', label: 'text-primary-700' }

  const statusText = !hasAnyUrl
    ? t('wmshub.config.status_no_url')
    : bothTested
      ? t('wmshub.config.status_ok')
      : anyFailed
        ? t('wmshub.config.status_error')
        : t('wmshub.config.status_pending')

  function fmtTs(ts) {
    if (!ts) return t('wmshub.config.sheet_never')
    return fmtTime(ts)
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
              <div>
                <h2 className="font-bold text-warm-900 text-sm">{t('wmshub.config.sheets_section')}</h2>
                <p className="text-xs text-warm-400">{t('wmshub.config.sheet_description')}</p>
              </div>
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
                          onChange={e => { set(e.target.value); setSheetTestResults(p => ({ ...p, [key]: null })) }}
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
                          ? <><CheckCircle2 size={11} /> {t('wmshub.config.sheet_test_ok')} — {res.rowCount} filas, {res.mappedFields?.length} campos</>
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
    </div>
  )
}
