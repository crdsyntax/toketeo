import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAppStore } from '@/store/useAppStore'
import { getApiUrl } from '@/lib/api'

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { accessToken, setAccessToken } = useAppStore()
  const [isAuthenticating, setIsAuthenticating] = useState(!accessToken)

  useEffect(() => {
    const login = async () => {
      if (accessToken) {
        setIsAuthenticating(false)
        return
      }

      try {
        console.log('Authenticating automatically as root...')
        const response = await axios.post(getApiUrl('/auth/login'), { 
          username: 'root' 
        })
        const { access_token } = response.data
        setAccessToken(access_token)
        console.log('Authentication successful')
      } catch (error) {
        console.error('Auto-authentication failed:', error)
      } finally {
        setIsAuthenticating(false)
      }
    }

    login()
  }, [accessToken, setAccessToken])

  if (isAuthenticating) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-sm font-medium text-muted-foreground">Initializing session...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
