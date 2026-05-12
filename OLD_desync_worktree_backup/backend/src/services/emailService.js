import env from '../config/env.js'

const RESEND_API_URL = 'https://api.resend.com/emails'

export async function sendEmail({ to, subject, html }) {
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, html }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend API error ${res.status}: ${body}`)
  }

  return res.json()
}

// ── Email templates ────────────────────────────────────────────────────────────

export function renderTemplate(code, payload) {
  switch (code) {
    case 'request_received':
      return {
        subject: 'Solicitud recibida — Kerion Drop Scan',
        html: `<p>Hola ${payload.contact_name},</p>
<p>Recibimos tu solicitud para <strong>${payload.organization_name}</strong>. La revisaremos en las proximas 24 horas.</p>
<p>Si tienes preguntas, contacta a <a href="mailto:${env.SUPER_ADMIN_EMAIL}">${env.SUPER_ADMIN_EMAIL}</a>.</p>
<p>El equipo de Kerion</p>`
      }

    case 'request_rejected':
      return {
        subject: 'Solicitud no aprobada — Kerion Drop Scan',
        html: `<p>Hola ${payload.contact_name},</p>
<p>Lamentamos informarte que tu solicitud para <strong>${payload.organization_name}</strong> no pudo ser aprobada.</p>
${payload.reason ? `<p><strong>Motivo:</strong> ${payload.reason}</p>` : ''}
<p>Si tienes dudas, escribe a <a href="mailto:${env.SUPER_ADMIN_EMAIL}">${env.SUPER_ADMIN_EMAIL}</a>.</p>
<p>El equipo de Kerion</p>`
      }

    case 'welcome':
      return {
        subject: 'Bienvenido a Kerion Drop Scan — Acceso activado',
        html: `<p>Hola ${payload.contact_name},</p>
<p>Tu cuenta para <strong>${payload.organization_name}</strong> ha sido activada. Tienes <strong>${payload.trial_days} dias de prueba gratuita</strong>.</p>
<hr>
<p><strong>Acceso al sistema:</strong> <a href="${payload.login_url}">${payload.login_url}</a></p>
<p><strong>Email:</strong> ${payload.admin_email}</p>
<p><strong>Contraseña temporal:</strong> <code>${payload.temp_password}</code></p>
<p><em>Cambia tu contraseña en el primer inicio de sesion.</em></p>
<hr>
<p>El equipo de Kerion</p>`
      }

    case 'trial_5d_warning':
      return {
        subject: 'Tu prueba de Kerion vence en 2 dias',
        html: `<p>Hola ${payload.contact_name},</p>
<p>Tu periodo de prueba de Kerion Drop Scan vence el <strong>${payload.expires_at}</strong>.</p>
<p>Para continuar usando el sistema, contacta a <a href="mailto:${env.SUPER_ADMIN_EMAIL}">${env.SUPER_ADMIN_EMAIL}</a> para activar tu suscripcion.</p>
<p>El equipo de Kerion</p>`
      }

    case 'trial_expired':
      return {
        subject: 'Tu prueba de Kerion ha vencido',
        html: `<p>Hola ${payload.contact_name},</p>
<p>Tu periodo de prueba de Kerion Drop Scan ha vencido. Tu acceso esta en modo de solo lectura.</p>
<p>Contacta a <a href="mailto:${env.SUPER_ADMIN_EMAIL}">${env.SUPER_ADMIN_EMAIL}</a> para reactivar tu cuenta.</p>
<p>El equipo de Kerion</p>`
      }

    case 'subscription_activated':
      return {
        subject: 'Suscripcion activada — Kerion Drop Scan',
        html: `<p>Hola ${payload.contact_name},</p>
<p>Tu suscripcion a Kerion Drop Scan ha sido activada hasta <strong>${payload.expires_at}</strong>.</p>
<p>El equipo de Kerion</p>`
      }

    case 'new_signup_request':
      return {
        subject: `[Kerion Admin] Nueva solicitud: ${payload.organization_name}`,
        html: `<p>Nueva solicitud de acceso:</p>
<ul>
  <li><strong>Empresa:</strong> ${payload.organization_name}</li>
  <li><strong>Contacto:</strong> ${payload.contact_name}</li>
  <li><strong>Email:</strong> ${payload.contact_email}</li>
  <li><strong>Pais:</strong> ${payload.country || '-'}</li>
</ul>
<p><a href="https://admin.${env.TENANT_BASE_DOMAIN}">Ir al panel de administracion</a></p>`
      }

    case 'provisioning_failed':
      return {
        subject: '[Kerion Admin] ERROR en provisioning',
        html: `<p>El provisioning fallo en el paso <strong>${payload.step}</strong>.</p>
<p>Request ID: ${payload.requestId}</p>
<p>Error: ${payload.error}</p>
<p>Revisa el panel de administracion para mas detalles.</p>`
      }

    case 'tenant_trial_expired_no_conversion':
      return {
        subject: `[Kerion Admin] Trial vencido sin conversion: ${payload.organization_name}`,
        html: `<p>El tenant <strong>${payload.organization_name}</strong> (${payload.slug}) vencio su trial sin convertirse a suscripcion de pago.</p>
<p>Email de contacto: ${payload.contact_email}</p>`
      }

    default:
      throw new Error(`Unknown template code: ${code}`)
  }
}
