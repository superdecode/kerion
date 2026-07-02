import { useState, useEffect } from 'react'
import SearchBar from '../common/SearchBar'
import { useI18nStore } from '../../stores/i18nStore'
import {
  Search, X
} from 'lucide-react'
import UserMenu from './UserMenu'

export default function Header({ title, subtitle, actions, showSearch = false, quickSearch = null }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const { t } = useI18nStore()

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') setSearchOpen(false) }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [])

  return (
    <>
      <header className="chrome-shell h-16 bg-white/60 backdrop-blur-2xl border-b border-warm-100/40 px-6 flex items-center gap-3 shrink-0 sticky top-0 z-[110]">
        {/* Title */}
        <div className="surface-enter-fast flex-1 min-w-0">
          {title && (
            <div>
              <h1 className="text-lg font-bold text-warm-800 truncate">{title}</h1>
              {subtitle && <p className="text-[11px] text-warm-400 truncate font-medium">{subtitle}</p>}
            </div>
          )}
        </div>

        {/* Actions from page */}
        {actions && (
          <div className="surface-enter-soft flex items-center gap-2">
            {actions}
          </div>
        )}

        {quickSearch && (
          <div className="surface-enter-soft flex items-center">
            {quickSearch}
          </div>
        )}

        {/* Collapsible search - only shown on tarimas/escaneo */}
        {showSearch && (
          <div className="relative">
            {searchOpen ? (
              <div className="flex items-center gap-2 animate-scale-in">
                <SearchBar />
                <button
                  onClick={() => setSearchOpen(false)}
                  className="p-2 rounded-xl text-warm-400 hover:text-warm-600 hover:bg-warm-100 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                className="interactive-lift inline-flex h-9 w-9 items-center justify-center rounded-xl border border-warm-200 text-warm-400 hover:text-primary-600 hover:bg-primary-50"
                title={t('common.search')}
              >
                <Search className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* User menu */}
        <UserMenu />
      </header>
    </>
  )
}
