import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: resolve(__dirname, '../../', '.env.development') })
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3001,
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT, 10) || 5432,
  DB_NAME: process.env.DB_NAME || 'wms_dev',
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || 'postgres',
  DB_SSL: process.env.DB_SSL === 'true',
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  JWT_SECRET: process.env.JWT_SECRET || 'dev_secret_change_in_production',
  JWT_ADMIN_SECRET: process.env.JWT_ADMIN_SECRET || 'dev_admin_secret_change_in_production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  // Multi-tenant
  TENANT_BASE_DOMAIN: process.env.TENANT_BASE_DOMAIN || 'localhost',
  SUPER_ADMIN_EMAIL: process.env.SUPER_ADMIN_EMAIL || '',
  LEGACY_TENANT_ID: process.env.LEGACY_TENANT_ID || '',
  // Email
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  EMAIL_FROM: process.env.EMAIL_FROM || 'noreply@kerion.app',
  // Cloudflare Turnstile (captcha)
  TURNSTILE_SECRET: process.env.TURNSTILE_SECRET || '',
  // Cron security
  CRON_SECRET: process.env.CRON_SECRET || '',
}

if (env.NODE_ENV === 'production') {
  const required = [
    'JWT_SECRET', 'JWT_ADMIN_SECRET',
    'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD',
    'RESEND_API_KEY', 'SUPER_ADMIN_EMAIL', 'LEGACY_TENANT_ID',
    'TENANT_BASE_DOMAIN', 'CRON_SECRET', 'TURNSTILE_SECRET',
  ]
  const missing = required.filter(k => !process.env[k])
  if (missing.length > 0) {
    throw new Error(`[env] Missing required environment variables: ${missing.join(', ')}`)
  }
  if (env.JWT_SECRET.length < 32 || env.JWT_SECRET.startsWith('dev_')) {
    throw new Error('[env] JWT_SECRET must be at least 32 chars and not a dev default')
  }
  if (env.JWT_ADMIN_SECRET.length < 32 || env.JWT_ADMIN_SECRET.startsWith('dev_')) {
    throw new Error('[env] JWT_ADMIN_SECRET must be at least 32 chars and not a dev default')
  }
}

export default env
