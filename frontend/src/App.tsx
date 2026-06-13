import { Routes, Route } from 'react-router-dom'
import MainLayout from '@/layouts/MainLayout'
import Connections from '@/pages/Connections'
import Explorer from '@/pages/Explorer'
import QueryEditor from '@/pages/QueryEditor'
import LogViewer from '@/pages/LogViewer'
import AuditLog from '@/pages/AuditLog'
import { AuthProvider } from '@/components/layout/AuthProvider'

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Connections />} />
          <Route path="explorer" element={<Explorer />} />
          <Route path="query" element={<QueryEditor />} />
          <Route path="logs" element={<LogViewer />} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="settings" element={<div className="p-4">Settings Placeholder</div>} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}


export default App
