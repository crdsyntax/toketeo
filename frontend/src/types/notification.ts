export type NotificationType = 'success' | 'error' | 'info' | 'warning'

export interface AppNotification {
  id: string
  type: NotificationType
  message: string
  title?: string
  timestamp: number
  read: boolean
}

export interface NotificationState {
  notifications: AppNotification[]
  unreadCount: number
  add: (type: NotificationType, message: string, title?: string) => void
  markAllRead: () => void
  markRead: (id: string) => void
  remove: (id: string) => void
  clear: () => void
}
