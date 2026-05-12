import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { query } from '../../config/database.js'

const ALGORITHM = 'aes-256-cbc'

function getKey() {
  const raw = process.env.WMS_ENCRYPTION_KEY || ''
  if (!raw) throw new Error('WMS_ENCRYPTION_KEY env var is not set')
  return Buffer.from(raw.padEnd(32, '0').slice(0, 32), 'utf8')
}

export function encrypt(plaintext) {
  const key = getKey()
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(stored) {
  const key = getKey()
  const [ivHex, encHex] = stored.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const encrypted = Buffer.from(encHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

export async function loadCredentials() {
  const res = await query(
    'SELECT * FROM wms_credentials WHERE is_active = true ORDER BY id DESC LIMIT 1'
  )
  if (res.rows.length === 0) return null
  const row = res.rows[0]
  return {
    id: row.id,
    app_key: row.app_key,
    app_secret: decrypt(row.app_secret_encrypted),
    base_url: row.base_url,
  }
}

export async function saveCredentials({ app_key, app_secret, base_url }) {
  const encrypted = encrypt(app_secret)
  const baseUrl = base_url || 'https://api.xlwms.com/openapi/v1'
  const existing = await query('SELECT id FROM wms_credentials LIMIT 1')
  if (existing.rows.length > 0) {
    await query(
      `UPDATE wms_credentials
       SET app_key = $1, app_secret_encrypted = $2, base_url = $3, updated_at = now()
       WHERE id = $4`,
      [app_key, encrypted, baseUrl, existing.rows[0].id]
    )
  } else {
    await query(
      `INSERT INTO wms_credentials (app_key, app_secret_encrypted, base_url)
       VALUES ($1, $2, $3)`,
      [app_key, encrypted, baseUrl]
    )
  }
}
