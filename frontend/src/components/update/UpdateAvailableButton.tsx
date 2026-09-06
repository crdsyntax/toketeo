import { Download } from 'lucide-react'
import { useUpdateStore } from '@/store/updateStore'

export function UpdateAvailableButton() {
  const update = useUpdateStore((s) => s.update)
  const downloading = useUpdateStore((s) => s.downloading)
  const openModal = useUpdateStore((s) => s.openModal)

  if (!update || downloading) return null

  return (
    <button
      onClick={openModal}
      title={`Update to v${update.version} available`}
      className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all animate-in fade-in"
    >
      <span className="relative flex items-center justify-center">
        <Download className="w-4 h-4" />
        <span className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-accent animate-pulse" />
      </span>
      <span className="text-xs font-bold uppercase tracking-wider">Update</span>
    </button>
  )
}