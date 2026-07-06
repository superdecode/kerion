import { useState, useEffect, useRef } from 'react'

export function useFilterAutoCollapse(initialExpanded = true) {
  const [filtersExpanded, setFiltersExpanded] = useState(initialExpanded)
  const expandedRef = useRef(filtersExpanded)

  useEffect(() => {
    expandedRef.current = filtersExpanded
  }, [filtersExpanded])

  useEffect(() => {
    const COLLAPSE_AT = 60
    const EXPAND_AT = 20

    // Capture-phase listener catches scroll on ANY element, not just document.
    // We filter to large containers (not dropdowns/modals) by requiring height > 40% viewport.
    function handleScroll(e) {
      if (window.innerWidth >= 640) return
      const target = e.target
      if (!(target instanceof Element)) return
      if (target.clientHeight < window.innerHeight * 0.4) return

      const st = target.scrollTop
      if (st > COLLAPSE_AT && expandedRef.current) {
        setFiltersExpanded(false)
      } else if (st <= EXPAND_AT && !expandedRef.current) {
        setFiltersExpanded(true)
      }
    }

    document.addEventListener('scroll', handleScroll, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', handleScroll, { capture: true })
  }, [])

  return [filtersExpanded, setFiltersExpanded]
}
