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
  ScanLine, Package, FileText, ShieldCheck,
  AlertTriangle, X, Layers, Search,
  RotateCcw, TrendingUp,
  Volume2, UserCheck, Zap, RefreshCw, MessageSquare, FileSpreadsheet,
  Eye, Settings, DollarSign, Tag, ListChecks,
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
    title: 'Escaneo con feedback auditivo y visual',
    desc: 'Cada scan dispara confirmacion sonora y visual inmediata. El operador sabe si la guia es valida, duplicada o fuera de lugar sin revisar la pantalla. El sistema habla antes de que el error se propague.',
  },
  {
    icon: UserCheck,
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/20',
    module: 'DropScan',
    title: 'Control de operadores con PIN individual',
    desc: 'Cada operador entra con su PIN. Kirion registra quien escaneo que guia, en que tarima y a que hora. Auditoria completa sin pasos extra: si hay un error, sabes exactamente quien y cuando.',
  },
  {
    icon: RotateCcw,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    module: 'Devoluciones',
    title: 'Retornos con evidencia y trazabilidad completa',
    desc: 'Cada devolucion captura SKU, estado de embalaje, fotografia y movimiento de inventario. Nada entra sin registro. Fin a las cajas devueltas sin origen y a los reclamos sin respuesta.',
  },
  {
    icon: Package,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
    module: 'Recepcion',
    title: 'Inbound validado por escaneo, no por conteo manual',
    desc: 'Lista de recepcion con validaciones por scan. Novedades registradas por ubicacion dentro del flujo, sin salir de la operacion. El operador no necesita papel ni criterio propio.',
  },
  {
    icon: Tag,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    module: 'Inventario',
    title: 'Clasificacion inteligente por estado',
    desc: 'Cada unidad se clasifica por estado: disponible, dañado, en revision o bloqueado. Control granular de registros individuales con historial de movimientos y funciones de ayuda para validar diferencias contra el WMS al instante.',
  },
  {
    icon: Search,
    color: 'text-teal-400',
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/20',
    module: 'Inventario',
    title: 'Rastreo de unidades por ubicacion y codigo',
    desc: 'Localiza cualquier caja, SKU o codigo en segundos. Busqueda por codigo de barras, celda o referencia WMS con historial completo de donde ha estado cada unidad, quien la movio y cuando.',
  },
  {
    icon: ListChecks,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    module: 'Surtido WMS',
    title: 'Auxiliar de WMS: control de ordenes por surtidor',
    desc: 'Pantalla profesional por surtidor con feedback auditivo en cada scan. Valida OBCs en tiempo real, detecta faltantes al instante y permite bloquear o ingresar entradas manuales. Conectado a tu WMS sin migracion.',
  },
  {
    icon: FileText,
    color: 'text-fuchsia-400',
    bg: 'bg-fuchsia-500/10',
    border: 'border-fuchsia-500/20',
    module: 'Despacho',
    title: 'Despacho sin retrabajo de ultima hora',
    desc: 'Folios consolidados con validacion final por destino. El sistema alerta diferencias antes de que el camion salga. Cierre documentado con historial completo de lo que fue y quien lo valido.',
  },
  {
    icon: AlertTriangle,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    module: 'Anormalidades',
    title: 'Incidencias con responsable y SLA',
    desc: 'Centraliza problemas operativos, asigna responsables y hace seguimiento hasta el cierre. Historial de mejoras vinculadas para no repetir los mismos errores. Mejora continua con evidencia.',
  },
]

const PAIN_POINTS = [
  {
    icon: FileSpreadsheet,
    problem: 'El Excel se convirtio en tu sistema de control',
    solution: 'Archivos compartidos que se sobreescriben, versiones sin nombre, formulas rotas y datos que desaparecen. El Excel no tiene auditoria, no tiene alertas y no valida nada. Cada error se descubre tarde y cuesta rehacer horas de trabajo.',
  },
  {
    icon: Eye,
    problem: 'No sabes que paso ni quien lo hizo',
    solution: 'Sin trazabilidad por usuario, cuando hay un error no hay responsable. Se busca en WhatsApp, en correos o de voz en voz. Kirion registra cada operacion con usuario, timestamp y contexto. Auditoria total sin investigar.',
  },
  {
    icon: Volume2,
    problem: 'Scan a ciegas: el error ya escalo cuando lo notas',
    solution: 'Sin confirmacion auditiva ni visual en cada escaneo, los operadores duplican guias o escanan en la tarima equivocada sin darse cuenta. El problema se descubre en el despacho, cuando el costo de corregirlo es maximo.',
  },
  {
    icon: RefreshCw,
    problem: 'Reproceso continuo que consume tiempo y dinero',
    solution: 'Guias duplicadas, inventario desactualizado, devoluciones sin registro. Cada error mal capturado se convierte en retrabajo: reconteos, reconciliaciones y llamadas que no deberian existir. Kirion valida antes de que el error ocurra.',
  },
  {
    icon: MessageSquare,
    problem: 'Datos criticos dispersos en WhatsApp, correo y papel',
    solution: 'Las ordenes llegan por chat, el inventario esta en un Excel y las novedades se reportan de palabra. No hay una sola fuente de verdad. Kirion unifica todo en un flujo digital: lo que no esta registrado en el sistema, no sucedio.',
  },
  {
    icon: X,
    problem: 'Sin control de acceso, cualquiera puede modificar todo',
    solution: 'Cuando todos tienen acceso a todo, nadie es responsable de nada. Kirion asigna roles por modulo y registra cada accion por operador. El supervisor ve quien hizo que, cuando y con que resultado, sin preguntar.',
  },
]

const STATS = [
  { value: '12+', label: 'Empresas activas' },
  { value: '500K+', label: 'Guias procesadas' },
  { value: '0', label: 'Hojas de Excel requeridas' },
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
          {[['como-trabajamos', 'Como trabajamos'], ['funcionalidades', 'Funciones'], ['precios', 'Precios'], ['contacto', 'Contacto']].map(([id, label]) => (
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
          Optimizacion de procesos logisticos
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-tight mb-6">
          No mas parches.{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-blue-300 to-cyan-400">
            Procesos que funcionan.
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-gray-400 leading-relaxed mb-4 max-w-2xl mx-auto">
          No vendemos software. Optimizamos tu operacion logistica: diagnosticamos los puntos de falla, rediseñamos los flujos y los implementamos con tecnologia propia.
        </p>
        <p className="text-base text-gray-500 leading-relaxed mb-10 max-w-xl mx-auto">
          <span className="text-blue-400 font-medium">Kirion</span> es la plataforma que hace posible el cambio: trazabilidad completa, escaneo con feedback auditivo y visual, control por operador y datos en tiempo real.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
          <button
            onClick={() => { track('cta_click', { location: 'hero' }); scrollTo('contacto') }}
            className="flex items-center justify-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-blue-600/25 text-base"
          >
            Hablar con un especialista
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => scrollTo('funcionalidades')}
            className="flex items-center justify-center gap-2 px-8 py-4 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white font-medium rounded-xl transition-colors border border-gray-700 text-base"
          >
            Ver como funciona
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500">
          {['Diagnostico incluido', 'Implementacion acompanada', '7 modulos integrados'].map(t => (
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
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-14">
          <p className="text-red-400 text-sm font-semibold uppercase tracking-wider mb-3">Puntos de dolor reales</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Lo que cuesta operar sin un sistema real
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            El Excel no es un WMS. WhatsApp no es trazabilidad. El papel no es auditoria. Cada dia que operas sin control digital, pagas el costo en reproceso, errores y tiempo perdido.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PAIN_POINTS.map(({ icon: Icon, problem, solution }) => (
            <div key={problem} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-red-500/30 transition-colors group">
              <div className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4 group-hover:bg-red-500/15 transition-colors">
                <Icon className="w-4 h-4 text-red-400" />
              </div>
              <p className="text-white font-semibold mb-2 text-sm">{problem}</p>
              <p className="text-gray-400 text-sm leading-relaxed">{solution}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function DifferentiatorSection() {
  return (
    <section className="py-20 bg-gray-900/30">
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-14">
          <p className="text-emerald-400 text-sm font-semibold uppercase tracking-wider mb-3">No es un sistema generico</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Construido desde adentro de la operacion
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            No es un ERP adaptado ni un modulo de inventario de proposito general. Kirion fue diseñado con conocimiento directo del campo: cada pantalla, cada flujo y cada detalle responde a como funciona realmente una bodega.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
          <div className="bg-gray-900 border border-emerald-500/20 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Volume2 className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-white font-bold">Feedback que el operador entiende sin mirar</h3>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed mb-3">
              Cada escaneo genera una confirmacion sonora y visual inmediata. Guia valida: beep corto + verde. Duplicada: beep largo + rojo. El operador no necesita leer la pantalla: el sistema le avisa con sonido y color antes de seguir.
            </p>
            <p className="text-emerald-400 text-xs font-medium">Los errores se previenen en el momento, no se descubren en el despacho.</p>
          </div>

          <div className="bg-gray-900 border border-blue-500/20 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-white font-bold">Control por operador, no por equipo</h3>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed mb-3">
              El PIN individual no es solo acceso: es auditoria. Cada accion queda vinculada a una persona. Si hay un error, sabes quien, cuando y en que contexto. El supervisor tiene visibilidad completa sin preguntar ni buscar en grupos de WhatsApp.
            </p>
            <p className="text-blue-400 text-xs font-medium">Rendicion de cuentas integrada, sin formularios adicionales.</p>
          </div>

          <div className="bg-gray-900 border border-purple-500/20 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="text-white font-bold">Ajustes rapidos sin IT ni configuracion compleja</h3>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed mb-3">
              Los procesos cambian. Kirion esta disenado para adaptarse: nuevos surtidores, cambio de rutas, ajuste de limites de guias por tarima. Cambios que antes requeriran un programador o una hoja de calculo nueva se hacen desde el panel en minutos.
            </p>
            <p className="text-purple-400 text-xs font-medium">Flexibilidad operativa sin depender de soporte tecnico.</p>
          </div>

          <div className="bg-gray-900 border border-amber-500/20 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-amber-400" />
              </div>
              <h3 className="text-white font-bold">Reduccion directa de costos de reproceso</h3>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed mb-3">
              Cada guia duplicada detectada, cada discrepancia interceptada antes del despacho y cada devolucion correctamente registrada elimina una hora de trabajo reactive. El ROI de Kirion se mide en retrabajo que ya no sucede y en errores que se previenen antes de costar.
            </p>
            <p className="text-amber-400 text-xs font-medium">Menos reproceso. Menos reclamos. Menos costos ocultos.</p>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 flex flex-col sm:flex-row items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center flex-shrink-0">
            <Settings className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <h3 className="text-white font-bold mb-2">Un sistema que se integra en tus procesos, no al reves</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Kirion no te pide que cambies como operas para adaptarte al software. Se conecta a tu Google Sheets actual, respeta tus flujos existentes y agrega validacion, trazabilidad y control sin reemplazar todo desde cero. El equipo empieza a usarlo el mismo dia: sin curva de aprendizaje larga, sin resistencia al cambio y sin integraciones costosas.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function ProcessSection() {
  const steps = [
    {
      number: '01',
      icon: Search,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
      title: 'Diagnostico operativo',
      desc: 'Mapeamos tu operacion actual: flujos, puntos de falla, cuellos de botella y perdidas de informacion. No asumimos, observamos. El diagnostico define exactamente donde esta el costo oculto.',
    },
    {
      number: '02',
      icon: Settings,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
      title: 'Diseño de procesos',
      desc: 'Rediseñamos los flujos con base en la operacion real, no en plantillas genericas. Cada ajuste responde a un problema especifico identificado en campo: nada que no tenga razon de estar.',
    },
    {
      number: '03',
      icon: Zap,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      title: 'Implementacion con Kirion',
      desc: 'Desplegamos Kirion como la infraestructura digital que hace funcionar los nuevos procesos. El equipo empieza a operar el mismo dia: sin curva larga, sin resistencia y con acompanamiento directo.',
    },
    {
      number: '04',
      icon: TrendingUp,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      title: 'Mejora continua',
      desc: 'Medimos con datos reales de cada modulo: productividad, errores y tiempos. Identificamos donde optimizar y ejecutamos ajustes rapidos. La operacion no se congela: se afina.',
    },
  ]

  return (
    <section id="como-trabajamos" className="py-20 bg-gray-950">
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-14">
          <p className="text-blue-400 text-sm font-semibold uppercase tracking-wider mb-3">Como trabajamos</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Un servicio, no solo un sistema
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            La tecnologia sin proceso es solo ruido. Nuestro modelo combina consultoria operativa con implementacion de Kirion: el resultado es una operacion que funciona diferente, no solo una que tiene nuevo software.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
          {steps.map(({ number, icon: Icon, color, bg, border, title, desc }) => (
            <div key={number} className={`bg-gray-900 border rounded-2xl p-6 flex gap-5 ${border} hover:border-opacity-60 transition-colors`}>
              <div className="flex-shrink-0">
                <div className={`w-12 h-12 rounded-xl ${bg} border ${border} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-bold ${color} opacity-60`}>{number}</span>
                  <h3 className="text-white font-bold">{title}</h3>
                </div>
                <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-gradient-to-r from-blue-500/10 via-purple-500/5 to-blue-500/10 border border-blue-500/20 rounded-2xl p-6 text-center">
          <p className="text-white font-semibold mb-2">
            El objetivo no es que uses Kirion. Es que tu operacion funcione mejor.
          </p>
          <p className="text-gray-400 text-sm max-w-2xl mx-auto">
            Si el problema es de proceso, lo resolvemos con proceso. Kirion es la herramienta que lo hace sostenible, medible y escalable. Pero el punto de partida siempre es la operacion, no el software.
          </p>
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
            Cada modulo diseñado para resolver un problema real
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            No son pantallas genericas. Cada flujo fue pensado para como trabaja un operador en campo: rapido, sin fricciones y con la informacion que necesita en el momento exacto que la necesita.
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
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-12">
          <p className="text-emerald-400 text-sm font-semibold uppercase tracking-wider mb-3">Por que Kirion</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Trazabilidad, eficiencia y control desde el primer escaneo
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            No es solo software. Es el sistema operativo de tu bodega. Cada proceso digitalizado, cada movimiento registrado, cada operador identificado.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
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
              Flujos digitales integrados que reemplazan Excel, WhatsApp y papel. Menos tiempo por operacion, mas capacidad al dia sin aumentar personal.
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
              Usuario, timestamp y contexto en cada accion. Sabes que paso, cuando y quien lo hizo. Sin preguntar, sin buscar: la respuesta ya esta en el sistema.
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
              DropScan, Recepcion, Surtido WMS, Inventario, Despacho, Devoluciones y Anormalidades. Un auxiliar de WMS completo: una base de datos, reportes unificados y trazabilidad total.
            </p>
          </div>
          <div className="bg-gray-900 border border-amber-500/20 rounded-2xl p-6">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-5">
              <DollarSign className="w-6 h-6 text-amber-400" />
            </div>
            <div className="mb-3">
              <span className="text-4xl font-black text-amber-400">0</span>
              <span className="text-sm font-medium text-amber-400 ml-1.5">reprocesos evitables</span>
            </div>
            <h3 className="text-white font-bold mb-2">Reduccion de costos ocultos</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Guias duplicadas detectadas antes del despacho, devoluciones registradas al instante y discrepancias resueltas en campo. El costo que no ves es el que mas duele.
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
          <>Solicitar diagnostico gratuito <ArrowRight className="w-4 h-4" /></>
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
              Auxiliar de WMS para logistica moderna: DropScan, Recepcion, Surtido, Inventario, Despacho, Devoluciones y Anormalidades. Rapido, eficiente y sin migracion.
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
      <ProcessSection />
      <DifferentiatorSection />
      <FeaturesSection />
      <BenefitsSection />
      <PricingSection />

      {/* Contact */}
      <section id="contacto" className="py-20 bg-gray-900/40">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-blue-400 text-sm font-semibold uppercase tracking-wider mb-3">Hablemos de tu operacion</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              El primer paso es el diagnostico
            </h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              Cuéntanos donde esta el problema. Nuestro equipo analiza tu operacion y propone un plan concreto. Sin compromiso, sin costo inicial.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
            <div className="lg:col-span-2 space-y-4">
              {[
                { title: 'Diagnostico sin costo', desc: 'Mapeamos tu operacion actual e identificamos los puntos de mejora antes de proponer nada.' },
                { title: 'Implementacion acompanada', desc: 'No te dejamos con un manual. Estamos en campo contigo hasta que el equipo opera con soltura.' },
                { title: '30 dias de prueba', desc: 'Acceso completo a Kirion sin restricciones. Sin tarjeta de credito.' },
                { title: 'Ajustes rapidos incluidos', desc: 'La operacion cambia. Los ajustes de configuracion no tienen costo extra.' },
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
