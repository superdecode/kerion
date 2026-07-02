import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Toast from '../common/Toast'
import ConnectionBanner from '../common/ConnectionBanner'
import SubscriptionGuard from '../common/SubscriptionGuard'
import OnboardingTour from './OnboardingTour'
import WelcomeModal, { AutoTourLauncher } from './WelcomeModal'
import BugReportButton from '../common/BugReportButton'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { usePermissionSync } from '../../hooks/usePermissionSync'
import { useNavStore } from '../../stores/navStore'

export default function MainLayout() {
  useOnlineStatus()
  usePermissionSync()

  const { mobileOpen, closeNav } = useNavStore()

  return (
    <div className="flex h-screen overflow-hidden bg-warm-50 bg-gradient-mesh">
      {/* Mobile overlay backdrop — starts below header (top-14) so header stays interactive */}
      {mobileOpen && (
        <div
          className="fixed top-14 inset-x-0 bottom-0 z-[499] bg-black/60 md:hidden"
          onClick={closeNav}
          aria-hidden="true"
        />
      )}

      <Sidebar />

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <ConnectionBanner />
        <SubscriptionGuard>
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </SubscriptionGuard>
      </div>
      <Toast />
      <OnboardingTour />
      <WelcomeModal />
      <AutoTourLauncher />
      <BugReportButton />
    </div>
  )
}
