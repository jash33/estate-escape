import { useState, useMemo } from 'react'
import type { Lead, Property } from '#/server/matcher'

interface LeadsTableProps {
  leads: Lead[]
}

type SortField = 'decedent_name' | 'file_date' | 'match_count' | 'best_match_score' | 'total_value'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

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

function parseDate(dateStr: string): number {
  // Parse MM/DD/YYYY to timestamp for proper sorting
  const [month, day, year] = dateStr.split('/')
  return new Date(`${year}-${month}-${day}`).getTime() || 0
}

export default function LeadsTable({ leads }: LeadsTableProps) {
  const [sortField, setSortField] = useState<SortField>('best_match_score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)

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
          aVal = parseDate(a.file_date)
          bVal = parseDate(b.file_date)
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
  }, [sortedLeads, page, pageSize])

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

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    setPage(0) // Reset to first page
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return <span className="ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>
  }

  const InfoIcon = ({ tooltip, position = 'center' }: { tooltip: string; position?: 'center' | 'left' }) => (
    <span className="group relative ml-1.5 inline-flex">
      <span className="inline-flex cursor-help rounded-full bg-[var(--lagoon)]/10 p-0.5 text-[var(--lagoon)] hover:bg-[var(--lagoon)]/20">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </span>
      <span className={`pointer-events-none absolute top-full z-50 mt-2 w-64 rounded-xl bg-gray-900 px-4 py-3 text-sm font-normal normal-case leading-relaxed tracking-normal text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 ${
        position === 'left' ? 'right-0' : 'left-1/2 -translate-x-1/2'
      }`}>
        {tooltip}
        <span className={`absolute -top-1.5 h-3 w-3 rotate-45 bg-gray-900 ${
          position === 'left' ? 'right-3' : 'left-1/2 -translate-x-1/2'
        }`} />
      </span>
    </span>
  )

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
              className="rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 focus:border-[var(--lagoon)] focus:outline-none focus:ring-1 focus:ring-[var(--lagoon)]"
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
          <thead className="bg-gray-50">
            <tr>
              <th className="w-10 px-4 py-3"></th>
              <th 
                className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700 hover:text-gray-900"
                onClick={() => handleSort('decedent_name')}
              >
                Decedent <SortIcon field="decedent_name" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700">
                Case #
              </th>
              <th 
                className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700 hover:text-gray-900"
                onClick={() => handleSort('file_date')}
              >
                Filed <SortIcon field="file_date" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700">
                Type
                <InfoIcon tooltip="Type of probate case (e.g., Independent Administration, Guardianship)" />
              </th>
              <th 
                className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700 hover:text-gray-900"
                onClick={() => handleSort('match_count')}
              >
                Properties <SortIcon field="match_count" />
              </th>
              <th 
                className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700 hover:text-gray-900"
                onClick={() => handleSort('total_value')}
              >
                Est. Value <SortIcon field="total_value" />
              </th>
              <th 
                className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700 hover:text-gray-900"
                onClick={() => handleSort('best_match_score')}
              >
                Match %
                <InfoIcon tooltip="Fuzzy name match score: 100% = exact match, 85%+ = likely match" position="left" />
                <SortIcon field="best_match_score" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700">
                Status
                <InfoIcon tooltip="Court case status: Open = active, Closed = resolved, Pending = awaiting action" position="left" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)] bg-white">
            {paginatedLeads.map((lead) => (
              <>
                <tr 
                  key={lead.case_number} 
                  className={`hover:bg-gray-50 ${lead.properties.length > 0 ? 'cursor-pointer' : ''}`}
                  onClick={() => lead.properties.length > 0 && toggleExpand(lead.case_number)}
                >
                  <td className="px-4 py-3 text-gray-500">
                    {lead.properties.length > 0 && (
                      <span className="text-sm">
                        {expandedRows.has(lead.case_number) ? '▼' : '▶'}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                    {lead.decedent_name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-gray-700">
                    {lead.case_number}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                    {lead.file_date}
                  </td>
                  <td 
                    className="max-w-xs truncate px-4 py-3 text-sm text-gray-700"
                    title={lead.case_type}
                  >
                    {lead.case_type}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      lead.match_count > 0 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {lead.match_count}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`font-semibold ${getTotalValue(lead.properties) > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                      {formatCurrency(getTotalValue(lead.properties))}
                    </span>
                  </td>
                  <td 
                    className="whitespace-nowrap px-4 py-3"
                    title={
                      lead.best_match_score >= 95 ? 'High confidence: name closely matches property owner' :
                      lead.best_match_score >= 85 ? 'Medium confidence: likely match, verify manually' :
                      'Low confidence: may be a different person'
                    }
                  >
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
                      <span className="text-sm font-medium text-gray-700">{lead.best_match_score}%</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span 
                      className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${
                        lead.status === 'Open' ? 'bg-blue-100 text-blue-800' :
                        lead.status === 'Closed' ? 'bg-gray-100 text-gray-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}
                      title={
                        lead.status === 'Open' ? 'Case is active - estate being administered' :
                        lead.status === 'Closed' ? 'Case resolved - estate settled' :
                        'Case pending court action'
                      }
                    >
                      {lead.status}
                    </span>
                  </td>
                </tr>
                {/* Expanded row with property details */}
                {expandedRows.has(lead.case_number) && lead.properties.length > 0 && (
                  <tr key={`${lead.case_number}-expanded`}>
                    <td colSpan={9} className="bg-gray-50 px-8 py-4">
                      <div className="text-sm">
                        <h4 className="mb-2 font-semibold text-gray-900">Matched Properties:</h4>
                        <div className="space-y-2">
                          {lead.properties.map((prop, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3"
                            >
                              <div>
                                <span className="font-medium text-gray-900">{prop.owner_name}</span>
                                <span className="ml-2 text-gray-600">({prop.match_score}% match)</span>
                                <div className="text-gray-600">{prop.site_address}</div>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold text-green-700">
                                  {formatCurrency(prop.market_value)}
                                </div>
                                <div className="text-xs text-gray-500">
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
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line)] px-6 py-4">
        <div className="flex items-center gap-4">
          <span className="text-sm text-[var(--sea-ink-soft)]">
            Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, sortedLeads.length)} of {sortedLeads.length}
          </span>
          <div className="flex items-center gap-2">
            <label htmlFor="pageSize" className="text-sm text-[var(--sea-ink-soft)]">Per page:</label>
            <select
              id="pageSize"
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--sea-ink)] focus:border-[var(--lagoon)] focus:outline-none focus:ring-1 focus:ring-[var(--lagoon)]"
            >
              {PAGE_SIZE_OPTIONS.map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm font-medium text-[var(--sea-ink-soft)] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[var(--chip-bg)]"
          >
            Previous
          </button>
          <span className="text-sm text-[var(--sea-ink-soft)]">
            Page {page + 1} of {totalPages || 1}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm font-medium text-[var(--sea-ink-soft)] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[var(--chip-bg)]"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
