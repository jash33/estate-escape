import { createFileRoute } from '@tanstack/react-router'
import { spawn } from 'child_process'
import { join } from 'path'
import { readdir, readFile } from 'fs/promises'

export const Route = createFileRoute('/api/stream')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const days = url.searchParams.get('days') || '7'
        
        const scriptsDir = join(process.cwd(), '..', 'scripts')
        const pythonPath = join(scriptsDir, 'venv', 'bin', 'python')
        const matcherPath = join(scriptsDir, 'matcher.py')
        
        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder()
            let closed = false
            
            const sendEvent = (event: string, data: unknown) => {
              if (closed) return
              try {
                const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
                controller.enqueue(encoder.encode(payload))
              } catch {
                closed = true
              }
            }
            
            const closeStream = () => {
              if (closed) return
              closed = true
              try {
                controller.close()
              } catch {
                // Already closed
              }
            }
            
            sendEvent('log', { message: `Starting lead generation for last ${days} days...` })
            
            const proc = spawn(pythonPath, [matcherPath, '--days', days], {
              cwd: scriptsDir,
              env: { ...process.env, PYTHONUNBUFFERED: '1' },
            })
            
            proc.stdout.on('data', (chunk: Buffer) => {
              const lines = chunk.toString().split('\n').filter(l => l.trim())
              for (const line of lines) {
                sendEvent('log', { message: line })
              }
            })
            
            proc.stderr.on('data', (chunk: Buffer) => {
              const lines = chunk.toString().split('\n').filter(l => l.trim())
              for (const line of lines) {
                sendEvent('log', { message: line })
              }
            })
            
            proc.on('close', async (code) => {
              if (code === 0) {
                try {
                  const outputDir = join(scriptsDir, 'output')
                  const files = await readdir(outputDir)
                  const leadFiles = files
                    .filter(f => f.startsWith('leads_') && f.endsWith('.json'))
                    .sort()
                    .reverse()
                  
                  if (leadFiles.length > 0) {
                    const latestFile = join(outputDir, leadFiles[0])
                    const content = await readFile(latestFile, 'utf-8')
                    const leads = JSON.parse(content)
                    sendEvent('log', { message: `✓ Complete! Found ${leads.length} leads.` })
                    sendEvent('result', { leads })
                  } else {
                    sendEvent('error', { message: 'No output file generated' })
                  }
                } catch (err) {
                  sendEvent('error', { message: `Failed to read results: ${err}` })
                }
              } else {
                sendEvent('error', { message: `Process exited with code ${code}` })
              }
              
              sendEvent('done', {})
              closeStream()
            })
            
            proc.on('error', (err) => {
              sendEvent('error', { message: `Process error: ${err.message}` })
              sendEvent('done', {})
              closeStream()
            })
          },
        })
        
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        })
      },
    },
  },
})
