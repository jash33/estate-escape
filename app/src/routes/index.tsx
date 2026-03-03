import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { getExistingLeads, type Lead } from '#/server/matcher'
import ProgressLog from '#/components/ProgressLog'
import LeadsTable from '#/components/LeadsTable'

export const Route = createFileRoute('/')({ component: App })

function App() {
  const [isRunning, setIsRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [error, setError] = useState<string | null>(null)
  const [daysBack, setDaysBack] = useState('7')

  // Load existing leads on mount
  useEffect(() => {
    getExistingLeads()
      .then((data) => {
        if (data.leads?.length > 0) {
          setLeads(data.leads)
          setLogs([`Loaded ${data.leads.length} existing leads from ${data.file}`])
        }
      })
      .catch(() => {
        // Ignore errors on initial load
      })
  }, [])

  const handleRun = useCallback(() => {
    setIsRunning(true)
    setLogs([])
    setError(null)
    setLeads([])

    const days = parseInt(daysBack, 10) || 7
    const eventSource = new EventSource(`/api/stream?days=${days}`)
    
    eventSource.addEventListener('log', (e) => {
      const data = JSON.parse(e.data)
      setLogs(prev => [...prev, data.message])
    })
    
    eventSource.addEventListener('result', (e) => {
      const data = JSON.parse(e.data)
      setLeads(data.leads)
    })
    
    eventSource.addEventListener('error', (e) => {
      if (e.data) {
        const data = JSON.parse(e.data)
        setError(data.message)
      }
    })
    
    eventSource.addEventListener('done', () => {
      eventSource.close()
      setIsRunning(false)
    })
    
    eventSource.onerror = () => {
      eventSource.close()
      setIsRunning(false)
      setError('Connection lost')
    }
  }, [daysBack])

  return (
    <main className="page-wrap px-4 pb-8 pt-8">
      {/* Hero Section */}
      <section className="island-shell rise-in relative mb-8 overflow-hidden rounded-[2rem] px-6 py-8 sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(79,184,178,0.32),transparent_66%)]" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(47,106,74,0.18),transparent_66%)]" />
        
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="display-title mb-2 text-3xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-4xl">
              🏠 Estate Escape
            </h1>
            <p className="text-[var(--sea-ink-soft)]">
              Probate Lead Generator for Harris County
            </p>
          </div>
          
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <label htmlFor="days" className="text-sm font-medium text-[var(--sea-ink)]">
                  Days to scan:
                </label>
                <input
                  type="number"
                  id="days"
                  min={1}
                  max={90}
                  value={daysBack}
                  onChange={(e) => setDaysBack(e.target.value)}
                  disabled={isRunning}
                  className="w-20 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[var(--lagoon)] focus:outline-none focus:ring-1 focus:ring-[var(--lagoon)] disabled:opacity-50"
                />
              </div>
              <span className="text-xs text-[var(--sea-ink-soft)]">Scan may take 1-2 minutes</span>
            </div>
            
            <button
              onClick={handleRun}
              disabled={isRunning}
              className={`inline-flex items-center rounded-full px-6 py-3 text-base font-semibold shadow-lg transition ${
                isRunning
                  ? 'cursor-not-allowed bg-gray-400 text-white'
                  : 'bg-[var(--lagoon)] text-white hover:-translate-y-0.5 hover:bg-[var(--lagoon-deep)]'
              }`}
            >
              {isRunning ? (
                <>
                  <svg className="-ml-1 mr-3 h-5 w-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Running...
                </>
              ) : (
                <>
                  <svg className="-ml-1 mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Run Lead Generator
                </>
              )}
            </button>
          </div>
        </div>

        {leads.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <div className="rounded-full bg-green-100 px-4 py-1.5 font-medium text-green-800">
              {leads.filter(l => l.match_count > 0).length} leads with properties
            </div>
            <div className="rounded-full bg-blue-100 px-4 py-1.5 font-medium text-blue-800">
              {leads.length} total cases
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-red-700">{error}</p>
          </div>
        )}
      </section>

      {/* Progress Log */}
      {(isRunning || logs.length > 0) && (
        <section className="mb-8">
          <ProgressLog logs={logs} isRunning={isRunning} />
        </section>
      )}

      {/* Results Table */}
      {leads.length > 0 && (
        <section>
          <LeadsTable leads={leads} />
        </section>
      )}

      {/* Empty State */}
      {!isRunning && leads.length === 0 && logs.length === 0 && (
        <section className="island-shell rounded-2xl p-8 text-center">
          <div className="mx-auto max-w-md">
            <div className="mb-4 text-6xl">🏠</div>
            <h2 className="mb-2 text-xl font-semibold text-[var(--sea-ink)]">
              Ready to Find Leads
            </h2>
            <p className="mb-6 text-[var(--sea-ink-soft)]">
              Click "Run Lead Generator" to scrape recent probate filings from Harris County 
              and match them against HCAD property records.
            </p>
            <div className="space-y-2 text-left text-sm text-[var(--sea-ink-soft)]">
              <p>✓ Scrapes probate court records</p>
              <p>✓ Matches decedents to property owners</p>
              <p>✓ Shows estimated property values</p>
              <p>✓ Filters and sorts results</p>
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
