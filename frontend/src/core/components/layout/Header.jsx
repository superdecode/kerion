import { useState, useEffect } from 'react'
import SearchBar from '../common/SearchBar'
import { useI18nStore } from '../../stores/i18nStore'
import { useNavStore } from '../../stores/navStore'
import { Search, X, Menu } from 'lucide-react'
import UserMenu from './UserMenu'

export default function Header({ title, subtitle, actions, showSearch = false, quickSearch = null, hideUserOnMobile = false }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const { t } = useI18nStore()
  const { toggleNav } = useNavStore()

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') setSearchOpen(false) }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [])

  return (
    <header className="chrome-shell h-14 md:h-16 bg-white/80 backdrop-blur-xl border-b border-warm-100/60 px-3 md:px-6 flex items-center gap-2 md:gap-3 shrink-0 sticky top-0 z-[110]">
      {/* Burger button — mobile only */}
      <button
        onClick={toggleNav}
        className="md:hidden flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-warm-500 hover:text-warm-700 hover:bg-warm-100 transition-colors active:scale-95"
        aria-label={t('common.openMenu')}
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Title */}
      <div className="surface-enter-fast flex-1 min-w-0">
        {title && (
          <div>
            <h1 className="text-base md:text-lg font-bold text-warm-800 truncate leading-tight">{title}</h1>
            {subtitle && <p className="text-[10px] md:text-[11px] text-warm-400 truncate font-medium hidden sm:block">{subtitle}</p>}
          </div>
        )}
      </div>

      {/* Actions from page */}
      {actions && (
        <div className="surface-enter-soft flex items-center gap-1.5 md:gap-2">
          {actions}
        </div>
      )}

      {quickSearch && (
        <div className="surface-enter-soft flex items-center">
          {quickSearch}
        </div>
      )}

      {/* Collapsible search */}
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
      <div className={hideUserOnMobile ? 'hidden md:block' : undefined}>
        <UserMenu />
      </div>
    </header>
  )
}
