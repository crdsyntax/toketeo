import toast from 'react-hot-toast'
import { useNotificationStore, type NotificationType } from '@/store/notificationStore'
import { useAppStore } from '@/store/useAppStore'

/**
 * Registers every user-facing toast (react-hot-toast) and mini-toast into the
 * notification store so they are also listed from the bell icon in the header.
 * Call once at app startup, before rendering.
 */
export function initToastInterceptor() {
  const wrap = (original: typeof toast.success, type: NotificationType) => {
    return ((message: Parameters<typeof toast.success>[0], options?: Parameters<typeof toast.success>[1]) => {
      if (typeof message === 'string' && message.trim()) {
        useNotificationStore.getState().add(type, message)
      }
      return original(message, options)
    }) as typeof toast.success
  }

  toast.success = wrap(toast.success, 'success')
  toast.error = wrap(toast.error, 'error')
  toast.custom = ((render: Parameters<typeof toast.custom>[0], options?: Parameters<typeof toast.custom>[1]) => {
    // Custom toasts (e.g. gamification) are hard to read generically — keep
    // them out of the list, they still render on screen.
    return toast.custom(render, options)
  }) as typeof toast.custom

  // Mini-toasts (connection/sync feedback) also land in the bell list.
  const setMiniToast = useAppStore.getState().setMiniToast
  useAppStore.setState({
    setMiniToast: (id, payload) => {
      useNotificationStore.getState().add(
        payload.type === 'success' ? 'success' : 'error',
        payload.text,
        'Connections',
      )
      setMiniToast(id, payload)
    },
  })
}
