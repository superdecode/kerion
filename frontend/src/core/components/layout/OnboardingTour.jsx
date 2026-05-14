import { useEffect, useRef } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useAuthStore } from '../../stores/authStore'
import { useI18nStore } from '../../stores/i18nStore'
import { useTourStore } from '../../stores/tourStore'

const TOUR_DONE_KEY = (id) => `kirion_tour_${id}`
const TOUR_SEEN_KEY = (id) => `kirion_tour_first_seen_${id}`
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

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
  const driverRef = useRef(null)

  const buildSteps = () => {
    const tenantName = user?.tenant_name || 'Kirion'
    return [
      {
        popover: {
          title: t('tour.welcome.title'),
          description: t('tour.welcome.description').replace('{tenant}', tenantName),
          side: 'over',
          align: 'center',
        },
      },
      {
        element: '[data-tour="sidebar"]',
        popover: {
          title: t('tour.sidebar.title'),
          description: t('tour.sidebar.description'),
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '[data-tour="nav-configuracion"]',
        popover: {
          title: t('tour.config.title'),
          description: t('tour.config.description'),
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '[data-tour="nav-configuracion"]',
        popover: {
          title: t('tour.config_empresas.title'),
          description: t('tour.config_empresas.description'),
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '[data-tour="nav-escaneo"]',
        popover: {
          title: t('tour.escaneo.title'),
          description: t('tour.escaneo.description'),
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '[data-tour="nav-escaneo"]',
        popover: {
          title: t('tour.iniciar_sesion.title'),
          description: t('tour.iniciar_sesion.description'),
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '[data-tour="nav-historial"]',
        popover: {
          title: t('tour.tarimas.title'),
          description: t('tour.tarimas.description'),
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '[data-tour="nav-folios"]',
        popover: {
          title: t('tour.folios.title'),
          description: t('tour.folios.description'),
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '[data-tour="nav-reportes"]',
        popover: {
          title: t('tour.reportes.title'),
          description: t('tour.reportes.description'),
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '[data-tour="nav-admin"]',
        popover: {
          title: t('tour.administracion.title'),
          description: t('tour.administracion.description'),
          side: 'right',
          align: 'start',
        },
      },
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

  const startTour = () => {
    driverRef.current?.destroy()

    driverRef.current = driver({
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
      onCloseClick: () => {
        markDone()
        driverRef.current?.destroy()
      },
      onDestroyed: () => {
        markDone()
      },
    })

    driverRef.current.drive()
  }

  // Auto-start for Administrador users who haven't seen the tour
  useEffect(() => {
    if (!user?.id) return
    const isAdmin = user.rol_nombre === 'Administrador' || user.es_admin_tenant
    if (!isAdmin) return
    const done = localStorage.getItem(TOUR_DONE_KEY(user.id))
    if (done) return

    // Record first seen timestamp (used by help button visibility)
    if (!localStorage.getItem(TOUR_SEEN_KEY(user.id))) {
      localStorage.setItem(TOUR_SEEN_KEY(user.id), new Date().toISOString())
    }

    const timer = setTimeout(startTour, 700)
    return () => clearTimeout(timer)
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-start when triggerCount changes (from help button)
  const prevTrigger = useRef(0)
  useEffect(() => {
    if (triggerCount === 0) return
    if (triggerCount === prevTrigger.current) return
    prevTrigger.current = triggerCount
    startTour()
  }, [triggerCount]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => driverRef.current?.destroy()
  }, [])

  return null
}
