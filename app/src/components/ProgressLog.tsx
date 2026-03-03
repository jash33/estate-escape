import { useEffect, useRef } from 'react'

interface ProgressLogProps {
  logs: string[]
  isRunning: boolean
}

export default function ProgressLog({ logs, isRunning }: ProgressLogProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs])

  const getLogColor = (log: string): string => {
    if (log.includes('Error') || log.includes('error') || log.includes('[stderr]')) {
      return 'text-red-400'
    }
    if (log.includes('Found') || log.includes('Loaded') || log.includes('✓') || log.includes('Complete')) {
      return 'text-green-400'
    }
    if (log.includes('Scanning') || log.includes('Processing') || log.includes('Starting')) {
      return 'text-yellow-400'
    }
    if (log.includes('%') || log.includes('records')) {
      return 'text-cyan-400'
    }
    return 'text-gray-300'
  }

  return (
    <div className="island-shell overflow-hidden rounded-2xl bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-700 bg-gray-800 px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-medium text-gray-200">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Progress Log
        </h3>
        {isRunning && (
          <span className="flex items-center text-xs text-green-400">
            <span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-green-400" />
            Running
          </span>
        )}
      </div>
      <div
        ref={containerRef}
        className="h-64 space-y-1 overflow-y-auto p-4 font-mono text-sm text-gray-300"
      >
        {logs.map((log, i) => (
          <div key={i} className="flex">
            <span className="mr-3 select-none text-gray-500">
              {String(i + 1).padStart(3, ' ')}
            </span>
            <span className={getLogColor(log)}>{log}</span>
          </div>
        ))}
        {isRunning && logs.length === 0 && (
          <div className="animate-pulse text-gray-500">Initializing...</div>
        )}
      </div>
    </div>
  )
}
