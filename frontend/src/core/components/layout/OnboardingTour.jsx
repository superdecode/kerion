import { useEffect, useRef } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useI18nStore } from '../../stores/i18nStore'
import { useTourStore } from '../../stores/tourStore'

const LANG_LABELS = { es: 'Español', zh: '中文' }

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
  null,                        // 10: finish
]

// Sidebar nav item to highlight (data-tour id) for each step index
const STEP_NAV_IDS = [
  null, null,
  'nav-configuracion', 'nav-configuracion', 'nav-configuracion', 'nav-configuracion',
  'nav-escaneo',
  'nav-historial', 'nav-historial',
  'nav-folios',
  null,
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
  const { triggerCount, setActive, setHighlightedItem } = useTourStore()
  const startTourRef = useRef(null)
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
    const stepPaths = buildStepPaths()

    const instance = driver({
      animate: true,
      smoothScroll: true,
      allowClose: true,
      overlayOpacity: 0.72,
      stagePadding: 8,
      stageRadius: 8,
      showProgress: true,
      progressText: t('tour.step_of'),
      steps,
      onPopoverRender: (popover, { state }) => {
        if (popover.nextButton) popover.nextButton.textContent = t('tour.next')
        if (popover.previousButton) popover.previousButton.textContent = t('tour.prev')
        if (state.activeIndex === steps.length - 1 && popover.nextButton) {
          popover.nextButton.textContent = t('tour.finish.button')
        }
        if (state.activeIndex === 0) {
          const { locale, setLocale } = useI18nStore.getState()
          const wrap = document.createElement('div')
          wrap.className = 'driver-tour-lang-wrap'
          wrap.innerHTML = `
            <span>语言 / Idioma:</span>
            <select class="driver-tour-lang-select" data-driver-lang>
              ${Object.entries(LANG_LABELS).map(([code, label]) =>
                `<option value="${code}"${locale === code ? ' selected' : ''}>${label}</option>`
              ).join('')}
            </select>
          `
          popover.description.appendChild(wrap)
          wrap.querySelector('[data-driver-lang]').addEventListener('change', (e) => {
            setLocale(e.target.value)
            driverRef.current?.destroy()
            setTimeout(() => startTourRef.current?.(), 50)
          })
        }
      },
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
      onHighlightStarted: () => {
        const idx = instance.getActiveIndex() ?? 0
        setHighlightedItem(STEP_NAV_IDS[idx] ?? null)
      },
      onCloseClick: () => {
        markDone()
        instance.destroy()
      },
      onDestroyed: () => {
        markDone()
        setActive(false)
        setHighlightedItem(null)
      },
    })

    driverRef.current = instance
    startTourRef.current = startTour
    instance.drive()
  }

  // Build a path array for the dynamically built steps
  const buildStepPaths = () => {
    return [
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
      null,                        // 10: finish
    ]
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
