import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export interface UpdateInfo {
  currentVersion: string
  version: string
  date?: string
  body?: string
}

export interface DownloadProgress {
  downloadedBytes: number
  totalBytes?: number
}

const REMINDER_HOURS = 1
export const REMINDER_MS = REMINDER_HOURS * 60 * 60 * 1000

export interface DismissedRecord {
  version: string
  at: number
}

const DISMISS_KEY = 'toketeo.update.dismissed'

export function loadDismissed(): DismissedRecord | null {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DismissedRecord
    if (typeof parsed.version !== 'string' || typeof parsed.at !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

export function saveDismissed(record: DismissedRecord): void {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(record))
  } catch {
    // ignore storage failures (private mode, etc.)
  }
}

function isEnabled(): boolean {
  return !import.meta.env.DEV
}

function toInfo(update: Update): UpdateInfo {
  return {
    currentVersion: update.currentVersion,
    version: update.version,
    date: update.date,
    body: update.body,
  }
}

export const updateService = {
  checkForUpdate: async (): Promise<UpdateInfo | null> => {
    if (!isEnabled()) return null
    const update = await check()
    return update ? toInfo(update) : null
  },

  downloadAndInstall: async (onProgress?: (p: DownloadProgress) => void): Promise<void> => {
    const update = await check()
    if (!update) throw new Error('No update available')
    let downloadedBytes = 0
    let totalBytes: number | undefined
    await update.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        totalBytes = event.data.contentLength
      } else if (event.event === 'Progress') {
        downloadedBytes += event.data.chunkLength
        onProgress?.({ downloadedBytes, totalBytes })
      }
    })
  },

  relaunchApp: async (): Promise<void> => {
    await relaunch()
  },
}
