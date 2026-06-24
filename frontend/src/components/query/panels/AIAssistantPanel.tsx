import { Sparkles } from 'lucide-react'

export function AIAssistantPanel() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-4">
        <Sparkles className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">AI Assistant</h3>
      <p className="text-sm max-w-xs">
        Natural language to SQL, query explanations, and smart suggestions will appear here.
      </p>
      <div className="mt-6 flex flex-col gap-2 w-full max-w-sm">
        <div className="h-10 rounded-lg bg-muted/50 border border-border flex items-center px-3 text-xs">
          <span className="opacity-40">Ask anything about your data...</span>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 h-20 rounded-lg bg-muted/30 border border-border p-3 text-[10px] leading-relaxed opacity-40">
            <p className="font-medium mb-1">Example prompts:</p>
            <p>"Show top 5 customers by revenue"</p>
            <p>"Which products are out of stock?"</p>
            <p>"Explain this query"</p>
          </div>
        </div>
      </div>
    </div>
  )
}
