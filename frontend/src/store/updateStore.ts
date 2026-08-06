import { create } from 'zustand'
import {
  updateService,
  loadDismissed,
  saveDismissed,
  REMINDER_MS,
  type UpdateInfo,
  type DownloadProgress,
} from '@/services/update.service'

interface UpdateState {
  update: UpdateInfo | null
  modalOpen: boolean
  checking: boolean
  downloading: boolean
  progress: DownloadProgress | null
  error: string | null
  checkNow: (force?: boolean) => Promise<void>
  dismiss: () => void
  installNow: () => Promise<void>
  clearError: () => void
}

export const useUpdateStore = create<UpdateState>()((set, get) => ({
  update: null,
  modalOpen: false,
  checking: false,
  downloading: false,
  progress: null,
  error: null,

  checkNow: async (force = false) => {
    const { checking, downloading } = get()
    if (checking || downloading) return

    set({ checking: true })
    try {
      const info = await updateService.checkForUpdate()
      if (!info) {
        set({ update: null, modalOpen: false, checking: false })
        return
      }

      const dismissed = loadDismissed()
      const sameVersion = dismissed !== null && dismissed.version === info.version
      const withinReminder = sameVersion && Date.now() - dismissed.at < REMINDER_MS

      set({
        update: info,
        modalOpen: force || !withinReminder,
        checking: false,
      })
    } catch (e) {
      console.error('[update] check failed:', e)
      set({ checking: false })
    }
  },

  dismiss: () => {
    const { update } = get()
    if (update) {
      saveDismissed({ version: update.version, at: Date.now() })
    }
    set({ modalOpen: false })
  },

  installNow: async () => {
    const { downloading } = get()
    if (downloading) return

    set({ downloading: true, progress: null, error: null })
    try {
      await updateService.downloadAndInstall((progress) => {
        set({ progress })
      })
      await updateService.relaunchApp()
    } catch (e) {
      set({ downloading: false, error: String(e) })
    }
  },

  clearError: () => set({ error: null }),
}))
