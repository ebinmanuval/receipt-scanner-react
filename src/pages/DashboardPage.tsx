import { useAuth } from '@/auth/AuthProvider'
import { Card } from '@/components/ui/Card'

export function DashboardPage() {
  const { user } = useAuth()
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
      <Card>
        <p className="text-sm text-slate-600">
          Signed in as <span className="font-medium text-slate-900">{user?.username}</span>.
        </p>
        <p className="text-sm text-slate-600">
          <br /><br />
          An AI-powered expense management application that scans receipts and extracts
          merchant details, transaction dates, line items, quantities, and prices using
          a locally hosted LLM. Users can review and approve extracted data before it is
          saved to the database.
          <br /><br />
          <strong>Technology Stack:</strong> ASP.NET Core Web API (C# / .NET), React
          with TypeScript, Python-based local LLM, and a self-hosted home server
          accessible through Cloudflare Tunnel.
          <br /><br />
          <strong>Planned Features:</strong> OFX bank statement importing, automated
          transaction reconciliation, spending analytics, financial insights,
          multi-tenancy, and a cross-platform mobile application using React Native.
          <br /><br />
          <strong>Current Status:</strong> Receipt extraction is functional. Processing
          speed is currently limited by CPU-only LLM inference and available server
          memory.
        </p>
        <p className="text-sm text-slate-600 ">
          <a href="https://github.com/ebinmanuval/receipt-scanner-api.git" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline mr-2">
            API Repository
          </a>
          <a href="https://github.com/ebinmanuval/receipt-scanner-react.git" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline mr-2">
            React Repository
          </a>
        </p>
      </Card>
    </div>
  )
}
