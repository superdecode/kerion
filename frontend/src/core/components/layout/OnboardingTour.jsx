import { useEffect, useRef, useState, useCallback } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useI18nStore } from '../../stores/i18nStore'
import { useTourStore } from '../../stores/tourStore'
import { CheckSquare, Square, X } from 'lucide-react'

// Always show the help button for authenticated users
export function tourHelpVisible(userId) {
  return !!userId
}

// Block definitions — each block maps to a sidebar group and has steps
// Steps may have: element (CSS selector), path (navigate before), groupToExpand (sidebar group id), navHighlight (sidebar nav id)
const buildBlocks = (t, tenantName) => [
  {
    id: 'dropscan',
    moduleId: 'dropscan',
    permission: 'dropscan.escaneo',
    labelKey: 'tour.block.dropscan.label',
    steps: [
      {
        popover: {
          title: t('tour.block.dropscan.intro.title'),
          description: t('tour.block.dropscan.intro.desc'),
          side: 'over',
          align: 'center',
        },
        path: null,
        groupToExpand: null,
        navHighlight: null,
      },
      {
        element: '[data-tour="nav-folios"]',
        popover: {
          title: t('tour.block.dropscan.folios.title'),
          description: t('tour.block.dropscan.folios.desc'),
          side: 'right',
          align: 'center',
        },
        path: null,
        groupToExpand: 'dropscan',
        navHighlight: 'nav-folios',
      },
    ],
  },
  {
    id: 'surtido',
    moduleId: 'surtido',
    permission: 'surtido.ordenes',
    labelKey: 'tour.block.surtido.label',
    steps: [
      {
        popover: {
          title: t('tour.block.surtido.intro.title'),
          description: t('tour.block.surtido.intro.desc'),
          side: 'over',
          align: 'center',
        },
        path: null,
        groupToExpand: null,
        navHighlight: null,
      },
      {
        element: '[data-tour="sur-btn-surtidores"]',
        popover: {
          title: t('tour.block.surtido.surtidores.title'),
          description: t('tour.block.surtido.surtidores.desc'),
          side: 'bottom',
          align: 'start',
        },
        path: '/surtido',
        groupToExpand: 'surtido',
        navHighlight: 'nav-sur-ordenes',
      },
      {
        element: '[data-tour="nav-sur-validacion"]',
        popover: {
          title: t('tour.block.surtido.validacion.title'),
          description: t('tour.block.surtido.validacion.desc'),
          side: 'right',
          align: 'center',
        },
        path: null,
        groupToExpand: 'surtido',
        navHighlight: 'nav-sur-validacion',
      },
    ],
  },
  {
    id: 'despacho',
    moduleId: 'despacho',
    permission: 'despacho.ordenes',
    labelKey: 'tour.block.despacho.label',
    steps: [
      {
        popover: {
          title: t('tour.block.despacho.intro.title'),
          description: t('tour.block.despacho.intro.desc'),
          side: 'over',
          align: 'center',
        },
        path: null,
        groupToExpand: null,
        navHighlight: null,
      },
      {
        element: '[data-tour="desp-catalog-actions"]',
        popover: {
          title: t('tour.block.despacho.catalogs.title'),
          description: t('tour.block.despacho.catalogs.desc'),
          side: 'bottom',
          align: 'start',
        },
        path: '/despacho/ordenes',
        groupToExpand: 'despacho',
        navHighlight: 'nav-desp-ordenes',
      },
    ],
  },
  {
    id: 'recepcion',
    moduleId: 'recepcion',
    permission: 'recepcion.recibir',
    labelKey: 'tour.block.recepcion.label',
    steps: [
      {
        popover: {
          title: t('tour.block.recepcion.intro.title'),
          description: t('tour.block.recepcion.intro.desc'),
          side: 'over',
          align: 'center',
        },
        path: '/recepcion/recibir',
        groupToExpand: 'recepcion',
        navHighlight: 'nav-rec-recibir',
      },
      {
        element: '[data-tour="rec-btn-recibir"]',
        popover: {
          title: t('tour.block.recepcion.recibir.title'),
          description: t('tour.block.recepcion.recibir.desc'),
          side: 'bottom',
          align: 'end',
        },
        path: '/recepcion/recibir',
        groupToExpand: 'recepcion',
        navHighlight: 'nav-rec-recibir',
      },
      {
        popover: {
          title: t('tour.block.recepcion.tarimas.title'),
          description: t('tour.block.recepcion.tarimas.desc'),
          side: 'over',
          align: 'center',
        },
        path: null,
        groupToExpand: null,
        navHighlight: null,
      },
    ],
  },
  {
    id: 'inventario',
    moduleId: 'inventario',
    permission: 'inventario.registros',
    labelKey: 'tour.block.inventario.label',
    steps: [
      {
        popover: {
          title: t('tour.block.inventario.intro.title'),
          description: t('tour.block.inventario.intro.desc'),
          side: 'over',
          align: 'center',
        },
        path: null,
        groupToExpand: null,
        navHighlight: null,
      },
      {
        element: '[data-tour="nav-inv-rastreo"]',
        popover: {
          title: t('tour.block.inventario.rastreo.title'),
          description: t('tour.block.inventario.rastreo.desc'),
          side: 'right',
          align: 'center',
        },
        path: null,
        groupToExpand: 'inventario',
        navHighlight: 'nav-inv-rastreo',
      },
      {
        element: '[data-tour="inv-btn-quicksearch"]',
        popover: {
          title: t('tour.block.inventario.quicksearch.title'),
          description: t('tour.block.inventario.quicksearch.desc'),
          side: 'bottom',
          align: 'end',
        },
        path: '/Inventario/registros',
        groupToExpand: 'inventario',
        navHighlight: 'nav-inv-registros',
      },
    ],
  },
  {
    id: 'devoluciones',
    moduleId: 'devoluciones',
    permission: 'devoluciones.entradas',
    labelKey: 'tour.block.devoluciones.label',
    steps: [
      {
        element: '[data-tour="sidebar"]',
        popover: {
          title: t('tour.block.devoluciones.intro.title'),
          description: t('tour.block.devoluciones.intro.desc'),
          side: 'right',
          align: 'start',
        },
        path: null,
        groupToExpand: 'devoluciones',
        navHighlight: null,
      },
    ],
  },
  {
    id: 'anormalidades',
    moduleId: 'anormalidades',
    permission: 'anormalidades.registro',
    labelKey: 'tour.block.anormalidades.label',
    steps: [
      {
        element: '[data-tour="sidebar"]',
        popover: {
          title: t('tour.block.anormalidades.intro.title'),
          description: t('tour.block.anormalidades.intro.desc'),
          side: 'right',
          align: 'start',
        },
        path: null,
        groupToExpand: 'anormalidades',
        navHighlight: null,
      },
    ],
  },
  {
    id: 'admin',
    moduleId: 'sistema',
    permission: 'global.administracion',
    labelKey: 'tour.block.admin.label',
    steps: [
      {
        element: '[data-tour="nav-admin"]',
        popover: {
          title: t('tour.block.admin.intro.title'),
          description: t('tour.block.admin.intro.desc'),
          side: 'right',
          align: 'center',
        },
        path: null,
        groupToExpand: 'sistema',
        navHighlight: 'nav-admin',
      },
    ],
  },
]

// Block selection modal
function TourBlockSelector({ blocks, selected, onToggle, onToggleAll, onStart, onSkip, t }) {
  const allSelected = selected.length === blocks.length
  return (
    <div className="fixed inset-0 z-[200000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onSkip} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-warm-100">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-warm-900">{t('tour.selection.title')}</h2>
            <button onClick={onSkip} className="w-8 h-8 flex items-center justify-center rounded-lg text-warm-400 hover:text-warm-700 hover:bg-warm-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-warm-500 mt-1">{t('tour.selection.desc')}</p>
        </div>

        <div className="px-6 py-4 space-y-2 max-h-64 overflow-y-auto">
          {blocks.map(block => {
            const checked = selected.includes(block.id)
            return (
              <button
                key={block.id}
                onClick={() => onToggle(block.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors text-left ${
                  checked
                    ? 'bg-primary-50 border-primary-200 text-primary-800'
                    : 'bg-warm-50 border-warm-200 text-warm-700 hover:bg-warm-100'
                }`}
              >
                {checked
                  ? <CheckSquare className="w-4 h-4 text-primary-600 flex-shrink-0" />
                  : <Square className="w-4 h-4 text-warm-400 flex-shrink-0" />
                }
                {t(block.labelKey)}
              </button>
            )
          })}
        </div>

        <div className="px-6 pb-5 pt-3 border-t border-warm-100 space-y-2">
          <button
            onClick={onToggleAll}
            className="w-full text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors py-1"
          >
            {allSelected ? t('tour.selection.deselectAll') : t('tour.selection.selectAll')}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onSkip}
              className="flex-1 btn-ghost text-sm"
            >
              {t('tour.selection.skip')}
            </button>
            <button
              onClick={() => onStart(selected)}
              disabled={selected.length === 0}
              className="flex-1 btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('tour.selection.start')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OnboardingTour() {
  const { user, canView, isModuleEnabled, markTourComplete } = useAuthStore()
  const { t } = useI18nStore()
  const { triggerCount, setActive, setHighlightedItem, expandGroup } = useTourStore()
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  const driverRef = useRef(null)

  // 'idle' | 'selecting' | 'running'
  const [phase, setPhase] = useState('idle')
  const [availableBlocks, setAvailableBlocks] = useState([])
  const [selectedBlockIds, setSelectedBlockIds] = useState([])

  useEffect(() => { navigateRef.current = navigate }, [navigate])

  const buildAvailableBlocks = useCallback(() => {
    const blocks = buildBlocks(t, user?.tenant_name || 'Kirion')
    return blocks.filter(b => {
      if (b.moduleId === 'sistema') return canView(b.permission)
      return isModuleEnabled(b.moduleId) && canView(b.permission)
    })
  }, [t, user, canView, isModuleEnabled])

  const launchSelector = useCallback(() => {
    const blocks = buildAvailableBlocks()
    setAvailableBlocks(blocks)
    setSelectedBlockIds(blocks.map(b => b.id))
    setPhase('selecting')
  }, [buildAvailableBlocks])

  const handleSkipForever = useCallback(() => {
    markTourComplete()
    setPhase('idle')
    driverRef.current?.destroy()
  }, [markTourComplete])

  const handleSkipNow = useCallback(() => {
    setPhase('idle')
    driverRef.current?.destroy()
    setActive(false)
    setHighlightedItem(null)
  }, [setActive, setHighlightedItem])

  const toggleBlock = useCallback((id) => {
    setSelectedBlockIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }, [])

  const toggleAll = useCallback(() => {
    setSelectedBlockIds(prev =>
      prev.length === availableBlocks.length ? [] : availableBlocks.map(b => b.id)
    )
  }, [availableBlocks])

  const startTour = useCallback((blockIds) => {
    setPhase('running')
    driverRef.current?.destroy()
    setActive(true)

    const blocks = buildBlocks(t, user?.tenant_name || 'Kirion')
      .filter(b => blockIds.includes(b.id))

    // Flatten all steps, tracking which block each step belongs to
    const flatSteps = []
    const blockBoundaries = [] // index of first step of each block
    blocks.forEach((block, blockIdx) => {
      blockBoundaries.push(flatSteps.length)
      block.steps.forEach(step => {
        flatSteps.push({ ...step, blockIdx, blockId: block.id })
      })
    })

    // Add finish step
    flatSteps.push({
      popover: {
        title: t('tour.finish.title'),
        description: t('tour.finish.description'),
        side: 'over',
        align: 'center',
        doneBtnText: t('tour.finish.button'),
      },
      path: null,
      groupToExpand: null,
      navHighlight: null,
      blockIdx: -1,
      blockId: null,
    })

    const finishTour = () => {
      markTourComplete()
      driverRef.current?.destroy()
    }

    const navigateAndExpand = (step, callback) => {
      if (step.groupToExpand) {
        expandGroup(step.groupToExpand)
      }
      const path = step.path
      if (!path) {
        if (step.groupToExpand) {
          setTimeout(callback, 350)
        } else {
          callback()
        }
        return
      }
      const current = window.location.pathname
      if (current.toLowerCase() === path.toLowerCase() || current.toLowerCase().startsWith(path.toLowerCase() + '/') || current.toLowerCase().startsWith(path.toLowerCase() + '?')) {
        if (step.groupToExpand) {
          setTimeout(callback, 350)
        } else {
          callback()
        }
      } else {
        navigateRef.current(path)
        setTimeout(callback, step.groupToExpand ? 700 : 650)
      }
    }

    const driverSteps = flatSteps.map(step => {
      const s = { popover: step.popover }
      if (step.element) s.element = step.element
      return s
    })

    const instance = driver({
      animate: true,
      smoothScroll: true,
      allowClose: true,
      overlayOpacity: 0.72,
      stagePadding: 8,
      stageRadius: 8,
      showProgress: true,
      progressText: t('tour.step_of'),
      steps: driverSteps,
      onPopoverRender: (popover, { state }) => {
        const idx = state.activeIndex ?? 0
        if (popover.nextButton) popover.nextButton.textContent = t('tour.next')
        if (popover.previousButton) popover.previousButton.textContent = t('tour.prev')
        if (idx === flatSteps.length - 1 && popover.nextButton) {
          popover.nextButton.textContent = t('tour.finish.button')
        }

        // Welcome step extras (first step)
        if (idx === 0) {
          const dontShowBtn = document.createElement('button')
          dontShowBtn.textContent = t('tour.dontShowAgain')
          dontShowBtn.className = 'driver-tour-dont-show-btn'
          dontShowBtn.addEventListener('click', () => {
            finishTour()
          })
          popover.description.appendChild(dontShowBtn)
        }

        // "Skip this module" button — shown on all non-finish steps that belong to a block
        const step = flatSteps[idx]
        if (step && step.blockIdx >= 0) {
          // Find the first step of the next block
          const nextBlockIdx = step.blockIdx + 1
          const nextBlockStart = blockBoundaries[nextBlockIdx]
          if (nextBlockStart !== undefined) {
            const skipModuleBtn = document.createElement('button')
            skipModuleBtn.textContent = t('tour.skipModule')
            skipModuleBtn.className = 'driver-tour-skip-module-btn'
            skipModuleBtn.addEventListener('click', () => {
              const nextStep = flatSteps[nextBlockStart]
              navigateAndExpand(nextStep, () => instance.moveTo(nextBlockStart))
            })
            popover.description.appendChild(skipModuleBtn)
          }
        }
      },
      onNextClick: () => {
        const currentIdx = instance.getActiveIndex() ?? 0
        const nextIdx = currentIdx + 1
        if (nextIdx >= flatSteps.length) {
          finishTour()
          return
        }
        const nextStep = flatSteps[nextIdx]
        setHighlightedItem(nextStep.navHighlight ?? null)
        navigateAndExpand(nextStep, () => instance.moveNext())
      },
      onPrevClick: () => {
        const currentIdx = instance.getActiveIndex() ?? 1
        const prevIdx = currentIdx - 1
        if (prevIdx < 0) return
        const prevStep = flatSteps[prevIdx]
        setHighlightedItem(prevStep.navHighlight ?? null)
        navigateAndExpand(prevStep, () => instance.movePrevious())
      },
      onHighlightStarted: () => {
        const idx = instance.getActiveIndex() ?? 0
        const step = flatSteps[idx]
        setHighlightedItem(step?.navHighlight ?? null)
      },
      onCloseClick: () => {
        markTourComplete()
        instance.destroy()
      },
      onDestroyed: () => {
        markTourComplete()
        setActive(false)
        setHighlightedItem(null)
        setPhase('idle')
      },
    })

    driverRef.current = instance

    // Navigate and expand for the first step before driving
    const firstStep = flatSteps[0]
    navigateAndExpand(firstStep, () => instance.drive())
  }, [t, user, markTourComplete, setActive, setHighlightedItem, expandGroup])

  // Auto-start for first login (tour not completed)
  useEffect(() => {
    if (!user?.id) return
    if (user.tour_completado) return
    const timer = setTimeout(launchSelector, 900)
    return () => clearTimeout(timer)
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Manual trigger from help button
  const prevTrigger = useRef(0)
  useEffect(() => {
    if (triggerCount === 0) return
    if (triggerCount === prevTrigger.current) return
    prevTrigger.current = triggerCount
    launchSelector()
  }, [triggerCount]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      driverRef.current?.destroy()
      setActive(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'selecting') {
    return (
      <TourBlockSelector
        blocks={availableBlocks}
        selected={selectedBlockIds}
        onToggle={toggleBlock}
        onToggleAll={toggleAll}
        onStart={(ids) => {
          if (ids.length === 0) return
          startTour(ids)
        }}
        onSkip={handleSkipNow}
        t={t}
      />
    )
  }

  return null
}
