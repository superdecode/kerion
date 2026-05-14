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

// Path to navigate to before showing each step index (null = no navigation needed)
const STEP_PATHS = [
  null,                        // 0: welcome
  '/dropscan',                 // 1: dashboard KPIs
  '/dropscan',                 // 2: dashboard active sessions
  '/dropscan/configuracion',   // 3: config tab bar
  '/dropscan/configuracion',   // 4: config empresas content
  '/dropscan/configuracion',   // 5: config canales tab button
  '/dropscan/configuracion',   // 6: config operadores tab button
  '/dropscan/escaneo',         // 7: escaneo start screen
  '/dropscan/historial',       // 8: historial filter bar
  '/dropscan/historial',       // 9: historial table
  '/dropscan/folios',          // 10: folios table
  '/dropscan/reportes',        // 11: reportes stat cards
  null,                        // 12: finish
]

export function tourHelpVisible(userId) {
  if (!userId) return false
  const seen = localStorage.getItem(TOUR_SEEN_KEY(userId))
  if (!seen) return false
  return Date.now() - new Date(seen).getTime() < WEEK_MS
}

export default function OnboardingTour() {
  const { user } = useAuthStore()
  const { t } = useI18nStore()
  const { triggerCount } = useTourStore()
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  const driverRef = useRef(null)

  useEffect(() => { navigateRef.current = navigate }, [navigate])

  const buildSteps = () => {
    const tenantName = user?.tenant_name || 'Kirion'
    return [
      // 0: Welcome
      {
        popover: {
          title: t('tour.welcome.title'),
          description: t('tour.welcome.description').replace('{tenant}', tenantName),
          side: 'over',
          align: 'center',
        },
      },
      // 1: Dashboard KPI cards
      {
        element: '[data-tour="dashboard-kpis"]',
        popover: {
          title: t('tour.dashboard_kpis.title'),
          description: t('tour.dashboard_kpis.description'),
          side: 'bottom',
          align: 'start',
        },
      },
      // 2: Dashboard active sessions
      {
        element: '[data-tour="dashboard-sesiones"]',
        popover: {
          title: t('tour.dashboard_sesiones.title'),
          description: t('tour.dashboard_sesiones.description'),
          side: 'top',
          align: 'start',
        },
      },
      // 3: Config tab bar overview
      {
        element: '[data-tour="config-tabs"]',
        popover: {
          title: t('tour.config.title'),
          description: t('tour.config.description'),
          side: 'bottom',
          align: 'start',
        },
      },
      // 4: Config empresas content area
      {
        element: '[data-tour="config-empresas"]',
        popover: {
          title: t('tour.config_empresas.title'),
          description: t('tour.config_empresas.description'),
          side: 'bottom',
          align: 'start',
        },
      },
      // 5: Config canales tab button
      {
        element: '[data-tour="config-tab-canales"]',
        popover: {
          title: t('tour.config_canales.title'),
          description: t('tour.config_canales.description'),
          side: 'bottom',
          align: 'start',
        },
      },
      // 6: Config operadores tab button
      {
        element: '[data-tour="config-tab-operadores"]',
        popover: {
          title: t('tour.config_operadores.title'),
          description: t('tour.config_operadores.description'),
          side: 'bottom',
          align: 'start',
        },
      },
      // 7: Escaneo start screen
      {
        element: '[data-tour="escaneo-inicio"]',
        popover: {
          title: t('tour.escaneo.title'),
          description: t('tour.escaneo.description'),
          side: 'bottom',
          align: 'center',
        },
      },
      // 8: Historial filter bar
      {
        element: '[data-tour="historial-filtros"]',
        popover: {
          title: t('tour.tarimas.title'),
          description: t('tour.tarimas.description'),
          side: 'bottom',
          align: 'start',
        },
      },
      // 9: Historial table
      {
        element: '[data-tour="historial-tabla"]',
        popover: {
          title: t('tour.historial_tabla.title'),
          description: t('tour.historial_tabla.description'),
          side: 'top',
          align: 'start',
        },
      },
      // 10: Folios table
      {
        element: '[data-tour="folios-tabla"]',
        popover: {
          title: t('tour.folios.title'),
          description: t('tour.folios.description'),
          side: 'top',
          align: 'start',
        },
      },
      // 11: Reportes stat cards
      {
        element: '[data-tour="reportes-stats"]',
        popover: {
          title: t('tour.reportes.title'),
          description: t('tour.reportes.description'),
          side: 'bottom',
          align: 'start',
        },
      },
      // 12: Finish
      {
        popover: {
          title: t('tour.finish.title'),
          description: t('tour.finish.description'),
          side: 'over',
          align: 'center',
          doneBtnText: t('tour.finish.button'),
        },
      },
    ]
  }

  const markDone = () => {
    if (!user?.id) return
    localStorage.setItem(TOUR_DONE_KEY(user.id), 'done')
  }

  // Navigate to the required path for a given step, then call callback
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
      steps: buildSteps(),
      onNextClick: () => {
        const nextIndex = (instance.getActiveIndex() ?? 0) + 1
        if (nextIndex >= STEP_PATHS.length) {
          instance.moveNext()
          return
        }
        goToStep(nextIndex, () => instance.moveNext())
      },
      onPrevClick: () => {
        const prevIndex = (instance.getActiveIndex() ?? 1) - 1
        if (prevIndex < 0) return
        goToStep(prevIndex, () => instance.movePrevious())
      },
      onCloseClick: () => {
        markDone()
        instance.destroy()
      },
      onDestroyed: () => {
        markDone()
      },
    })

    driverRef.current = instance

    // Navigate to first real step path (step 0 is welcome with no path, step 1 needs /dropscan)
    // We start at step 0 without navigating; navigation happens on first Next click
    instance.drive()
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
    return () => driverRef.current?.destroy()
  }, [])

  return null
}
