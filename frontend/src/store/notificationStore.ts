import { create } from 'zustand'
import { tauriApi } from '@/lib/api'

export type NotificationType = 'success' | 'error' | 'info' | 'warning'

export interface AppNotification {
  id: string
  type: NotificationType
  message: string
  title?: string
  timestamp: number
  read: boolean
}

interface NotificationState {
  notifications: AppNotification[]
  unreadCount: number
  add: (type: NotificationType, message: string, title?: string) => void
  markAllRead: () => void
  markRead: (id: string) => void
  remove: (id: string) => void
  clear: () => void
}

const MAX_NOTIFICATIONS = 100

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  unreadCount: 0,

  add: (type, message, title) => {
    const notification: AppNotification = {
      id: crypto.randomUUID(),
      type,
      message,
      title,
      timestamp: Date.now(),
      read: false,
    }
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, MAX_NOTIFICATIONS),
      unreadCount: state.unreadCount + 1,
    }))

    if (type === 'error') {
      tauriApi
        .invoke<[string, boolean]>('assistant_record_error', {
          error: message,
          context: title ?? null,
        })
        .catch(() => undefined)
    }

    if (get().unreadCount > get().notifications.length) {
      set({ unreadCount: get().notifications.filter((n) => !n.read).length })
    }
  },

  markAllRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }))
  },

  markRead: (id) => {
    set((state) => {
      const target = state.notifications.find((n) => n.id === id)
      if (!target || target.read) return state
      return {
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }
    })
  },

  remove: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
      unreadCount: state.notifications.filter((n) => n.id !== id && !n.read).length,
    }))
  },

  clear: () => {
    set({ notifications: [], unreadCount: 0 })
  },
}))
