import { useEffect, useRef } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useI18nStore } from '../../stores/i18nStore'
import { useTourStore } from '../../stores/tourStore'

const TOUR_DONE_KEY = (id) => `kirion_tour_${id}`
const TOUR_SEEN_KEY = (id) => `kirion_tour_first_seen_${id}`
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// Path to navigate to before showing each step (null = no navigation, stay wherever we are)
const STEP_PATHS = [
  null,                        // 0: welcome
  null,                        // 1: sidebar overview (sidebar always visible)
  '/dropscan/configuracion',   // 2: config tab bar
  '/dropscan/configuracion',   // 3: config empresas content
  '/dropscan/configuracion',   // 4: config canales tab button
  '/dropscan/configuracion',   // 5: config operadores tab button
  '/dropscan/escaneo',         // 6: escaneo start screen
  '/dropscan/historial',       // 7: historial filter bar
  '/dropscan/historial',       // 8: historial table
  '/dropscan/folios',          // 9: folios table
  null,                        // 10: admin nav item (sidebar always visible)
  null,                        // 11: finish
]

export function tourHelpVisible(userId) {
  if (!userId) return false
  const seen = localStorage.getItem(TOUR_SEEN_KEY(userId))
  if (!seen) return false
  return Date.now() - new Date(seen).getTime() < WEEK_MS
}

export default function OnboardingTour() {
  const { user, canView } = useAuthStore()
  const { t } = useI18nStore()
  const { triggerCount, setActive } = useTourStore()
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  const driverRef = useRef(null)

  useEffect(() => { navigateRef.current = navigate }, [navigate])

  const buildSteps = () => {
    const tenantName = user?.tenant_name || 'Kirion'
    const steps = [
      // 0: Welcome
      {
        popover: {
          title: t('tour.welcome.title'),
          description: t('tour.welcome.description').replace('{tenant}', tenantName),
          side: 'over',
          align: 'center',
        },
      },
      // 1: Sidebar navigation overview
      {
        element: '[data-tour="sidebar"]',
        popover: {
          title: t('tour.sidebar.title'),
          description: t('tour.sidebar.description'),
          side: 'right',
          align: 'start',
        },
      },
      // 2: Config tab bar
      {
        element: '[data-tour="config-tabs"]',
        popover: {
          title: t('tour.config.title'),
          description: t('tour.config.description'),
          side: 'bottom',
          align: 'start',
        },
      },
      // 3: Config empresas content
      {
        element: '[data-tour="config-empresas"]',
        popover: {
          title: t('tour.config_empresas.title'),
          description: t('tour.config_empresas.description'),
          side: 'bottom',
          align: 'start',
        },
      },
      // 4: Config canales tab button
      {
        element: '[data-tour="config-tab-canales"]',
        popover: {
          title: t('tour.config_canales.title'),
          description: t('tour.config_canales.description'),
          side: 'bottom',
          align: 'start',
        },
      },
      // 5: Config operadores tab button
      {
        element: '[data-tour="config-tab-operadores"]',
        popover: {
          title: t('tour.config_operadores.title'),
          description: t('tour.config_operadores.description'),
          side: 'bottom',
          align: 'start',
        },
      },
      // 6: Escaneo start screen
      {
        element: '[data-tour="escaneo-inicio"]',
        popover: {
          title: t('tour.escaneo.title'),
          description: t('tour.escaneo.description'),
          side: 'bottom',
          align: 'center',
        },
      },
      // 7: Historial filter bar
      {
        element: '[data-tour="historial-filtros"]',
        popover: {
          title: t('tour.tarimas.title'),
          description: t('tour.tarimas.description'),
          side: 'bottom',
          align: 'start',
        },
      },
      // 8: Historial table
      {
        element: '[data-tour="historial-tabla"]',
        popover: {
          title: t('tour.historial_tabla.title'),
          description: t('tour.historial_tabla.description'),
          side: 'top',
          align: 'start',
        },
      },
      // 9: Folios table
      {
        element: '[data-tour="folios-tabla"]',
        popover: {
          title: t('tour.folios.title'),
          description: t('tour.folios.description'),
          side: 'top',
          align: 'start',
        },
      },
    ]

    // 10: Admin nav item — only if user has access
    if (canView('global.administracion')) {
      steps.push({
        element: '[data-tour="nav-admin"]',
        popover: {
          title: t('tour.administracion.title'),
          description: t('tour.administracion.description'),
          side: 'right',
          align: 'start',
        },
      })
    }

    // Finish
    steps.push({
      popover: {
        title: t('tour.finish.title'),
        description: t('tour.finish.description'),
        side: 'over',
        align: 'center',
        doneBtnText: t('tour.finish.button'),
      },
    })

    return steps
  }

  const markDone = () => {
    if (!user?.id) return
    localStorage.setItem(TOUR_DONE_KEY(user.id), 'done')
  }

  // Navigate to the required path for a given step index, then call callback
  const goToStep = (index, callback) => {
    const path = STEP_PATHS[index]
    if (!path) {
      callback()
      return
    }
    const current = window.location.pathname
    if (current === path || current.startsWith(path + '?')) {
      callback()
    } else {
      navigateRef.current(path)
      setTimeout(callback, 650)
    }
  }

  const startTour = () => {
    driverRef.current?.destroy()
    setActive(true)

    const steps = buildSteps()
    // Build a per-step path array matching the dynamic steps list
    const stepPaths = buildStepPaths(steps.length)

    const instance = driver({
      animate: true,
      smoothScroll: true,
      allowClose: true,
      overlayOpacity: 0.72,
      stagePadding: 8,
      stageRadius: 8,
      showProgress: true,
      progressText: t('tour.step_of'),
      nextBtnText: t('tour.next'),
      prevBtnText: t('tour.prev'),
      doneBtnText: t('tour.finish.button'),
      steps,
      onNextClick: () => {
        const nextIndex = (instance.getActiveIndex() ?? 0) + 1
        if (nextIndex >= stepPaths.length) {
          instance.moveNext()
          return
        }
        const path = stepPaths[nextIndex]
        if (!path) {
          instance.moveNext()
        } else {
          const current = window.location.pathname
          if (current === path || current.startsWith(path + '?')) {
            instance.moveNext()
          } else {
            navigateRef.current(path)
            setTimeout(() => instance.moveNext(), 650)
          }
        }
      },
      onPrevClick: () => {
        const prevIndex = (instance.getActiveIndex() ?? 1) - 1
        if (prevIndex < 0) return
        const path = stepPaths[prevIndex]
        if (!path) {
          instance.movePrevious()
        } else {
          const current = window.location.pathname
          if (current === path || current.startsWith(path + '?')) {
            instance.movePrevious()
          } else {
            navigateRef.current(path)
            setTimeout(() => instance.movePrevious(), 650)
          }
        }
      },
      onCloseClick: () => {
        markDone()
        instance.destroy()
      },
      onDestroyed: () => {
        markDone()
        setActive(false)
      },
    })

    driverRef.current = instance
    instance.drive()
  }

  // Build a path array for the dynamically built steps (admin step is conditional)
  const buildStepPaths = (totalSteps) => {
    const hasAdmin = canView('global.administracion')
    // Static steps 0-9, then optionally admin (10), then finish
    const paths = [
      null,                        // 0: welcome
      null,                        // 1: sidebar
      '/dropscan/configuracion',   // 2: config tabs
      '/dropscan/configuracion',   // 3: config empresas
      '/dropscan/configuracion',   // 4: config canales
      '/dropscan/configuracion',   // 5: config operadores
      '/dropscan/escaneo',         // 6: escaneo
      '/dropscan/historial',       // 7: historial filtros
      '/dropscan/historial',       // 8: historial tabla
      '/dropscan/folios',          // 9: folios
    ]
    if (hasAdmin) paths.push(null) // 10: admin nav (sidebar always visible)
    paths.push(null) // finish
    return paths
  }

  // Auto-start for Administrador users on first login
  useEffect(() => {
    if (!user?.id) return
    const isAdmin = user.rol_nombre === 'Administrador' || user.es_admin_tenant
    if (!isAdmin) return
    const done = localStorage.getItem(TOUR_DONE_KEY(user.id))
    if (done) return
    if (!localStorage.getItem(TOUR_SEEN_KEY(user.id))) {
      localStorage.setItem(TOUR_SEEN_KEY(user.id), new Date().toISOString())
    }
    const timer = setTimeout(startTour, 700)
    return () => clearTimeout(timer)
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-start when triggered from help button
  const prevTrigger = useRef(0)
  useEffect(() => {
    if (triggerCount === 0) return
    if (triggerCount === prevTrigger.current) return
    prevTrigger.current = triggerCount
    startTour()
  }, [triggerCount]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      driverRef.current?.destroy()
      setActive(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
