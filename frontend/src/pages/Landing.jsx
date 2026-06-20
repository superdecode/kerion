import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

function track(eventType, payload) {
  fetch('/api/public/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: eventType, payload: payload || {} }),
  }).catch(() => {})
}
import {
  Check, ChevronRight, ArrowRight,
  ScanLine, Package, FileText, BarChart3, Users, ShieldCheck,
  AlertTriangle, X, Layers, Clock, Smartphone,
  RotateCcw, Boxes, Truck, TrendingUp,
} from 'lucide-react'
import { MODULE_CATALOG } from '../core/constants/moduleCatalog'

// ── Constants ──────────────────────────────────────────────────────────────────

const CONTACT_PHONE = '+86 185 1445 8054'

const FEATURES = [
  {
    icon: ScanLine,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    module: 'DropScan',
    title: 'Escaneo y control de guias',
    desc: 'Registra guias en tiempo real con validacion automatica de duplicados y alerta sonora. Control de tarimas, auditoria de operadores y cero guias perdidas.',
  },
  {
    icon: Truck,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    module: 'Surtido WMS',
    title: 'Gestion de ordenes de salida',
    desc: 'Asigna, rastrea y valida ordenes (OBCs) desde Google Sheets hasta el cierre. Detecta discrepancias y controla surtidores en tiempo real.',
  },
  {
    icon: Boxes,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    module: 'Inventario',
    title: 'Control de stock en bodega',
    desc: 'Sesiones de conteo con escaneo de barcodes, localizacion de cajas por celda y reportes de disponibilidad. Stock siempre actualizado y exportable a Excel.',
  },
  {
    icon: RotateCcw,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    module: 'Devoluciones',
    title: 'Gestion de retornos y devoluciones',
    desc: 'Registra y clasifica mercancia devuelta con trazabilidad completa: SKU, embalaje, evidencia fotografica y movimientos de inventario en cada entrada.',
  },
  {
    icon: Package,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
    module: 'Recepcion',
    title: 'Recepcion inbound con validacion',
    desc: 'Administra ordenes inbound, lineas, listas de recepcion, validaciones por escaneo y novedades por ubicacion sin salir del flujo operativo.',
  },
  {
    icon: FileText,
    color: 'text-fuchsia-400',
    bg: 'bg-fuchsia-500/10',
    border: 'border-fuchsia-500/20',
    module: 'Despacho',
    title: 'Despacho y cierre de folios',
    desc: 'Consolida folios de salida, agenda operativa, validacion final y seguimiento del cierre para despachar con menos retrabajo.',
  },
  {
    icon: Smartphone,
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/20',
    module: 'DropScan',
    title: 'Operadores con PIN y auditoria',
    desc: 'Cada operador accede con PIN unico. Registro completo de quien escaneo que, cuando y en que tarima. Control de equipo y auditoria sin pasos adicionales.',
  },
  {
    icon: BarChart3,
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    module: 'Todos',
    title: 'Reportes y metricas unificados',
    desc: 'Productividad por operador, tasa de error y tiempos por proceso desde todos los modulos. Exportacion a Excel y filtros avanzados incluidos en cada plan.',
  },
  {
    icon: AlertTriangle,
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    module: 'Anormalidades',
    title: 'Incidencias con SLA y mejora continua',
    desc: 'Centraliza anormalidades, responsables, niveles criticos y mejoras vinculadas para cerrar problemas operativos con trazabilidad.',
  },
]

const PAIN_POINTS = [
  {
    icon: AlertTriangle,
    problem: 'Sin trazabilidad, sin responsabilidad',
    solution: 'Sin un registro digital, no sabes quien movio que, cuando ni por que. Kirion registra cada operacion con usuario, timestamp y contexto. Auditoria total desde bodega hasta entrega.',
  },
  {
    icon: X,
    problem: 'Errores que cuestan dinero',
    solution: 'Guias duplicadas, inventario desactualizado, devoluciones sin registro. Cada error es costo operativo y cliente perdido. Kirion valida y alerta antes de que el error ocurra.',
  },
  {
    icon: Clock,
    problem: 'Procesos lentos y fragmentados',
    solution: 'Escaneo en papel, ordenes por WhatsApp, stock en Excel, devoluciones sin registro. Kirion atiende cada uno de esos flujos con herramientas especializadas y datos en tiempo real.',
  },
  {
    icon: BarChart3,
    problem: 'Sin metricas, sin capacidad de mejorar',
    solution: 'Si no mides, no optimizas. Kirion captura datos de cada modulo: productividad, tiempos de proceso y tasas de error. Toma decisiones con datos reales.',
  },
]

const STATS = [
  { value: '12+', label: 'Empresas activas' },
  { value: '500K+', label: 'Guias procesadas' },
  { value: '99.9%', label: 'Uptime garantizado' },
  { value: '< 10 min', label: 'Tiempo de setup' },
]


const MODULES_META = MODULE_CATALOG

const PLANS_CONFIG = [
  {
    id: 'basic',
    name: 'Basico',
    desc: 'Operaciones medianas con módulos esenciales',
    color: 'border-gray-700',
    badge: null,
    modules: ['dropscan', 'surtido', 'inventario', 'devoluciones', 'recepcion', 'despacho', 'anormalidades'],
    features: [
      'DropScan: hasta 10,000 guías / mes',
      'Surtido: hasta 5,000 órdenes / mes',
      'Inventario: hasta 50,000 escaneos / mes',
      'Devoluciones: hasta 50 entradas / mes',
      'Recepcion, Despacho y Anormalidades incluidos',
      'Operadores ilimitados',
      'Soporte por email',
    ],
  },
  {
    id: 'pro',
    name: 'Profesional',
    desc: 'Alto volumen con todos los módulos sin restricciones operativas',
    color: 'border-blue-500',
    badge: 'Mas popular',
    badgeColor: 'bg-blue-600',
    modules: ['dropscan', 'surtido', 'inventario', 'devoluciones', 'recepcion', 'despacho', 'anormalidades'],
    features: [
      'DropScan: guías ilimitadas',
      'Surtido: hasta 20,000 órdenes / mes',
      'Inventario: hasta 500,000 escaneos / mes',
      'Devoluciones: hasta 500 entradas / mes',
      'Recepcion, Despacho y Anormalidades incluidos',
      'Operadores ilimitados',
      'Soporte prioritario',
      'Onboarding incluido',
    ],
  },
  {
    id: 'custom',
    name: 'Personalizado',
    desc: 'Límites a medida para operaciones de gran escala',
    color: 'border-purple-500',
    badge: 'Empresas grandes',
    badgeColor: 'bg-purple-600',
    modules: ['dropscan', 'surtido', 'inventario', 'devoluciones', 'recepcion', 'despacho', 'anormalidades'],
    features: [
      'Todos los módulos sin límite',
      'Múltiples bodegas',
      'Integraciones a medida',
      'SLA garantizado',
      'Soporte dedicado',
      'Facturación personalizada',
    ],
  },
]

const COUNTRIES = ['Mexico', 'Colombia', 'Chile', 'Peru', 'Argentina', 'Brasil', 'China', 'Otro']

// ── Components ─────────────────────────────────────────────────────────────────

function NavBar() {
  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950/90 backdrop-blur-md border-b border-gray-800/60">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="Kirion" className="w-8 h-8 rounded-lg object-contain" onError={e => { e.currentTarget.style.display = 'none' }} />
          <span className="text-white font-bold text-lg tracking-tight">Kirion</span>
          <span className="text-blue-400 text-xs font-semibold bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">WMS</span>
        </div>
        <div className="hidden md:flex items-center gap-6 text-sm text-gray-400">
          {[['funcionalidades', 'Funciones'], ['precios', 'Precios'], ['contacto', 'Contacto']].map(([id, label]) => (
            <button key={id} onClick={() => scrollTo(id)} className="hover:text-white transition-colors">{label}</button>
          ))}
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <Link
            to="/login"
            className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors font-medium"
          >
            Iniciar sesion
          </Link>
          <button
            onClick={() => scrollTo('contacto')}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors font-medium"
          >
            Prueba gratis <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </nav>
  )
}

function HeroSection() {
  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-gray-950 via-gray-950 to-gray-900" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(46,87,254,0.15),transparent)]" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-600/5 rounded-full blur-3xl" />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.5) 1px,transparent 1px)', backgroundSize: '40px 40px' }}
      />

      <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-xs font-medium mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          WMS integral para logistica y paqueteria
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-tight mb-6">
          Tu operacion logistica{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-blue-300 to-cyan-400">
            bajo control total
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-gray-400 leading-relaxed mb-10 max-w-2xl mx-auto">
          Kirion cubre los vacios operativos que los sistemas generales no atienden: escaneo de guias, recepcion inbound, surtido, inventario, despacho, devoluciones y gestion de anormalidades.
          <span className="text-white font-medium"> Procesos mas rapidos, trazabilidad completa, mejor control.</span>
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
          <button
            onClick={() => { track('cta_click', { location: 'hero' }); scrollTo('contacto') }}
            className="flex items-center justify-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-blue-600/25 text-base"
          >
            Empezar prueba de 30 días gratis
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => scrollTo('funcionalidades')}
            className="flex items-center justify-center gap-2 px-8 py-4 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white font-medium rounded-xl transition-colors border border-gray-700 text-base"
          >
            Ver funciones
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500">
          {['Sin tarjeta de credito', 'Setup en menos de 10 min', '7 modulos integrados'].map(t => (
            <span key={t} className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function StatsSection() {
  return (
    <section className="py-12 border-y border-gray-800 bg-gray-900/40">
      <div className="max-w-4xl mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {STATS.map(({ value, label }) => (
            <div key={label}>
              <p className="text-3xl font-black text-white mb-1">{value}</p>
              <p className="text-gray-500 text-sm">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ProblemSection() {
  return (
    <section className="py-20 bg-gray-950">
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-14">
          <p className="text-blue-400 text-sm font-semibold uppercase tracking-wider mb-3">El problema</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Sin control, pierdes dinero y credibilidad
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Entregar 100+ paquetes diarios sin un sistema robusto genera errores, demoras y perdidas. Cada guia duplicada o mal registrada es un cliente perdido.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PAIN_POINTS.map(({ icon: Icon, problem, solution }) => (
            <div key={problem} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-blue-500/30 transition-colors">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <p className="text-white font-semibold mb-1">{problem}</p>
                  <p className="text-gray-400 text-sm leading-relaxed">{solution}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FeaturesSection() {
  return (
    <section id="funcionalidades" className="py-20 bg-gray-900/30">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-14">
          <p className="text-blue-400 text-sm font-semibold uppercase tracking-wider mb-3">Funcionalidades</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Todo lo que necesitas para operar sin errores
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Siete modulos especializados que cubren cada etapa de tu operacion logistica: desde la recepcion inbound hasta el despacho final y la mejora continua.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, color, bg, border, title, desc, module }) => (
            <div key={title} className={`bg-gray-900 border rounded-xl p-6 hover:border-opacity-60 transition-all hover:-translate-y-0.5 ${border}`}>
              <div className="flex items-start justify-between mb-4">
                <div className={`w-11 h-11 rounded-xl border ${bg} ${border} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${bg} ${border} ${color}`}>{module}</span>
              </div>
              <h3 className="text-white font-semibold mb-2">{title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function BenefitsSection() {
  return (
    <section className="py-20 bg-gray-950">
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-12">
          <p className="text-emerald-400 text-sm font-semibold uppercase tracking-wider mb-3">Por que Kirion</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Mas velocidad, trazabilidad y control desde el primer dia
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            No es solo software. Es el sistema operativo de tu bodega. Cada proceso digitalizado, cada movimiento registrado.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gray-900 border border-blue-500/20 rounded-2xl p-6">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-5">
              <TrendingUp className="w-6 h-6 text-blue-400" />
            </div>
            <div className="mb-3">
              <span className="text-4xl font-black text-blue-400">5x</span>
              <span className="text-sm font-medium text-blue-400 ml-1.5">mas rapido</span>
            </div>
            <h3 className="text-white font-bold mb-2">Eficiencia operativa</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Reemplaza hojas de calculo, mensajes y registros en papel con flujos digitales integrados. Menos tiempo por operacion, mas entregas completadas al dia.
            </p>
          </div>
          <div className="bg-gray-900 border border-emerald-500/20 rounded-2xl p-6">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-5">
              <Layers className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="mb-3">
              <span className="text-4xl font-black text-emerald-400">100%</span>
              <span className="text-sm font-medium text-emerald-400 ml-1.5">trazabilidad</span>
            </div>
            <h3 className="text-white font-bold mb-2">Registro de cada movimiento</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Guias, ordenes, escaneos y devoluciones con usuario, fecha y contexto completo. Sabe exactamente que paso, cuando y quien lo hizo en cualquier momento.
            </p>
          </div>
          <div className="bg-gray-900 border border-purple-500/20 rounded-2xl p-6">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-5">
              <ShieldCheck className="w-6 h-6 text-purple-400" />
            </div>
            <div className="mb-3">
              <span className="text-4xl font-black text-purple-400">7</span>
              <span className="text-sm font-medium text-purple-400 ml-1.5">modulos integrados</span>
            </div>
            <h3 className="text-white font-bold mb-2">Control centralizado</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              DropScan, Recepcion, Surtido WMS, Inventario, Despacho, Devoluciones y Anormalidades en una sola plataforma. Un login, una base de datos y reportes unificados para toda la operacion.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function PricingSection() {
  const [annual, setAnnual] = useState(false)
  const [liveMonthly, setLiveMonthly] = useState({})
  const [liveAnnualPerMonth, setLiveAnnualPerMonth] = useState({})
  const [liveAnnualTotal, setLiveAnnualTotal] = useState({})
  const [liveLimits, setLiveLimits] = useState({})
  const [avgDiscountPct, setAvgDiscountPct] = useState(null)

  useEffect(() => {
    axios.get('/api/public/plans').then(r => {
      const rows = r.data?.data || []
      const monthly = {}
      const annualPerMonth = {}
      const annualTotal = {}
      const limits = {}
      const discounts = []
      rows.forEach(p => {
        const key = p.code === 'basic' || p.code?.startsWith('basic') ? 'basic'
          : p.code === 'pro' || p.code?.startsWith('pro') ? 'pro' : null
        if (!key) return
        limits[key] = {
          guide_limit: p.guide_limit,
          surtido_limit: p.surtido_limit,
          inventario_limit: p.inventario_limit,
          devoluciones_limit: p.devoluciones_limit,
          modules: p.modules,
        }
        if (p.price_amount == null) return
        const m = Number(p.price_amount)
        monthly[key] = m
        if (p.price_annual != null) {
          const at = Number(p.price_annual)
          annualTotal[key] = at
          annualPerMonth[key] = Math.round(at / 12)
          if (m > 0) discounts.push(1 - at / (m * 12))
        }
      })
      setLiveMonthly(monthly)
      setLiveAnnualPerMonth(annualPerMonth)
      setLiveAnnualTotal(annualTotal)
      setLiveLimits(limits)
      if (discounts.length > 0) {
        const avg = discounts.reduce((a, b) => a + b, 0) / discounts.length
        setAvgDiscountPct(Math.round(avg * 100))
      }
    }).catch(() => {})
  }, [])

  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  const prices = annual ? liveAnnualPerMonth : liveMonthly
  const discountLabel = avgDiscountPct != null ? `-${avgDiscountPct}%` : 'Anual'

  return (
    <section id="precios" className="py-20 bg-gray-950">
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-10">
          <p className="text-blue-400 text-sm font-semibold uppercase tracking-wider mb-3">Precios</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Transparente y sin sorpresas
          </h2>
          <p className="text-gray-400 text-lg max-w-xl mx-auto mb-8">
            Prueba 30 días gratis. Cancela cuando quieras. Planes listos para operar los modulos core y los flujos avanzados.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl p-1.5">
            <button
              onClick={() => { setAnnual(false); track('billing_toggle', { billing: 'monthly' }) }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${!annual ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Mensual
            </button>
            <button
              onClick={() => { setAnnual(true); track('billing_toggle', { billing: 'annual' }) }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${annual ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Anual
              {discountLabel && (
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${annual ? 'bg-blue-500 text-white' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                  {discountLabel}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PLANS_CONFIG.map((plan, i) => (
            <div
              key={plan.id}
              className={`relative bg-gray-900 rounded-2xl border-2 p-6 flex flex-col ${plan.color} ${i === 1 ? 'ring-2 ring-blue-500/30 shadow-xl shadow-blue-500/10' : ''}`}
            >
              {plan.badge && (
                <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 ${plan.badgeColor} text-white text-xs font-bold rounded-full whitespace-nowrap`}>
                  {plan.badge}
                </div>
              )}

              <div className="mb-5">
                <h3 className="text-white font-bold text-lg mb-1">{plan.name}</h3>
                <p className="text-gray-400 text-sm">{plan.desc}</p>
              </div>

              <div className="mb-6">
                {plan.id !== 'custom' ? (
                  <>
                    <div className="flex items-end gap-1">
                      <span className="text-4xl font-black text-white">
                        {prices[plan.id] != null ? `$${prices[plan.id]}` : '---'}
                      </span>
                      <span className="text-gray-400 text-sm mb-1">/mes USD</span>
                    </div>
                    {annual && liveAnnualTotal[plan.id] != null && (
                      <p className="text-emerald-400 text-xs mt-1">
                        Ahorras ${(liveMonthly[plan.id] || 0) * 12 - (liveAnnualTotal[plan.id] || 0)} al año
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-3xl font-black text-white">A consultar</p>
                )}
              </div>

              <ul className="space-y-2.5 mb-6 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-300">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => { track('plan_select', { plan: plan.id }); scrollTo('contacto') }}
                className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                  i === 1
                    ? 'bg-blue-600 hover:bg-blue-500 text-white hover:shadow-lg hover:shadow-blue-600/25'
                    : i === 2
                    ? 'bg-purple-600 hover:bg-purple-500 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700'
                }`}
              >
                {plan.id === 'custom' ? 'Contactar ventas' : 'Empezar prueba gratis'}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-6 text-center space-y-1">
          <p className="text-gray-600 text-sm">Todos los precios en USD. IVA segun pais.</p>
          <p className="text-gray-600 text-sm">Límites vacíos en el plan Personalizado = ilimitado. Nuevos módulos se agregan sin romper los planes existentes.</p>
        </div>

        {/* Modules breakdown */}
        <div className="mt-14">
          <div className="text-center mb-8">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Módulos disponibles</p>
            <h3 className="text-white text-xl font-bold">Un sistema, siete modulos integrados</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {MODULES_META.map(({ code, icon: Icon, color, bg, border, name, tagline, landingDescription, family }) => (
              <div key={code} className={`bg-gray-900 border rounded-xl p-5 ${border}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl ${bg} border ${border} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-white font-semibold text-sm">{name}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${bg} ${border} ${color}`}>
                        {family === 'core' ? 'Core' : 'Advanced'}
                      </span>
                    </div>
                    <p className={`text-xs font-medium mb-1.5 ${color}`}>{tagline}</p>
                    <p className="text-gray-400 text-xs leading-relaxed">{landingDescription}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function ContactSection({ form, setForm, loading, success, error, onSubmit }) {
  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }

  const inputCls = "w-full bg-gray-800/80 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
  const labelCls = "block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider"

  if (success) return (
    <div className="text-center py-12">
      <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
        <Check className="w-8 h-8 text-emerald-400" />
      </div>
      <h3 className="text-white text-xl font-bold mb-2">Solicitud enviada</h3>
      <p className="text-gray-400">Nuestro equipo te contactara en menos de 24 horas para activar tu trial gratuito.</p>
    </div>
  )

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Empresa / Organizacion *</label>
          <input required value={form.organization_name} onChange={set('organization_name')} placeholder="Logistica Acme S.A." className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Nombre de contacto *</label>
          <input required value={form.contact_name} onChange={set('contact_name')} placeholder="Juan Garcia" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Email corporativo *</label>
          <input required type="email" value={form.contact_email} onChange={set('contact_email')} placeholder="juan@empresa.com" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Telefono</label>
          <input value={form.contact_phone} onChange={set('contact_phone')} placeholder="+52 55 1234 5678" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Pais</label>
          <select value={form.country} onChange={set('country')} className={inputCls}>
            <option value="">Seleccionar...</option>
            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Guias diarias estimadas</label>
          <select value={form.volume} onChange={set('volume')} className={inputCls}>
            <option value="">Seleccionar...</option>
            <option value="lt500">Menos de 500 guias/dia</option>
            <option value="gt1000">Mas de 1,000 guias/dia</option>
            <option value="gt5000">Mas de 5,000 guias/dia</option>
            <option value="gt10000">Mas de 10,000 guias/dia</option>
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls}>Mensaje (opcional)</label>
        <textarea value={form.message} onChange={set('message')} rows={3} placeholder="Cuentanos mas sobre tu operacion y cuantas guias manejas al dia..." className={`${inputCls} resize-none`} />
      </div>
      {error && (
        <div className="flex items-center gap-2 bg-red-950/40 border border-red-800/40 rounded-xl p-3 text-red-300 text-sm">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-blue-600/25 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Enviando...
          </>
        ) : (
          <>Empezar prueba de 30 días gratis <ArrowRight className="w-4 h-4" /></>
        )}
      </button>
      <p className="text-center text-gray-500 text-xs">Sin compromiso. Sin tarjeta de credito. Cancelacion inmediata.</p>
    </form>
  )
}

function Footer() {
  return (
    <footer className="border-t border-gray-800 bg-gray-950 py-10">
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img src="/logo.png" alt="Kirion" className="w-7 h-7 rounded-lg object-contain" onError={e => { e.currentTarget.style.display = 'none' }} />
              <span className="text-white font-bold">Kirion</span>
            </div>
            <p className="text-gray-500 text-sm leading-relaxed">
              Plataforma WMS para logistica moderna: DropScan, Recepcion, Surtido, Inventario, Despacho, Devoluciones y Anormalidades integrados en un solo sistema.
            </p>
          </div>
          <div>
            <p className="text-white font-semibold text-sm mb-3">Contacto</p>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>
                <a href="mailto:contacto@kirion.app" className="hover:text-white transition-colors">
                  contacto@kirion.app
                </a>
              </li>
              <li>
                <span className="text-gray-400">{CONTACT_PHONE}</span>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-white font-semibold text-sm mb-3">Legal</p>
            <ul className="space-y-2 text-sm text-gray-500">
              <li>Terminos de servicio</li>
              <li>Politica de privacidad</li>
            </ul>
          </div>
        </div>
        <div className="pt-6 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-gray-600 text-sm">© 2026 Kirion. Todos los derechos reservados.</p>
          <p className="text-gray-700 text-xs">Hecho para logistica real</p>
        </div>
      </div>
    </footer>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function Landing() {
  const [form, setForm] = useState({
    organization_name: '', contact_name: '', contact_email: '',
    contact_phone: '', country: '', volume: '', message: '',
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { track('page_visit', {}) }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await axios.post('/api/public/signup-requests', form)
      track('form_submit', { plan: form.volume || null })
      setSuccess(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al enviar la solicitud. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <NavBar />
      <HeroSection />
      <StatsSection />
      <ProblemSection />
      <FeaturesSection />
      <BenefitsSection />
      <PricingSection />

      {/* Contact */}
      <section id="contacto" className="py-20 bg-gray-900/40">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-blue-400 text-sm font-semibold uppercase tracking-wider mb-3">Empezar ahora</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              30 días gratis, sin riesgos
            </h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              Completa el formulario y nuestro equipo te configura el sistema en menos de 10 minutos.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
            <div className="lg:col-span-2 space-y-4">
              {[
                { title: 'Trial de 30 días', desc: 'Acceso completo sin restricciones. Sin tarjeta de credito.' },
                { title: 'Setup rapido', desc: 'Tu sistema configurado en menos de 10 minutos.' },
                { title: 'Soporte incluido', desc: 'Te acompanamos durante todo el proceso de adopcion.' },
                { title: 'Sin contratos', desc: 'Paga mes a mes. Cancela cuando quieras.' },
              ].map(({ title, desc }) => (
                <div key={title} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{title}</p>
                    <p className="text-gray-400 text-sm">{desc}</p>
                  </div>
                </div>
              ))}

              <div className="mt-6 p-4 bg-gray-800/50 border border-gray-700/50 rounded-xl">
                <p className="text-white text-sm font-medium mb-1">Contacto directo</p>
                <p className="text-gray-400 text-sm">{CONTACT_PHONE}</p>
                <a href="mailto:contacto@kirion.app" className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm transition-colors mt-1.5">
                  contacto@kirion.app
                </a>
              </div>
            </div>

            <div className="lg:col-span-3 bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <ContactSection
                form={form}
                setForm={setForm}
                loading={loading}
                success={success}
                error={error}
                onSubmit={handleSubmit}
              />
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
