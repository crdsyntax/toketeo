import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { connectionService } from './services/connection.service'
import { initToastInterceptor } from './lib/notifications'

initToastInterceptor()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
})

// Gracefully close all DB connections before window closes
getCurrentWindow().onCloseRequested(async () => {
  try {
    await connectionService.disconnectAll()
  } catch {
    // best-effort cleanup
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <App />
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>,
)
