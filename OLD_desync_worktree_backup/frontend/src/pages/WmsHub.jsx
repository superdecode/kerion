import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Wifi, WifiOff, Save, Eye, EyeOff, CheckCircle, XCircle, Loader2, KeyRound, Link2 } from 'lucide-react'
import Header from '../core/components/layout/Header'
import { useAuthStore } from '../core/stores/authStore'
import { useToastStore } from '../core/stores/toastStore'
import { useI18nStore } from '../core/stores/i18nStore'
import { getWmsCredentials, saveWmsCredentials, testWmsConnection } from '../core/services/wmsHubService'

export default function WmsHub() {
  const { t } = useI18nStore()
  const { canWrite } = useAuthStore()
  const canEdit = canWrite('global.wms')
  const toast = useToastStore.getState()
  const queryClient = useQueryClient()

  const [form, setForm] = useState({ app_key: '', app_secret: '', base_url: '' })
  const [showSecret, setShowSecret] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const { data: creds, isLoading } = useQuery({
    queryKey: ['wms-credentials'],
    queryFn: getWmsCredentials,
    onSuccess: (data) => {
      if (data?.configured) {
        setForm(f => ({
          ...f,
          app_key: data.app_key || '',
          base_url: data.base_url || '',
        }))
      }
    },
  })

  const saveMutation = useMutation({
    mutationFn: saveWmsCredentials,
    onSuccess: () => {
      toast.success(t('wms.credentialsSaved') || 'Credenciales guardadas')
      queryClient.invalidateQueries(['wms-credentials'])
      setTestResult(null)
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || t('wms.saveError') || 'Error guardando credenciales')
    },
  })

  const testMutation = useMutation({
    mutationFn: testWmsConnection,
    onSuccess: (data) => {
      setTestResult({ ok: true, message: data.message })
      toast.success(data.message || t('wms.testOk') || 'Conexión exitosa')
    },
    onError: (err) => {
      const msg = err.response?.data?.message || err.message || t('wms.testError') || 'Error de conexión'
      setTestResult({ ok: false, message: msg })
      toast.error(msg)
    },
  })

  const handleSave = (e) => {
    e.preventDefault()
    if (!form.app_key.trim() || !form.app_secret.trim()) {
      toast.error(t('wms.fieldsRequired') || 'App Key y App Secret son requeridos')
      return
    }
    saveMutation.mutate(form)
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title={t('wms.title') || 'WMS Hub'}
        subtitle={t('wms.subtitle') || 'Configuración de conexión al almacén'}
      />

      <div className="flex-1 overflow-y-auto p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl mx-auto space-y-6"
        >
          {/* Status card */}
          <div className={`rounded-2xl border p-5 flex items-center gap-4
            ${creds?.configured
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-amber-50 border-amber-200'
            }`}
          >
            {isLoading ? (
              <Loader2 className="w-6 h-6 text-warm-400 animate-spin" />
            ) : creds?.configured ? (
              <Wifi className="w-6 h-6 text-emerald-600 flex-shrink-0" />
            ) : (
              <WifiOff className="w-6 h-6 text-amber-500 flex-shrink-0" />
            )}
            <div>
              <p className={`font-semibold text-sm ${creds?.configured ? 'text-emerald-700' : 'text-amber-700'}`}>
                {creds?.configured
                  ? (t('wms.statusConfigured') || 'WMS configurado')
                  : (t('wms.statusNotConfigured') || 'WMS no configurado')}
              </p>
              {creds?.configured && (
                <p className="text-xs text-emerald-600 mt-0.5">{creds.base_url}</p>
              )}
            </div>
          </div>

          {/* Credentials form */}
          <div className="bg-white/70 backdrop-blur rounded-2xl border border-warm-200/60 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <KeyRound className="w-5 h-5 text-primary-600" />
              <h2 className="font-semibold text-warm-800 text-sm">
                {t('wms.credentials') || 'Credenciales API'}
              </h2>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-warm-600 mb-1.5">
                  App Key
                </label>
                <input
                  type="text"
                  value={form.app_key}
                  onChange={e => setForm(f => ({ ...f, app_key: e.target.value }))}
                  disabled={!canEdit}
                  placeholder="xxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2.5 rounded-xl border border-warm-200 bg-white text-sm
                    focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400
                    disabled:bg-warm-50 disabled:cursor-not-allowed transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-warm-600 mb-1.5">
                  App Secret
                </label>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={form.app_secret}
                    onChange={e => setForm(f => ({ ...f, app_secret: e.target.value }))}
                    disabled={!canEdit}
                    placeholder={creds?.configured ? '••••••••••••' : 'App Secret'}
                    className="w-full px-3 py-2.5 pr-10 rounded-xl border border-warm-200 bg-white text-sm
                      focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400
                      disabled:bg-warm-50 disabled:cursor-not-allowed transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-600"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-warm-600 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />
                    {t('wms.baseUrl') || 'URL base'}
                  </div>
                </label>
                <input
                  type="url"
                  value={form.base_url}
                  onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))}
                  disabled={!canEdit}
                  placeholder="https://api.xlwms.com/openapi/v1"
                  className="w-full px-3 py-2.5 rounded-xl border border-warm-200 bg-white text-sm
                    focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400
                    disabled:bg-warm-50 disabled:cursor-not-allowed transition"
                />
              </div>

              {canEdit && (
                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saveMutation.isPending}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700
                      text-white text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saveMutation.isPending
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Save className="w-4 h-4" />
                    }
                    {t('common.save') || 'Guardar'}
                  </button>

                  <button
                    type="button"
                    onClick={() => testMutation.mutate()}
                    disabled={testMutation.isPending || !creds?.configured}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-warm-300
                      hover:bg-warm-50 text-warm-700 text-sm font-semibold transition
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testMutation.isPending
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Wifi className="w-4 h-4" />
                    }
                    {t('wms.testConnection') || 'Probar conexión'}
                  </button>
                </div>
              )}
            </form>
          </div>

          {/* Test result */}
          {testResult && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-2xl border p-4 flex items-start gap-3
                ${testResult.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}
            >
              {testResult.ok
                ? <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                : <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              }
              <p className={`text-sm font-medium ${testResult.ok ? 'text-emerald-700' : 'text-red-600'}`}>
                {testResult.message}
              </p>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
