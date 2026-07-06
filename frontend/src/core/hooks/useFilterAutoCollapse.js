import { useState, useEffect, useRef } from 'react'

// Detect passive event listener support (Chrome 49+, Safari 10+).
// Older Android WebViews may not support the options object at all.
let passiveSupported = false
try {
  const opts = Object.defineProperty({}, 'passive', {
    get() { passiveSupported = true; return false },
  })
  window.addEventListener('test', null, opts)
  window.removeEventListener('test', null, opts)
} catch (_) {
  passiveSupported = false
}

// Shared options objects so addEventListener / removeEventListener use identical references.
const ADD_OPTS = passiveSupported ? { capture: true, passive: true } : true
const REM_OPTS = passiveSupported ? { capture: true } : true

export function useFilterAutoCollapse(initialExpanded = true) {
  const [filtersExpanded, setFiltersExpanded] = useState(initialExpanded)
  const expandedRef = useRef(filtersExpanded)

  useEffect(() => {
    expandedRef.current = filtersExpanded
  }, [filtersExpanded])

  useEffect(() => {
    const COLLAPSE_AT = 60
    const EXPAND_AT = 20
    // Use a hard minimum in case innerHeight is 0 at mount (some Android WebViews).
    const MIN_CONTAINER_PX = 200

    function handleScroll(e) {
      if (window.innerWidth >= 640) return
      const target = e.target
      if (!(target instanceof Element)) return
      const minH = Math.max(window.innerHeight * 0.4, MIN_CONTAINER_PX)
      if (target.clientHeight < minH) return

      const st = target.scrollTop
      if (st > COLLAPSE_AT && expandedRef.current) {
        setFiltersExpanded(false)
      } else if (st <= EXPAND_AT && !expandedRef.current) {
        setFiltersExpanded(true)
      }
    }

    document.addEventListener('scroll', handleScroll, ADD_OPTS)
    return () => document.removeEventListener('scroll', handleScroll, REM_OPTS)
  }, [])

  return [filtersExpanded, setFiltersExpanded]
}
