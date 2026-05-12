import { Router } from 'express'
import env from '../../config/env.js'
import { processNotifications } from '../../services/notificationWorker.js'
import { runLifecycleTasks } from '../../services/lifecycleScheduler.js'

const router = Router()

function validateCronSecret(req, res, next) {
  const authHeader = req.headers['authorization'] || ''
  const secret = authHeader.replace('Bearer ', '')
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

router.get('/notifications', validateCronSecret, async (_req, res) => {
  try {
    const result = await processNotifications()
    res.json({ success: true, ...result })
  } catch (err) {
    console.error('[cron/notifications]', err)
    res.status(500).json({ error: err.message })
  }
})

router.get('/lifecycle', validateCronSecret, async (_req, res) => {
  try {
    const result = await runLifecycleTasks()
    res.json({ success: true, ...result })
  } catch (err) {
    console.error('[cron/lifecycle]', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
