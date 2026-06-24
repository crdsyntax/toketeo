import { useNavigate } from 'react-router-dom'
import { Plug, HelpCircle, ExternalLink, Server } from 'lucide-react'

const FAQS = [
  { q: 'How do I connect to a local database?', a: 'Use "localhost" or "127.0.0.1" as the host. Default ports: MySQL→3306, PostgreSQL→5432, MongoDB→27017, MSSQL→1433.' },
  { q: 'What is an SSH Tunnel?', a: 'An SSH tunnel encrypts the connection through a jump server. Useful when the database is not directly accessible. Configure it in the "SSH Tunnel" tab of the connection form.' },
  { q: 'Why is my connection failing?', a: 'Check: (1) Is the database service running? (2) Are host/port correct? (3) Is there a firewall? (4) Are credentials valid? Use the "Test" button to diagnose.' },
  { q: 'What does SSL do?', a: 'SSL encrypts data between Toketeo and your database. Required by many cloud providers (Supabase, Railway, etc.). Toggle it in the connection form.' },
  { q: 'Can I connect to multiple databases?', a: 'Yes! Create multiple connections from the Connections page. You can switch between them in the sidebar or query editor.' },
]

export function ConnectHelpPanel() {
  const navigate = useNavigate()

  return (
    <div className="h-full overflow-auto p-4 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
          <Plug className="w-4 h-4 text-primary" />
          Connection Help
        </h3>
        <p className="text-xs text-muted-foreground">Learn how to connect and troubleshoot databases.</p>
      </div>

      <button
        onClick={() => navigate('/')}
        className="w-full flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/15 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
          <Server className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold text-foreground">New Connection Wizard</p>
          <p className="text-[10px] text-muted-foreground">Step-by-step guided setup</p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      <section>
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-3">
          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
          Frequently Asked Questions
        </h4>
        <div className="space-y-2">
          {FAQS.map((faq, i) => (
            <details key={i} className="group rounded-lg border border-border bg-muted/20">
              <summary className="text-xs font-medium text-foreground px-3 py-2 cursor-pointer hover:bg-muted/40 rounded-lg transition-colors list-none flex items-center justify-between">
                {faq.q}
                <HelpCircle className="w-3 h-3 text-muted-foreground shrink-0 ml-2 group-open:rotate-180 transition-transform" />
              </summary>
              <p className="text-[11px] text-muted-foreground px-3 pb-2 leading-relaxed">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
