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

export interface DismissedRecord {
  version: string
  at: number
}
