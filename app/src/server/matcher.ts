import { createServerFn } from '@tanstack/react-start'
import { spawn } from 'child_process'
import { join } from 'path'
import { readdir, readFile, unlink } from 'fs/promises'

// Path to scripts directory (relative to app/)
const SCRIPTS_DIR = join(process.cwd(), '..', 'scripts')

export interface Property {
  account_number: string
  owner_name: string
  site_address: string
  market_value: number | null
  match_score: number
  match_type: string
}

export interface Lead {
  case_number: string
  court: string
  file_date: string
  status: string
  case_type: string
  decedent_name: string
  properties: Property[]
  match_count: number
  best_match_score: number
  created_at: string
}

export interface MatcherResult {
  success: boolean
  leads: Lead[]
  logs: string[]
  error?: string
}

/**
 * Run the Python matcher script and return results
 */
export const runMatcher = createServerFn({ method: 'POST' })
  .inputValidator((data: { days: number }) => data)
  .handler(async ({ data }): Promise<MatcherResult> => {
    const { days } = data
    const logs: string[] = []
    
    const pythonPath = join(SCRIPTS_DIR, 'venv', 'bin', 'python')
    const matcherPath = join(SCRIPTS_DIR, 'matcher.py')
    
    logs.push(`Starting lead generation for last ${days} days...`)
    
    return new Promise((resolve) => {
      const proc = spawn(pythonPath, [matcherPath, '--days', String(days)], {
        cwd: SCRIPTS_DIR,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
        },
      })
      
      proc.stdout.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(l => l.trim())
        logs.push(...lines)
      })
      
      proc.stderr.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(l => l.trim())
        logs.push(...lines.map(l => `[stderr] ${l}`))
      })
      
      proc.on('close', async (code) => {
        if (code === 0) {
          try {
            const outputDir = join(SCRIPTS_DIR, 'output')
            const files = await readdir(outputDir)
            const leadFiles = files
              .filter(f => f.startsWith('leads_') && f.endsWith('.json'))
              .sort()
              .reverse()
            
            if (leadFiles.length > 0) {
              const latestFile = join(outputDir, leadFiles[0])
              const content = await readFile(latestFile, 'utf-8')
              const leads = JSON.parse(content) as Lead[]
              logs.push(`✓ Complete! Found ${leads.length} leads.`)
              resolve({ success: true, leads, logs })
            } else {
              resolve({ success: false, leads: [], logs, error: 'No output file generated' })
            }
          } catch (err) {
            resolve({ success: false, leads: [], logs, error: `Failed to read results: ${err}` })
          }
        } else {
          resolve({ success: false, leads: [], logs, error: `Process exited with code ${code}` })
        }
      })
      
      proc.on('error', (err) => {
        logs.push(`Process error: ${err.message}`)
        resolve({ success: false, leads: [], logs, error: err.message })
      })
    })
  })

/**
 * Get existing leads from the most recent output file
 */
export const getExistingLeads = createServerFn({ method: 'GET' })
  .handler(async (): Promise<{ leads: Lead[], file: string | null }> => {
    try {
      const outputDir = join(SCRIPTS_DIR, 'output')
      const files = await readdir(outputDir)
      const leadFiles = files
        .filter(f => f.startsWith('leads_') && f.endsWith('.json'))
        .sort()
        .reverse()
      
      if (leadFiles.length > 0) {
        const latestFile = join(outputDir, leadFiles[0])
        const content = await readFile(latestFile, 'utf-8')
        const leads = JSON.parse(content) as Lead[]
        return { leads, file: leadFiles[0] }
      }
      
      return { leads: [], file: null }
    } catch {
      return { leads: [], file: null }
    }
  })

/**
 * Clear all saved lead files
 */
export const clearLeads = createServerFn({ method: 'POST' })
  .handler(async (): Promise<{ success: boolean, deleted: number }> => {
    try {
      const outputDir = join(SCRIPTS_DIR, 'output')
      const files = await readdir(outputDir)
      const leadFiles = files.filter(f => f.startsWith('leads_') && f.endsWith('.json'))
      
      for (const file of leadFiles) {
        await unlink(join(outputDir, file))
      }
      
      return { success: true, deleted: leadFiles.length }
    } catch {
      return { success: false, deleted: 0 }
    }
  })
