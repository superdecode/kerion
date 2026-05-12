import { Router } from 'express'
import { authenticateToken, loadFullUser, auditLog } from '../../shared/middleware/auth.js'
import { requirePermission } from '../../shared/middleware/permissions.js'
import { saveCredentials, loadCredentials } from '../../shared/services/wmsCredentials.js'
import { invalidateCredCache, wmsPost } from '../../shared/services/wmsClient.js'

const router = Router()

// GET /api/wms/credentials — returns masked credentials (secret hidden)
router.get('/credentials',
  authenticateToken, loadFullUser,
  requirePermission('global.wms', 'ver'),
  async (req, res) => {
    try {
      const creds = await loadCredentials()
      if (!creds) return res.json({ configured: false })
      res.json({
        configured: true,
        app_key: creds.app_key,
        base_url: creds.base_url,
      })
    } catch (err) {
      console.error('GET wms credentials error:', err)
      res.status(500).json({ error: 'Error obteniendo credenciales WMS' })
    }
  }
)

// PUT /api/wms/credentials — save/update credentials
router.put('/credentials',
  authenticateToken, loadFullUser,
  requirePermission('global.wms', 'editar'),
  async (req, res) => {
    try {
      const { app_key, app_secret, base_url } = req.body
      if (!app_key || !app_secret) {
        return res.status(400).json({ error: 'app_key y app_secret son requeridos' })
      }
      await saveCredentials({ app_key, app_secret, base_url })
      invalidateCredCache()
      await auditLog(req, 'WMS_CREDENTIALS_UPDATED', 'wms_credentials', null, { app_key })
      res.json({ ok: true })
    } catch (err) {
      console.error('PUT wms credentials error:', err)
      res.status(500).json({ error: 'Error guardando credenciales WMS' })
    }
  }
)

// POST /api/wms/test — verify connection by calling a lightweight WMS endpoint
router.post('/test',
  authenticateToken, loadFullUser,
  requirePermission('global.wms', 'ver'),
  async (req, res) => {
    try {
      const result = await wmsPost('/integratedInventory/pageOpen', [{ page: 1, pageSize: 1 }])
      const ok = result?.code === '0' || result?.success === true || Array.isArray(result?.data) || result?.data != null
      if (ok) {
        res.json({ ok: true, message: 'Conexión WMS exitosa' })
      } else {
        res.status(502).json({ ok: false, message: result?.message || 'Respuesta inesperada del WMS', detail: result })
      }
    } catch (err) {
      if (err.code === 'WMS_NOT_CONFIGURED') {
        return res.status(400).json({ ok: false, message: 'WMS no configurado' })
      }
      console.error('WMS test error:', err)
      res.status(502).json({ ok: false, message: err.message })
    }
  }
)

export default router
