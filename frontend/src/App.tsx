import { Routes, Route } from 'react-router-dom'
import MainLayout from '@/layouts/MainLayout'
import Connections from '@/pages/Connections'
import Explorer from '@/pages/Explorer'
import QueryEditor from '@/pages/QueryEditor'
import AuditLog from '@/pages/AuditLog'
import { DiagramPage } from '@/diagram'
import { AppBootstrap } from '@/components/layout/AppBootstrap'
import { Toaster } from 'react-hot-toast'

function App() {
  return (
    <AppBootstrap>
      <Toaster position="bottom-right" />
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Connections />} />
          <Route path="explorer" element={<Explorer />} />
          <Route path="diagram" element={<DiagramPage />} />
          <Route path="query" element={<QueryEditor />} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="settings" element={<div className="p-4">Settings Placeholder</div>} />
        </Route>
      </Routes>
    </AppBootstrap>
  )
}

export default App
