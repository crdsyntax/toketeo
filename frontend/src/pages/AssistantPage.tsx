import { AssistantLayout } from '@/components/assistant/AssistantLayout'

export function AssistantPage() {
  return (
    <div className="h-full flex">
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
        <p className="text-sm">Select the <strong>Assistant</strong> tab to get started.</p>
      </div>
      <div className="w-80 border-l border-border">
        <AssistantLayout />
      </div>
    </div>
  )
}
