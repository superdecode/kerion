import { useEffect, useRef } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useI18nStore } from '../../stores/i18nStore'
import { useTourStore } from '../../stores/tourStore'

const LANG_LABELS = { es: 'Español', zh: '中文' }

export function tourHelpVisible(userId) {
  return !!userId
}

// Order matches the sidebar exactly: dropscan → devoluciones → recepcion → inventario → surtido → despacho → anormalidades → admin
const buildBlocks = (t) => [
  {
    id: 'dropscan',
    moduleId: 'dropscan',
    permission: 'dropscan.escaneo',
    labelKey: 'tour.block.dropscan.label',
    steps: [
      {
        popover: { title: t('tour.block.dropscan.intro.title'), description: t('tour.block.dropscan.intro.desc'), side: 'over', align: 'center' },
        path: '/DropScan/escaneo', groupToExpand: 'dropscan', navHighlight: 'nav-escaneo',
      },
      {
        element: '[data-tour="nav-folios"]',
        popover: { title: t('tour.block.dropscan.folios.title'), description: t('tour.block.dropscan.folios.desc'), side: 'right', align: 'center' },
        path: null, groupToExpand: 'dropscan', navHighlight: 'nav-folios',
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
        element: '[data-tour="nav-dev-entradas"]',
        popover: { title: t('tour.block.devoluciones.intro.title'), description: t('tour.block.devoluciones.intro.desc'), side: 'right', align: 'center' },
        path: '/Devoluciones/entradas', groupToExpand: 'devoluciones', navHighlight: 'nav-dev-entradas',
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
        popover: { title: t('tour.block.recepcion.intro.title'), description: t('tour.block.recepcion.intro.desc'), side: 'over', align: 'center' },
        path: '/recepcion/recibir', groupToExpand: 'recepcion', navHighlight: 'nav-rec-recibir',
      },
      {
        element: '[data-tour="rec-btn-recibir"]',
        popover: { title: t('tour.block.recepcion.recibir.title'), description: t('tour.block.recepcion.recibir.desc'), side: 'bottom', align: 'end' },
        path: '/recepcion/recibir', groupToExpand: 'recepcion', navHighlight: 'nav-rec-recibir',
      },
      {
        popover: { title: t('tour.block.recepcion.tarimas.title'), description: t('tour.block.recepcion.tarimas.desc'), side: 'over', align: 'center' },
        path: null, groupToExpand: null, navHighlight: null,
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
        popover: { title: t('tour.block.inventario.intro.title'), description: t('tour.block.inventario.intro.desc'), side: 'over', align: 'center' },
        path: '/Inventario/registros', groupToExpand: 'inventario', navHighlight: 'nav-inv-registros',
      },
      {
        element: '[data-tour="nav-inv-rastreo"]',
        popover: { title: t('tour.block.inventario.rastreo.title'), description: t('tour.block.inventario.rastreo.desc'), side: 'right', align: 'center' },
        path: null, groupToExpand: 'inventario', navHighlight: 'nav-inv-rastreo',
      },
      {
        element: '[data-tour="inv-btn-quicksearch"]',
        popover: { title: t('tour.block.inventario.quicksearch.title'), description: t('tour.block.inventario.quicksearch.desc'), side: 'bottom', align: 'end' },
        path: '/Inventario/registros', groupToExpand: 'inventario', navHighlight: 'nav-inv-registros',
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
        popover: { title: t('tour.block.surtido.intro.title'), description: t('tour.block.surtido.intro.desc'), side: 'over', align: 'center' },
        path: '/surtido', groupToExpand: 'surtido', navHighlight: 'nav-sur-ordenes',
      },
      {
        element: '[data-tour="sur-btn-surtidores"]',
        popover: { title: t('tour.block.surtido.surtidores.title'), description: t('tour.block.surtido.surtidores.desc'), side: 'bottom', align: 'start' },
        path: '/surtido', groupToExpand: 'surtido', navHighlight: 'nav-sur-ordenes',
      },
      {
        element: '[data-tour="nav-sur-validacion"]',
        popover: { title: t('tour.block.surtido.validacion.title'), description: t('tour.block.surtido.validacion.desc'), side: 'right', align: 'center' },
        path: null, groupToExpand: 'surtido', navHighlight: 'nav-sur-validacion',
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
        popover: { title: t('tour.block.despacho.intro.title'), description: t('tour.block.despacho.intro.desc'), side: 'over', align: 'center' },
        path: '/despacho/ordenes', groupToExpand: 'despacho', navHighlight: 'nav-desp-ordenes',
      },
      {
        element: '[data-tour="desp-catalog-actions"]',
        popover: { title: t('tour.block.despacho.catalogs.title'), description: t('tour.block.despacho.catalogs.desc'), side: 'bottom', align: 'start' },
        path: '/despacho/ordenes', groupToExpand: 'despacho', navHighlight: 'nav-desp-ordenes',
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
        element: '[data-tour="nav-anorm-registro"]',
        popover: { title: t('tour.block.anormalidades.intro.title'), description: t('tour.block.anormalidades.intro.desc'), side: 'right', align: 'center' },
        path: '/Anormalidades/registro', groupToExpand: 'anormalidades', navHighlight: 'nav-anorm-registro',
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
        popover: { title: t('tour.block.admin.intro.title'), description: t('tour.block.admin.intro.desc'), side: 'right', align: 'center' },
        path: '/admin', groupToExpand: 'sistema', navHighlight: 'nav-admin',
      },
    ],
  },
]

export default function OnboardingTour() {
  const { user, canView, isModuleEnabled, markTourComplete } = useAuthStore()
  const { t } = useI18nStore()
  const { triggerCount, setActive, setHighlightedItem, expandGroup } = useTourStore()
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  const driverRef = useRef(null)
  const startSelectorRef = useRef(null)
  const startTourRef = useRef(null)

  useEffect(() => { navigateRef.current = navigate }, [navigate])

  const getAvailableBlocks = () => {
    const { t: tFn } = useI18nStore.getState()
    const { canView: cv, isModuleEnabled: ime } = useAuthStore.getState()
    return buildBlocks(tFn).filter(b => {
      if (b.moduleId === 'sistema') return cv(b.permission)
      return ime(b.moduleId) && cv(b.permission)
    })
  }

  useEffect(() => {
    const startSelector = (availableBlocks, initialIds) => {
      driverRef.current?.destroy()
      const { t: tFn } = useI18nStore.getState()

      const selectedIds = new Set(initialIds ?? availableBlocks.map(b => b.id))

      const renderBlockList = (container) => {
        container.innerHTML = ''
        availableBlocks.forEach(block => {
          const checked = selectedIds.has(block.id)
          const item = document.createElement('div')
          item.className = `driver-tour-block-item${checked ? ' checked' : ''}`
          item.innerHTML = `<span class="driver-tour-block-check">${checked ? '✓' : ''}</span><span>${tFn(block.labelKey)}</span>`
          item.addEventListener('click', () => {
            if (selectedIds.has(block.id)) selectedIds.delete(block.id)
            else selectedIds.add(block.id)
            renderBlockList(container)
            if (toggleBtn) {
              toggleBtn.textContent = selectedIds.size === availableBlocks.length
                ? tFn('tour.selection.deselectAll')
                : tFn('tour.selection.selectAll')
            }
          })
          container.appendChild(item)
        })
      }

      let toggleBtn = null

      const inst = driver({
        animate: true,
        smoothScroll: true,
        allowClose: true,
        overlayOpacity: 0.72,
        stagePadding: 8,
        stageRadius: 8,
        steps: [{
          popover: {
            title: tFn('tour.selection.title'),
            description: tFn('tour.selection.desc'),
            side: 'over',
            align: 'center',
          },
        }],
        onPopoverRender: (popover) => {
          if (popover.nextButton) popover.nextButton.textContent = tFn('tour.selection.start')
          if (popover.previousButton) popover.previousButton.style.display = 'none'

          // Language switcher
          const { locale, setLocale } = useI18nStore.getState()
          const langWrap = document.createElement('div')
          langWrap.className = 'driver-tour-lang-wrap'
          langWrap.innerHTML = `
            <span>语言 / Idioma:</span>
            <select class="driver-tour-lang-select">
              ${Object.entries(LANG_LABELS).map(([code, label]) =>
                `<option value="${code}"${locale === code ? ' selected' : ''}>${label}</option>`
              ).join('')}
            </select>
          `
          langWrap.querySelector('select').addEventListener('change', (e) => {
            setLocale(e.target.value)
            inst.destroy()
            const ids = Array.from(selectedIds)
            setTimeout(() => startSelectorRef.current?.(availableBlocks, ids), 50)
          })
          popover.description.appendChild(langWrap)

          // Block list
          const blocksContainer = document.createElement('div')
          blocksContainer.className = 'driver-tour-blocks'
          popover.description.appendChild(blocksContainer)
          renderBlockList(blocksContainer)

          // Select-all toggle
          toggleBtn = document.createElement('button')
          toggleBtn.className = 'driver-tour-select-toggle'
          toggleBtn.textContent = tFn('tour.selection.deselectAll')
          toggleBtn.addEventListener('click', () => {
            if (selectedIds.size === availableBlocks.length) selectedIds.clear()
            else availableBlocks.forEach(b => selectedIds.add(b.id))
            renderBlockList(blocksContainer)
            toggleBtn.textContent = selectedIds.size === availableBlocks.length
              ? tFn('tour.selection.deselectAll')
              : tFn('tour.selection.selectAll')
          })
          popover.description.appendChild(toggleBtn)

          // Skip button
          const skipBtn = document.createElement('button')
          skipBtn.textContent = tFn('tour.selection.skip')
          skipBtn.className = 'driver-tour-dont-show-btn'
          skipBtn.addEventListener('click', () => inst.destroy())
          popover.description.appendChild(skipBtn)
        },
        onNextClick: () => {
          const ids = Array.from(selectedIds)
          inst.destroy()
          if (ids.length > 0) startTourRef.current?.(ids)
        },
        onCloseClick: () => inst.destroy(),
        onDestroyed: () => setActive(false),
      })

      driverRef.current = inst
      inst.drive()
    }

    const startTour = (blockIds) => {
      driverRef.current?.destroy()
      const { t: tFn } = useI18nStore.getState()
      const { markTourComplete: mtc } = useAuthStore.getState()
      setActive(true)

      const available = getAvailableBlocks()
      const blocks = buildBlocks(tFn).filter(b => blockIds.includes(b.id) && available.some(a => a.id === b.id))

      const flatSteps = []
      const blockBoundaries = []
      blocks.forEach((block, blockIdx) => {
        blockBoundaries.push(flatSteps.length)
        block.steps.forEach(step => flatSteps.push({ ...step, blockIdx, blockId: block.id }))
      })

      // Finish step
      flatSteps.push({
        popover: { title: tFn('tour.finish.title'), description: tFn('tour.finish.description'), side: 'over', align: 'center' },
        path: null, groupToExpand: null, navHighlight: null, blockIdx: -1, blockId: null,
      })

      const finishTour = () => {
        mtc()
        driverRef.current?.destroy()
      }

      const navigateAndExpand = (step, callback) => {
        if (step.groupToExpand) expandGroup(step.groupToExpand, true)
        const delay = step.groupToExpand ? 380 : 0
        const path = step.path
        if (!path) {
          return delay ? setTimeout(callback, delay) : callback()
        }
        const cur = window.location.pathname.toLowerCase()
        const target = path.toLowerCase()
        if (cur === target || cur.startsWith(target + '/') || cur.startsWith(target + '?')) {
          return delay ? setTimeout(callback, delay) : callback()
        }
        navigateRef.current(path)
        setTimeout(callback, Math.max(delay, 680))
      }

      const driverSteps = flatSteps.map(step => {
        const s = { popover: step.popover }
        if (step.element) s.element = step.element
        return s
      })

      const inst = driver({
        animate: true,
        smoothScroll: true,
        allowClose: true,
        overlayOpacity: 0.72,
        stagePadding: 8,
        stageRadius: 8,
        showProgress: true,
        progressText: tFn('tour.step_of'),
        steps: driverSteps,
        onPopoverRender: (popover, { state }) => {
          const idx = state.activeIndex ?? 0
          if (popover.nextButton) popover.nextButton.textContent = tFn('tour.next')
          if (popover.previousButton) popover.previousButton.textContent = tFn('tour.prev')
          if (idx === flatSteps.length - 1 && popover.nextButton) {
            popover.nextButton.textContent = tFn('tour.finish.button')
          }

          // Don't-show-again on finish step
          if (idx === flatSteps.length - 1) {
            const dontShow = document.createElement('button')
            dontShow.textContent = tFn('tour.dontShowAgain')
            dontShow.className = 'driver-tour-dont-show-btn'
            dontShow.addEventListener('click', () => finishTour())
            popover.description.appendChild(dontShow)
          }

          // Skip-this-module on non-finish steps that have a next block
          const step = flatSteps[idx]
          if (step && step.blockIdx >= 0) {
            const nextBlockStart = blockBoundaries[step.blockIdx + 1]
            if (nextBlockStart !== undefined) {
              const skipBtn = document.createElement('button')
              skipBtn.textContent = tFn('tour.skipModule')
              skipBtn.className = 'driver-tour-skip-module-btn'
              skipBtn.addEventListener('click', () => {
                const nextStep = flatSteps[nextBlockStart]
                setHighlightedItem(nextStep.navHighlight ?? null)
                navigateAndExpand(nextStep, () => inst.moveTo(nextBlockStart))
              })
              popover.description.appendChild(skipBtn)
            }
          }
        },
        onNextClick: () => {
          const cur = inst.getActiveIndex() ?? 0
          const nextIdx = cur + 1
          if (nextIdx >= flatSteps.length) { finishTour(); return }
          const nextStep = flatSteps[nextIdx]
          setHighlightedItem(nextStep.navHighlight ?? null)
          navigateAndExpand(nextStep, () => inst.moveNext())
        },
        onPrevClick: () => {
          const cur = inst.getActiveIndex() ?? 1
          const prevIdx = cur - 1
          if (prevIdx < 0) return
          const prevStep = flatSteps[prevIdx]
          setHighlightedItem(prevStep.navHighlight ?? null)
          navigateAndExpand(prevStep, () => inst.movePrevious())
        },
        onHighlightStarted: () => {
          const idx = inst.getActiveIndex() ?? 0
          setHighlightedItem(flatSteps[idx]?.navHighlight ?? null)
        },
        onCloseClick: () => finishTour(),
        onDestroyed: () => {
          mtc()
          setActive(false)
          setHighlightedItem(null)
        },
      })

      driverRef.current = inst
      const firstStep = flatSteps[0]
      navigateAndExpand(firstStep, () => inst.drive())
    }

    startSelectorRef.current = startSelector
    startTourRef.current = startTour
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setActive, setHighlightedItem, expandGroup])

  // Auto-start on first login
  useEffect(() => {
    if (!user?.id) return
    if (user.tour_completado) return
    const blocks = getAvailableBlocks()
    if (blocks.length === 0) return
    const timer = setTimeout(() => startSelectorRef.current?.(blocks, null), 900)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // Manual trigger from help button
  const prevTrigger = useRef(0)
  useEffect(() => {
    if (triggerCount === 0) return
    if (triggerCount === prevTrigger.current) return
    prevTrigger.current = triggerCount
    const blocks = getAvailableBlocks()
    if (blocks.length === 0) return
    startSelectorRef.current?.(blocks, null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerCount])

  useEffect(() => {
    return () => {
      driverRef.current?.destroy()
      setActive(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
