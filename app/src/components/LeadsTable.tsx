import { useState, useMemo } from 'react'
import type { Lead, Property } from '#/server/matcher'

interface LeadsTableProps {
  leads: Lead[]
}

type SortField = 'decedent_name' | 'file_date' | 'match_count' | 'best_match_score' | 'total_value'
type SortDir = 'asc' | 'desc'

function formatCurrency(value: number | null): string {
  if (value === null || value === 0) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function getTotalValue(properties: Property[]): number {
  return properties.reduce((sum, p) => sum + (p.market_value || 0), 0)
}

export default function LeadsTable({ leads }: LeadsTableProps) {
  const [sortField, setSortField] = useState<SortField>('best_match_score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)
  const pageSize = 20

  const filteredLeads = useMemo(() => {
    if (!searchQuery.trim()) return leads
    const q = searchQuery.toLowerCase()
    return leads.filter(l => 
      l.decedent_name.toLowerCase().includes(q) ||
      l.case_number.includes(q) ||
      l.case_type.toLowerCase().includes(q)
    )
  }, [leads, searchQuery])

  const sortedLeads = useMemo(() => {
    return [...filteredLeads].sort((a, b) => {
      let aVal: string | number
      let bVal: string | number
      
      switch (sortField) {
        case 'decedent_name':
          aVal = a.decedent_name
          bVal = b.decedent_name
          break
        case 'file_date':
          aVal = a.file_date
          bVal = b.file_date
          break
        case 'match_count':
          aVal = a.match_count
          bVal = b.match_count
          break
        case 'best_match_score':
          aVal = a.best_match_score
          bVal = b.best_match_score
          break
        case 'total_value':
          aVal = getTotalValue(a.properties)
          bVal = getTotalValue(b.properties)
          break
        default:
          return 0
      }
      
      if (typeof aVal === 'string') {
        return sortDir === 'asc' 
          ? aVal.localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal)
      }
      
      return sortDir === 'asc' ? aVal - (bVal as number) : (bVal as number) - aVal
    })
  }, [filteredLeads, sortField, sortDir])

  const paginatedLeads = useMemo(() => {
    const start = page * pageSize
    return sortedLeads.slice(start, start + pageSize)
  }, [sortedLeads, page])

  const totalPages = Math.ceil(sortedLeads.length / pageSize)

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const toggleExpand = (caseNumber: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(caseNumber)) {
      newExpanded.delete(caseNumber)
    } else {
      newExpanded.add(caseNumber)
    }
    setExpandedRows(newExpanded)
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return <span className="ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>
  }

  const leadsWithMatches = leads.filter(l => l.match_count > 0).length
  const totalValue = leads.reduce((sum, l) => sum + getTotalValue(l.properties), 0)

  return (
    <div className="island-shell overflow-hidden rounded-2xl">
      {/* Header */}
      <div className="border-b border-[var(--line)] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--sea-ink)]">Lead Results</h2>
            <div className="mt-1 flex items-center gap-4 text-sm text-[var(--sea-ink-soft)]">
              <span>{leadsWithMatches} leads with properties</span>
              <span>•</span>
              <span>Total estimated value: {formatCurrency(totalValue)}</span>
            </div>
          </div>
          
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0) }}
              placeholder="Search leads..."
              className="rounded-lg border border-[var(--line)] bg-white/50 py-2 pl-10 pr-4 text-sm focus:border-[var(--lagoon)] focus:outline-none focus:ring-1 focus:ring-[var(--lagoon)]"
            />
            <svg className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--line)]">
          <thead className="bg-[var(--chip-bg)]">
            <tr>
              <th className="w-10 px-4 py-3"></th>
              <th 
                className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
                onClick={() => handleSort('decedent_name')}
              >
                Decedent <SortIcon field="decedent_name" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Case #
              </th>
              <th 
                className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
                onClick={() => handleSort('file_date')}
              >
                Filed <SortIcon field="file_date" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Type
              </th>
              <th 
                className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
                onClick={() => handleSort('match_count')}
              >
                Properties <SortIcon field="match_count" />
              </th>
              <th 
                className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
                onClick={() => handleSort('total_value')}
              >
                Est. Value <SortIcon field="total_value" />
              </th>
              <th 
                className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
                onClick={() => handleSort('best_match_score')}
              >
                Match % <SortIcon field="best_match_score" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)] bg-white">
            {paginatedLeads.map((lead) => (
              <>
                <tr key={lead.case_number} className="hover:bg-[var(--chip-bg)]">
                  <td className="px-4 py-3">
                    {lead.properties.length > 0 && (
                      <button
                        onClick={() => toggleExpand(lead.case_number)}
                        className="rounded p-1 hover:bg-[var(--line)]"
                      >
                        {expandedRows.has(lead.case_number) ? '▼' : '▶'}
                      </button>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-[var(--sea-ink)]">
                    {lead.decedent_name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-[var(--sea-ink-soft)]">
                    {lead.case_number}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--sea-ink-soft)]">
                    {lead.file_date}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-xs text-[var(--sea-ink-soft)]">
                    {lead.case_type}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      lead.match_count > 0 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {lead.match_count}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`font-medium ${getTotalValue(lead.properties) > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      {formatCurrency(getTotalValue(lead.properties))}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 rounded-full bg-gray-200">
                        <div
                          className={`h-2 rounded-full ${
                            lead.best_match_score >= 95 ? 'bg-green-500' 
                            : lead.best_match_score >= 85 ? 'bg-yellow-500' 
                            : 'bg-gray-400'
                          }`}
                          style={{ width: `${lead.best_match_score}%` }}
                        />
                      </div>
                      <span className="text-sm text-[var(--sea-ink-soft)]">{lead.best_match_score}%</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                      lead.status === 'Open' ? 'bg-blue-100 text-blue-800' :
                      lead.status === 'Closed' ? 'bg-gray-100 text-gray-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {lead.status}
                    </span>
                  </td>
                </tr>
                {/* Expanded row with property details */}
                {expandedRows.has(lead.case_number) && lead.properties.length > 0 && (
                  <tr key={`${lead.case_number}-expanded`}>
                    <td colSpan={9} className="bg-[var(--chip-bg)] px-8 py-4">
                      <div className="text-sm">
                        <h4 className="mb-2 font-medium text-[var(--sea-ink)]">Matched Properties:</h4>
                        <div className="space-y-2">
                          {lead.properties.map((prop, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-white p-3"
                            >
                              <div>
                                <span className="font-medium text-[var(--sea-ink)]">{prop.owner_name}</span>
                                <span className="ml-2 text-[var(--sea-ink-soft)]">({prop.match_score}% match)</span>
                                <div className="text-[var(--sea-ink-soft)]">{prop.site_address}</div>
                              </div>
                              <div className="text-right">
                                <div className="font-medium text-green-600">
                                  {formatCurrency(prop.market_value)}
                                </div>
                                <div className="text-xs text-[var(--sea-ink-soft)]">
                                  Account: {prop.account_number}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-[var(--line)] px-6 py-4">
        <div className="text-sm text-[var(--sea-ink-soft)]">
          Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, sortedLeads.length)} of {sortedLeads.length} results
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[var(--chip-bg)]"
          >
            Previous
          </button>
          <span className="text-sm text-[var(--sea-ink-soft)]">
            Page {page + 1} of {totalPages || 1}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[var(--chip-bg)]"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
