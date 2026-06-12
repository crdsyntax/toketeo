import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { getApiUrl } from '@/lib/api'

interface MysqlUnavailablePayload {
  message: string
  checkedPorts: number[]
}

export function useSystemStatus() {
  const [mysqlError, setMysqlError] = useState<MysqlUnavailablePayload | null>(null)

  useEffect(() => {
    // The namespace is '/system' based on the gateway
    const socket = io(getApiUrl('/system'))

    socket.on('connect', () => {
      console.log('Connected to system status socket')
    })

    socket.on('system:mysql-unavailable', (payload: MysqlUnavailablePayload) => {
      setMysqlError(payload)
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  return { mysqlError, clearMysqlError: () => setMysqlError(null) }
}
