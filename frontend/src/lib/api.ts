import axios from 'axios'
import { useAppStore } from '@/store/useAppStore'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request Interceptor: Add Authorization Header
apiClient.interceptors.request.use((config) => {
  const { accessToken } = useAppStore.getState()
  if (accessToken && config.headers && !config.url?.includes('/auth/login')) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

// Response Interceptor: Handle Token Refresh & Errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const { setAccessToken } = useAppStore.getState()

    // Handle 401 Unauthorized (Avoid infinite loop on login)
    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url?.includes('/auth/login')) {
      originalRequest._retry = true

      try {
        const response = await axios.post(`${API_URL}/auth/login`, { username: 'root' })
        const { access_token } = response.data
        
        setAccessToken(access_token)
        originalRequest.headers.Authorization = `Bearer ${access_token}`
        
        return apiClient(originalRequest)
      } catch (refreshError) {
        setAccessToken(null)
        return Promise.reject(refreshError)
      }
    }

    const message = error.response?.data?.message || error.message || 'API Error'
    return Promise.reject(new Error(message))
  }
)

export function getApiUrl(path: string): string {
  return `${API_URL}${path}`
}
