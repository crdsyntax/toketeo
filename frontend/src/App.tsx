import { Routes, Route } from 'react-router-dom'
import MainLayout from '@/layouts/MainLayout'
import Connections from '@/pages/Connections'
import Explorer from '@/pages/Explorer'
import QueryEditor from '@/pages/QueryEditor'

function App() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Connections />} />
        <Route path="explorer" element={<Explorer />} />
        <Route path="query" element={<QueryEditor />} />
        <Route path="audit" element={<div className="p-4">Audit Log Placeholder</div>} />
        <Route path="settings" element={<div className="p-4">Settings Placeholder</div>} />
      </Route>
    </Routes>
  )
}

export default App
