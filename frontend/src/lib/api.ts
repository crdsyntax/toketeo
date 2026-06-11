import { useAppStore } from '@/store/useAppStore'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

let isRefreshing = false
let refreshSubscribers: ((token: string) => void)[] = []

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb)
}

function onTokenRefreshed(token: string) {
  refreshSubscribers.map((cb) => cb(token))
  refreshSubscribers = []
}

async function performAutoLogin(): Promise<string> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'root' }),
  })

  if (!response.ok) {
    throw new Error('Auto-login failed')
  }

  const { access_token } = await response.json()
  return access_token
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const { accessToken, setAccessToken } = useAppStore.getState()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options?.headers as Record<string, string>) || {}),
  }

  if (accessToken && !path.includes('/auth/login')) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  })

  // Interceptor: Handle 401 Unauthorized
  if (response.status === 401 && !path.includes('/auth/login')) {
    if (!isRefreshing) {
      isRefreshing = true
      try {
        const newToken = await performAutoLogin()
        setAccessToken(newToken)
        isRefreshing = false
        onTokenRefreshed(newToken)
      } catch (error) {
        isRefreshing = false
        setAccessToken(null)
        throw error
      }
    }

    // Wait for the new token and retry the original request
    return new Promise((resolve) => {
      subscribeTokenRefresh(async (token) => {
        headers['Authorization'] = `Bearer ${token}`
        resolve(apiFetch<T>(path, { ...options, headers }))
      })
    })
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'API Error')
  }

  if (response.status === 204) {
    return {} as T
  }

  return response.json()
}
