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

    const scrollEl = document.querySelector('main')
    if (!scrollEl) return

    function handleScroll() {
      if (window.innerWidth >= 640) return
      const st = scrollEl.scrollTop
      if (st > COLLAPSE_AT && expandedRef.current) {
        setFiltersExpanded(false)
      } else if (st <= EXPAND_AT && !expandedRef.current) {
        setFiltersExpanded(true)
      }
    }

    scrollEl.addEventListener('scroll', handleScroll, { passive: true })
    return () => scrollEl.removeEventListener('scroll', handleScroll)
  }, [])

  return [filtersExpanded, setFiltersExpanded]
}
