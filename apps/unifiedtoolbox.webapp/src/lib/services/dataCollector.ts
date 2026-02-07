/**
 * Data Collector Service
 * Scans actual repository data to provide real analytics
 * This module runs on the server side only (Node.js environment)
 */

import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'

const REPO_ROOT = process.env.REPO_ROOT || path.join(process.cwd(), '../..')
const PROMPTS_DIR = path.join(REPO_ROOT, 'data/prompts')
const AGENTS_DIR = path.join(REPO_ROOT, 'data/agents')
const LOGS_DIR = path.join(REPO_ROOT, 'logs')

export interface PromptData {
  id: string
  version?: string
  category?: string
  tags?: string[]
  status?: string
  risk_tier?: string
  owners?: string[]
  telemetry?: {
    tags?: string[]
    pii?: string
  }
  hasTests: boolean
  hasDocs: boolean
  filePath: string
}

export interface AgentData {
  id: string
  name: string
  role?: string
  capabilities?: string[]
  status?: string
  routing_hints?: {
    preferred_models?: string[]
  }
  filePath: string
}

export interface OrchestrationRun {
  id?: string
  goal?: string
  status?: string
  model?: string
  startTime?: string
  endTime?: string
  durationSeconds?: number
  milestonesCount?: number
  completedMilestones?: number
  agents?: string[]
  tokenUsage?: {
    total: number
    input: number
    output: number
  }
  cost?: number
  qualityScore?: number
}

/**
 * Scan prompt library directory and extract metadata
 */
export async function scanPromptLibrary(): Promise<PromptData[]> {
  const prompts: PromptData[] = []

  try {
    if (!fs.existsSync(PROMPTS_DIR)) {
      console.warn(`Prompts directory not found: ${PROMPTS_DIR}`)
      return prompts
    }

    const files = fs.readdirSync(PROMPTS_DIR)
    
    for (const file of files) {
      if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue
      
      const filePath = path.join(PROMPTS_DIR, file)
      try {
        const content = fs.readFileSync(filePath, 'utf8')
        const data = yaml.load(content) as Record<string, unknown>

        // Determine category from metadata first, then fall back to filename
        let category = 'General'
        
        // Check telemetry tags first (most reliable)
        const telemetry = data.telemetry as Record<string, unknown> | undefined
        if (telemetry?.tags && Array.isArray(telemetry.tags)) {
          const tags = telemetry.tags as string[]
          if (tags.includes('supervisor')) category = 'Supervisor'
          else if (tags.includes('engineering') || tags.includes('powershell') || tags.includes('sql')) category = 'Engineer'
          else if (tags.includes('analytics') || tags.includes('research')) category = 'Researcher'
          else if (tags.includes('synthesis') || tags.includes('postmortem')) category = 'Synthesizer'
          else if (tags.includes('review') || tags.includes('critic')) category = 'Critic'
          else if (tags.includes('comms') || tags.includes('meeting')) category = 'Commissioner'
        }
        
        // Fall back to filename patterns if no category from metadata
        if (category === 'General') {
          if (file.includes('engineering') || file.includes('powershell') || file.includes('sql')) {
            category = 'Engineer'
          } else if (file.includes('analytics') || file.includes('performance')) {
            category = 'Researcher'
          } else if (file.includes('incident') || file.includes('postmortem')) {
            category = 'Synthesizer'
          } else if (file.includes('meeting') || file.includes('comms')) {
            category = 'Commissioner'
          } else if (file.includes('review')) {
            category = 'Critic'
          }
        }

        // Check for companion files - strip all yaml extensions for matching
        const baseName = file.replace(/\.(prompt|meta|tests)?\.ya?ml$/, '')
        const hasTests = files.some(f => f.startsWith(baseName) && f.includes('.tests.'))
        const hasDocs = files.some(f => f.startsWith(baseName) && f.includes('.meta.'))

        prompts.push({
          id: String(data.id || file),
          version: data.version as string | undefined,
          category,
          tags: (telemetry?.tags as string[]) || [],
          status: String(data.status || 'active'),
          risk_tier: data.risk_tier as string | undefined,
          owners: data.owners as string[] | undefined,
          telemetry: telemetry as { tags?: string[]; pii?: string } | undefined,
          hasTests,
          hasDocs,
          filePath: file,
        })
      } catch (error) {
        console.error(`Error parsing prompt file ${file}:`, error)
      }
    }
  } catch (error) {
    console.error('Error scanning prompt library:', error)
  }

  return prompts
}

/**
 * Scan agent library directory and extract metadata
 */
export async function scanAgentLibrary(): Promise<AgentData[]> {
  const agents: AgentData[] = []

  try {
    if (!fs.existsSync(AGENTS_DIR)) {
      console.warn(`Agents directory not found: ${AGENTS_DIR}`)
      return agents
    }

    const files = fs.readdirSync(AGENTS_DIR)
    
    for (const file of files) {
      if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue
      
      const filePath = path.join(AGENTS_DIR, file)
      try {
        const content = fs.readFileSync(filePath, 'utf8')
        const data = yaml.load(content) as Record<string, unknown>

        agents.push({
          id: String(data.id || file),
          name: String(data.name || file.replace('.yaml', '')),
          role: String(data.role || 'Unknown'),
          capabilities: (data.capabilities as string[]) || [],
          status: String(data.status || 'active'),
          routing_hints: data.routing_hints as { preferred_models?: string[] } | undefined,
          filePath: file,
        })
      } catch (error) {
        console.error(`Error parsing agent file ${file}:`, error)
      }
    }
  } catch (error) {
    console.error('Error scanning agent library:', error)
  }

  return agents
}

/**
 * Scan logs directory for orchestration run data
 */
export async function scanOrchestrationRuns(): Promise<OrchestrationRun[]> {
  const runs: OrchestrationRun[] = []

  try {
    if (!fs.existsSync(LOGS_DIR)) {
      console.warn(`Logs directory not found: ${LOGS_DIR}`)
      return runs
    }

    const files = fs.readdirSync(LOGS_DIR)
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      
      const filePath = path.join(LOGS_DIR, file)
      try {
        const content = fs.readFileSync(filePath, 'utf8')
        const data = JSON.parse(content)

        // Handle orchestration-summary.json format
        if (data.Goal !== undefined) {
          runs.push({
            id: file,
            goal: data.Goal,
            status: data.Status,
            model: data.Model,
            startTime: data.StartTime,
            endTime: data.EndTime,
            durationSeconds: data.DurationSeconds,
            milestonesCount: data.MilestonesCount,
            completedMilestones: data.CompletedMilestones,
          })
        }
        // Handle other potential log formats
        else if (Array.isArray(data)) {
          // Array of runs
          for (const run of data) {
            runs.push(run)
          }
        } else if (data.runs) {
          // Object with runs array
          for (const run of data.runs) {
            runs.push(run)
          }
        }
      } catch (error) {
        console.error(`Error parsing log file ${file}:`, error)
      }
    }
  } catch (error) {
    console.error('Error scanning orchestration runs:', error)
  }

  return runs
}

/**
 * Calculate quality score for a prompt based on metadata
 */
export function calculatePromptQuality(prompt: PromptData): 'experimental' | 'validated' | 'production' {
  const hasTests = prompt.hasTests
  const hasDocs = prompt.hasDocs
  const hasLowRisk = prompt.risk_tier === 'low'
  const isActive = prompt.status === 'active'

  if (hasTests && hasDocs && hasLowRisk && isActive) {
    return 'production'
  } else if ((hasTests || hasDocs) && isActive) {
    return 'validated'
  }
  return 'experimental'
}
