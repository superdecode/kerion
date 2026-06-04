import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Eye, EyeOff, Plug, RefreshCw, CheckCircle2, XCircle,
  Loader2, Save, Wifi, WifiOff, Key, Clock, Zap,
  ArrowUpDown, ShieldCheck, ShieldAlert,
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import Modal from '../../../core/components/common/Modal'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import { useWmsHubStore } from '../stores/wmsHubStore'
import { getConfig, saveConfig, testConnection } from '../services/wmsHubService'

export default function Configuracion() {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const qc = useQueryClient()
  const { lastTest, lastSync, recordTest } = useWmsHubStore()

  const [appKey, setAppKey] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [testStart, setTestStart] = useState(null)

  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ['upapex-config'],
    queryFn: getConfig,
    staleTime: 30000,
  })

  const config = configData?.data
  const isConnected = lastTest?.ok === true
  const canSave = appKey.trim().length > 0 && appSecret.trim().length > 0

  const saveMut = useMutation({
    mutationFn: () => saveConfig({ app_key: appKey, app_secret: appSecret }),
    onSuccess: () => {
      toast.success(t('wmshub.config.saved'))
      setAppKey(''); setAppSecret(''); setConfirmOpen(false)
      qc.invalidateQueries({ queryKey: ['upapex-config'] })
    },
    onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
  })

  const testMut = useMutation({
    mutationFn: () => { setTestStart(Date.now()); return testConnection() },
    onSuccess: () => {
      const latency = testStart ? Date.now() - testStart : null
      recordTest(true, latency)
      toast.success(t('wmshub.config.test_ok'))
      qc.invalidateQueries({ queryKey: ['upapex-config'] })
    },
    onError: (err) => {
      recordTest(false, null)
      toast.error(err.response?.data?.error || t('wmshub.config.test_fail'))
    },
  })

  return (
    <div className="flex flex-col h-full">
      <Header title={t('wmshub.config.title')} subtitle={t('wms.title')} />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* Status card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className={`rounded-2xl p-5 text-white overflow-hidden relative ${
              config && isConnected     ? 'bg-gradient-to-r from-success-600 to-success-700' :
              config                   ? 'bg-gradient-to-r from-primary-600 to-primary-700' :
              'border border-red-300/55 bg-gradient-to-r from-red-700 via-rose-600 to-red-500 shadow-lg shadow-red-700/25'
            }`}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  config ? 'bg-white/20' : 'bg-red-950/25 border border-red-200/30'
                }`}>
                  {config && isConnected ? <Wifi className="w-6 h-6" /> :
                   config               ? <WifiOff className="w-6 h-6" /> :
                   <Wifi className="w-6 h-6" />}
                </div>
                <div>
                  <p className="font-bold text-base leading-tight">
                    {config && isConnected ? t('wms.statusConfigured') :
                     config               ? t('wms.statusConfigured') :
                     t('wms.statusNotConfigured')}
                  </p>
                  {config && (
                    <p className="text-white/70 text-xs font-mono mt-0.5">{config.app_key_masked}</p>
                  )}
                </div>
              </div>

              {lastTest && (
                <div className="text-right shrink-0">
                  <div className={`inline-flex items-center gap-1.5 text-sm font-semibold ${lastTest.ok ? 'text-white' : 'text-white/80'}`}>
                    {lastTest.ok
                      ? <CheckCircle2 className="w-4 h-4" />
                      : <XCircle className="w-4 h-4" />}
                    {lastTest.ok ? t('wmshub.config.test_ok') : t('wmshub.config.test_fail')}
                  </div>
                  {lastTest.latencyMs !== null && (
                    <p className="text-white/60 text-xs mt-0.5 flex items-center justify-end gap-1">
                      <Zap className="w-3 h-3" />{lastTest.latencyMs} ms
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>

          {/* Credentials card */}
          <motion.div
            initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="card">
            <div className="px-5 pt-5 pb-4 border-b border-warm-100 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
                <Key className="w-4 h-4 text-primary-600" />
              </div>
              <div>
                <h2 className="font-bold text-warm-900 text-sm">{t('wmshub.config.credentials')}</h2>
                <p className="text-xs text-warm-400">{t('wmshub.config.credentials_hint')}</p>
              </div>
            </div>

            <div className="p-5">
              {configLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-primary-400" />
                </div>
              ) : (
                <div className="space-y-4">

                  {/* Current config status */}
                  {config && (
                    <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-warm-50 border border-warm-100">
                      <div className="flex items-center gap-2 text-xs">
                        <ShieldCheck className="w-3.5 h-3.5 text-success-500 shrink-0" />
                        <span className="text-warm-500">{t('wmshub.config.appkey_label')}:</span>
                        <span className="font-mono text-warm-700">{config.app_key_masked}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        {config.has_secret
                          ? <ShieldCheck className="w-3.5 h-3.5 text-success-500 shrink-0" />
                          : <ShieldAlert className="w-3.5 h-3.5 text-warning-500 shrink-0" />}
                        <span className="text-warm-500">{t('wmshub.config.appsecret_label')}:</span>
                        <span className={config.has_secret ? 'font-mono text-warm-700' : 'text-warning-600 font-medium'}>
                          {config.has_secret ? '••••••••' : t('wmshub.config.appsecret_not_set')}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* App Key input */}
                  <div>
                    <label className="block text-xs font-semibold text-warm-600 mb-1.5 uppercase tracking-wide">
                      {t('wmshub.config.appkey_label')}
                    </label>
                    <div className="relative">
                      <input
                        type={showKey ? 'text' : 'password'}
                        className="input-field pr-10 font-mono"
                        placeholder={config ? t('wmshub.config.appkey_placeholder_update') : t('wmshub.config.appkey_placeholder')}
                        value={appKey}
                        onChange={e => setAppKey(e.target.value)}
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-600 transition-colors"
                        onClick={() => setShowKey(v => !v)}
                        tabIndex={-1}>
                        {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {/* App Secret input */}
                  <div>
                    <label className="block text-xs font-semibold text-warm-600 mb-1.5 uppercase tracking-wide">
                      {t('wmshub.config.appsecret_label')}
                    </label>
                    <div className="relative">
                      <input
                        type={showSecret ? 'text' : 'password'}
                        className="input-field pr-10 font-mono"
                        placeholder={t('wmshub.config.appsecret_placeholder')}
                        value={appSecret}
                        onChange={e => setAppSecret(e.target.value)}
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-600 transition-colors"
                        onClick={() => setShowSecret(v => !v)}
                        tabIndex={-1}>
                        {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] text-warm-400">{t('wmshub.config.appsecret_hint')}</p>
                  </div>

                  <div className="flex justify-end">
                    <button
                      className="btn-primary inline-flex items-center gap-2"
                      disabled={!canSave || saveMut.isPending}
                      onClick={() => setConfirmOpen(true)}>
                      {saveMut.isPending
                        ? <><Loader2 size={14} className="animate-spin" /> {t('common.saving')}</>
                        : <><Save size={14} /> {t('common.save')}</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Connection test card */}
          <motion.div
            initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="card">
            <div className="px-5 pt-5 pb-4 border-b border-warm-100 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent-50 flex items-center justify-center shrink-0">
                <RefreshCw className="w-4 h-4 text-accent-600" />
              </div>
              <div>
                <h2 className="font-bold text-warm-900 text-sm">{t('wmshub.config.test_title')}</h2>
                <p className="text-xs text-warm-400">{t('wmshub.config.test_hint')}</p>
              </div>
            </div>

            <div className="p-5">
              <div className="flex items-center gap-4 flex-wrap">
                <button
                  className="btn-primary inline-flex items-center gap-2"
                  onClick={() => testMut.mutate()}
                  disabled={testMut.isPending || !config || !config.has_secret}>
                  {testMut.isPending
                    ? <><Loader2 size={14} className="animate-spin" /> {t('wmshub.config.testing')}</>
                    : <><RefreshCw size={14} /> {t('wmshub.config.test_btn')}</>}
                </button>

                {lastTest && (
                  <div className="flex items-center gap-3 text-xs text-warm-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {t('wmshub.config.last_test')}: {new Date(lastTest.testedAt).toLocaleTimeString()}
                    </span>
                    {lastTest.latencyMs !== null && (
                      <span className="flex items-center gap-1">
                        <Zap size={12} className="text-accent-500" />
                        {t('wmshub.config.latency')}: <strong className="text-warm-700">{lastTest.latencyMs} ms</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {!config && !configLoading && (
                <p className="mt-3 text-xs text-warning-600 bg-warning-50 rounded-xl px-3 py-2">
                  {t('wmshub.config.no_config_warning')}
                </p>
              )}
              {config && !config.has_secret && (
                <p className="mt-3 text-xs text-warning-600 bg-warning-50 rounded-xl px-3 py-2">
                  {t('wmshub.config.no_secret_warning')}
                </p>
              )}
            </div>
          </motion.div>

          {/* Sync status card */}
          <motion.div
            initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="card">
            <div className="px-5 pt-5 pb-4 border-b border-warm-100 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-success-50 flex items-center justify-center shrink-0">
                <ArrowUpDown className="w-4 h-4 text-success-600" />
              </div>
              <h2 className="font-bold text-warm-900 text-sm">{t('wmshub.config.sync_title')}</h2>
            </div>

            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { label: t('wmshub.config.sync_box_stock'), value: lastSync?.boxStock },
                  { label: t('wmshub.config.sync_outbound'),  value: lastSync?.outbound },
                ].map((item, i) => (
                  <div key={i} className="rounded-xl bg-warm-50 border border-warm-100 px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold text-warm-400 uppercase tracking-widest">{item.label}</p>
                      <p className="text-sm text-warm-700 font-medium mt-0.5">
                        {item.value ? new Date(item.value).toLocaleString() : t('wmshub.config.sync_never')}
                      </p>
                    </div>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${item.value ? 'bg-success-400' : 'bg-warm-300'}`} />
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

        </div>
      </div>

      {/* Confirm save modal */}
      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('wmshub.config.confirm_title')}
        icon={Key}
        footer={
          <div className="flex gap-3 justify-end">
            <button className="btn-ghost" onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</button>
            <button className="btn-primary inline-flex items-center gap-2" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {t('common.confirm')}
            </button>
          </div>
        }>
        <p className="text-sm text-warm-600">{t('wmshub.config.confirm_body')}</p>
      </Modal>
    </div>
  )
}
