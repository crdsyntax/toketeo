import { Routes, Route } from 'react-router-dom'
import MainLayout from '@/layouts/MainLayout'
import Connections from '@/pages/Connections'
import Explorer from '@/pages/Explorer'
import QueryEditor from '@/pages/QueryEditor'
import AuditLog from '@/pages/AuditLog'
import { DiagramPage } from '@/diagram'
import { SettingsPage } from '@/pages/SettingsPage'
import { SchedulerPage } from '@/pages/SchedulerPage'
import { CrossDbSyncPage } from '@/pages/CrossDbSyncPage'
import { ThemeProvider } from '@/components/gamification/ThemeProvider'
import { AppBootstrap } from '@/components/layout/AppBootstrap'
import { Toaster } from 'react-hot-toast'

function App() {
  return (
    <AppBootstrap>
      <ThemeProvider>
        <Toaster position="bottom-right" />
        <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Connections />} />
          <Route path="explorer" element={<Explorer />} />
          <Route path="diagram" element={<DiagramPage />} />
          <Route path="query" element={<QueryEditor />} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="scheduler" element={<SchedulerPage />} />
          <Route path="cross-db-sync" element={<CrossDbSyncPage />} />
        </Route>
      </Routes>
      </ThemeProvider>
    </AppBootstrap>
  )
}

export default App
