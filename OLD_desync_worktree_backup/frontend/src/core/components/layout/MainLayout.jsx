import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Toast from '../common/Toast'
import ConnectionBanner from '../common/ConnectionBanner'
import SubscriptionGuard from '../common/SubscriptionGuard'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { usePermissionSync } from '../../hooks/usePermissionSync'

export default function MainLayout() {
  useOnlineStatus()
  usePermissionSync()

  return (
    <div className="flex h-screen overflow-hidden bg-warm-50 bg-gradient-mesh">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden ml-4">
        <ConnectionBanner />
        <SubscriptionGuard>
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </SubscriptionGuard>
      </div>
      <Toast />
    </div>
  )
}
