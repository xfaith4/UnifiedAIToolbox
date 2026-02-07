import OpenAI from 'openai'
import type { Session, Task, Artifact, RunMode } from '../types'
import { ArtifactType, TaskStatus } from '../types'
import type { EnginePipelinePayload } from '@/lib/app-factory/pipeline/pipelineStatus'
import { buildEnginePipelinePayload } from '@/lib/app-factory/pipeline/pipelineStatus'

function makeInitialPipeline(hardeningEnabled: boolean): EnginePipelinePayload {
  const base = buildEnginePipelinePayload({
    hardeningEnabled,
    repoDir: null,
    runId: null,
    maxRepairCycles: 3,
    agentsStatus: 'pending',
  })

  return {
    ...base,
    stages: base.stages.map((s) => {
      if (s.id === 'assemble') return { ...s, status: 'pending' }
      if (s.id === 'export') return { ...s, status: 'pending' }
      return s
    }),
  }
}

const simpleId = () => `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

// Define maximum character lengths to prevent token limit errors.
const MAX_FILE_CONTEXT_LENGTH = 20000 // Approx 5k tokens for initial plan
const MAX_ARTIFACT_CONTEXT_LENGTH = 8000 // Approx 2k tokens per artifact
// DALL·E prompt hard limit (server-enforced, in characters).
const MAX_IMAGE_PROMPT_LENGTH = 4000
const IMAGE_PROMPT_TRUNCATION_NOTICE = '\n\n... [Image Prompt Truncated due to DALL·E 4000 character limit] ...'

const truncateForPromptLimit = (value: string, maxLen: number, notice: string) => {
  if (value.length <= maxLen) return value
  const keepLen = Math.max(0, maxLen - notice.length)
  return value.substring(0, keepLen) + notice
}

function stripCodeFences(value: string): string {
  const text = (value || '').trim()
  if (!text) return ''
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenceMatch?.[1]) return fenceMatch[1].trim()
  return text
}

function extractFirstJsonObjectSlice(text: string): string | null {
  const s = text
  let start = s.indexOf('{')
  while (start >= 0) {
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < s.length; i++) {
      const ch = s[i]
      if (escaped) {
        escaped = false
        continue
      }
      if (inString) {
        if (ch === '\\\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') {
        inString = true
        continue
      }
      if (ch === '{') depth++
      if (ch === '}') {
        depth--
        if (depth === 0) return s.slice(start, i + 1)
      }
    }
    start = s.indexOf('{', start + 1)
  }
  return null
}

function parseJsonObjectFromModel(text: string): unknown {
  const cleaned = stripCodeFences(String(text || '')).replace(/^\uFEFF/, '').trim()
  if (!cleaned) throw new Error('Planner returned empty content.')

  // Try full parse first.
  try {
    return JSON.parse(cleaned)
  } catch {
    // Try extracting the first JSON object embedded in prose.
    const slice = extractFirstJsonObjectSlice(cleaned)
    if (!slice) throw new Error('Planner response did not contain a JSON object.')
    return JSON.parse(slice)
  }
}

function sanitizePlannedFilename(raw: string): string {
  let name = String(raw || '').trim()
  name = name.replace(/^["'`]+/, '').replace(/["'`]+$/, '')
  if (!name) return ''

  if (name.includes(',')) name = name.split(',')[0].trim()

  const tokens = name.split(/\s+/).filter(Boolean)
  if (tokens.length > 1 && tokens[0].includes('/')) name = tokens[0]

  if (/\*\.([a-z0-9]+)$/i.test(name)) {
    name = name.replace(/\*\.([a-z0-9]+)$/i, 'index.$1')
  } else if (name.endsWith('/*')) {
    name = name.replace(/\/\*$/i, '/index.ts')
  } else if (name.includes('*')) {
    name = name.replace(/\*/g, 'index')
  }

  name = name.replace(/\r?\n/g, ' ').trim()
  return name
}

// Pricing per 1 million tokens (input/output) for GPT-5.2
const PRICING = {
  'gpt-5.2': { input: 2.5 / 1_000_000, output: 10.0 / 1_000_000 },
  'dall-e-3': { perImage: 0.04 }, // Standard quality 1024x1024
}

// Water usage estimation: approximate liters per 1,000 tokens
const WATER_LITERS_PER_K_TOKEN = 0.002

const STORAGE_KEY = 'orchestrator-session-history'
const MAX_HISTORY_ITEMS = 50
// LocalStorage is quota-limited (~5MB). Keep the on-disk cache compact to avoid QuotaExceededError.
// Full-fidelity sessions are persisted server-side via /api/engine/history.
const MAX_LOCAL_CACHE_ITEMS = 15
const MAX_LOCAL_GOAL_CHARS = 2000
const HISTORY_API_ENDPOINT = '/api/engine/history'

const getBrowserApiKey = () => process.env.NEXT_PUBLIC_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY || ''

const calculateCost = (model: keyof typeof PRICING, inputTokens: number, outputTokens: number, images: number = 0): number => {
  if (model === 'dall-e-3') return images * PRICING[model].perImage
  const modelPricing = PRICING[model]
  if (!modelPricing || !('input' in modelPricing)) return 0
  return inputTokens * modelPricing.input + outputTokens * modelPricing.output
}

const calculateWaterUsage = (inputTokens: number, outputTokens: number): number => {
  const totalTokens = inputTokens + outputTokens
  return (totalTokens / 1000) * WATER_LITERS_PER_K_TOKEN
}

const isQuotaExceededError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false
  const e = error as { name?: string; code?: number; message?: string }
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014 ||
    (typeof e.message === 'string' && e.message.toLowerCase().includes('quota'))
  )
}

const truncateString = (value: string, maxChars: number) => {
  if (value.length <= maxChars) return value
  return `${value.slice(0, Math.max(0, maxChars - 12))}… (truncated)`
}

const sanitizeSessionForLocalCache = (session: Session): Session => {
  const safeGoal = truncateString(session.goal ?? '', MAX_LOCAL_GOAL_CHARS)

  return {
    id: session.id,
    goal: safeGoal,
    jobType: session.jobType,
    fileContent: null,
    date: session.date || new Date().toISOString(),
    environmentalImpact: session.environmentalImpact ?? null,
    planningCost: session.planningCost,
    totalCost: session.totalCost,
    tasks: Array.isArray(session.tasks)
      ? session.tasks.map((t) => ({
          id: t.id,
          name: t.name,
          status: t.status,
          dependencies: Array.isArray(t.dependencies) ? t.dependencies : [],
          agent: {
            role: t.agent?.role ?? 'Agent',
            specialization: t.agent?.specialization,
            log: [],
          },
          artifacts: [],
          cost: t.cost,
          inputTokens: t.inputTokens,
          outputTokens: t.outputTokens,
        }))
      : [],
  }
}

const persistLocalHistory = (history: Session[]) => {
  if (typeof window === 'undefined') return
  const compactHistory = history.slice(0, MAX_LOCAL_CACHE_ITEMS).map(sanitizeSessionForLocalCache)

  let candidate = compactHistory
  while (candidate.length >= 0) {
    try {
      const serializedHistory = JSON.stringify(candidate)
      window.localStorage.setItem(STORAGE_KEY, serializedHistory)
      return
    } catch (error) {
      if (!isQuotaExceededError(error)) {
        console.warn('[orchestrator history] Failed to save local cache:', error)
        return
      }

      // Quota exceeded: reduce stored history and retry.
      if (candidate.length <= 1) {
        try {
          window.localStorage.removeItem(STORAGE_KEY)
        } catch {
          // ignore
        }
        console.warn('[orchestrator history] localStorage quota exceeded; cleared local cache.')
        return
      }

      candidate = candidate.slice(0, Math.max(1, Math.floor(candidate.length / 2)))
    }
  }
}

const loadLocalHistory = (): Session[] => {
  if (typeof window === 'undefined') return []
  try {
    const storedHistory = window.localStorage.getItem(STORAGE_KEY)
    if (!storedHistory) return []
    const parsed = JSON.parse(storedHistory)
    return Array.isArray(parsed) ? (parsed as Session[]) : []
  } catch (error) {
    console.error('Failed to load session history from localStorage:', error)
    window.localStorage.removeItem(STORAGE_KEY)
    return []
  }
}

const parseHistoryDate = (value?: string) => {
  const timestamp = value ? Date.parse(value) : NaN
  return Number.isFinite(timestamp) ? timestamp : 0
}

const mergeHistories = (serverHistory: Session[], localHistory: Session[]) => {
  const byId = new Map<string, Session>()

  const addSession = (entry: Session | null | undefined) => {
    if (!entry || !entry.id) return
    const candidate: Session = {
      ...entry,
      date: entry.date || new Date().toISOString(),
    }

    const existing = byId.get(candidate.id)
    if (!existing || parseHistoryDate(candidate.date) > parseHistoryDate(existing.date)) {
      byId.set(candidate.id, candidate)
    }
  }

  serverHistory.forEach(addSession)
  localHistory.forEach(addSession)

  return Array.from(byId.values())
    .sort((a, b) => parseHistoryDate(b.date) - parseHistoryDate(a.date))
    .slice(0, MAX_HISTORY_ITEMS)
}

export type OrchestratorSnapshot = {
  session: Session | null
  history: Session[]
  isOrchestrating: boolean
  isComplete: boolean
  pipeline: EnginePipelinePayload
}

type Subscriber = () => void

class OrchestratorRuntime {
  private snapshot: OrchestratorSnapshot = {
    session: null,
    history: [],
    isOrchestrating: false,
    isComplete: false,
    pipeline: makeInitialPipeline(false),
  }

  private tasks: Task[] = []
  private runningTasks = new Set<string>()
  private subscribers = new Set<Subscriber>()
  private hydratedHistory = false
  private hydratedFlags = false
  private runToken = 0

  private nextRunToken(): number {
    this.runToken += 1
    return this.runToken
  }

  private isCurrentRun(token: number): boolean {
    return token === this.runToken
  }

  subscribe = (cb: Subscriber) => {
    this.subscribers.add(cb)
    this.ensureHydratedHistory()
    this.ensureHydratedFlags()
    return () => this.subscribers.delete(cb)
  }

  getSnapshot = () => this.snapshot

  private emit() {
    for (const cb of this.subscribers) cb()
  }

  private setSnapshot(partial: Partial<OrchestratorSnapshot>) {
    this.snapshot = { ...this.snapshot, ...partial }
    this.emit()
  }

  private setAgentsStageStatus(status: 'pending' | 'running' | 'passed' | 'failed') {
    const next = {
      ...this.snapshot.pipeline,
      stages: this.snapshot.pipeline.stages.map((s) => (s.id === 'agents' ? { ...s, status } : s)),
    }
    this.snapshot = { ...this.snapshot, pipeline: next }
    this.emit()
  }

  private setTasks(next: Task[]) {
    this.tasks = next
    if (this.snapshot.session) {
      this.snapshot = { ...this.snapshot, session: { ...this.snapshot.session, tasks: next } }
    }
    this.emit()
  }

  private updateTask(taskId: string, updates: Partial<Task> | ((task: Task) => Partial<Task>), token: number) {
    if (!this.isCurrentRun(token)) return
    const next = this.tasks.map((t) => (t.id === taskId ? { ...t, ...(typeof updates === 'function' ? updates(t) : updates) } : t))
    this.setTasks(next)
    this.pump(token)
  }

  private appendToTaskLog(taskId: string, entry: string, token: number) {
    this.updateTask(
      taskId,
      (task) => ({
        agent: { ...task.agent, log: [...task.agent.log, entry] },
      }),
      token
    )
  }

  private async persistSessionToServer(sessionToPersist: Session) {
    try {
      await fetch(HISTORY_API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionToPersist),
      })
    } catch (error) {
      console.error('Failed to persist session history to API:', error)
    }
  }

  private async clearServerHistory() {
    try {
      await fetch(HISTORY_API_ENDPOINT, { method: 'DELETE' })
    } catch (error) {
      console.error('Failed to clear persisted session history:', error)
    }
  }

  private ensureHydratedHistory() {
    if (this.hydratedHistory) return
    this.hydratedHistory = true
    void this.hydrateHistory()
  }

  private ensureHydratedFlags() {
    if (this.hydratedFlags) return
    this.hydratedFlags = true
    void this.hydrateFlags()
  }

  private async hydrateFlags() {
    try {
      const res = await fetch('/api/app-factory/flags', { cache: 'no-store' })
      if (!res.ok) return
      const payload = (await res.json()) as { HARDENING_PIPELINE?: boolean; PARALLEL_TEAMS?: boolean; MAX_PARALLEL_TEAMS?: number }
      const hardeningEnabled = Boolean(payload?.HARDENING_PIPELINE)
      const parallelTeamsEnabled = Boolean(payload?.PARALLEL_TEAMS)
      const maxParallelTeams = typeof payload?.MAX_PARALLEL_TEAMS === 'number' && payload.MAX_PARALLEL_TEAMS > 0 ? payload.MAX_PARALLEL_TEAMS : 4
      this.snapshot = {
        ...this.snapshot,
        pipeline: {
          ...this.snapshot.pipeline,
          hardeningEnabled,
          parallelTeamsEnabled,
          maxParallelTeams,
          stages: this.snapshot.pipeline.stages.map((s) =>
            s.id === 'normalize' || s.id === 'contract' || s.id === 'gates' || s.id === 'repair'
              ? { ...s, status: hardeningEnabled ? (s.status === 'skipped' ? 'pending' : s.status) : 'skipped' }
              : s.id === 'decision-lock' || s.id === 'teams'
                ? { ...s, status: hardeningEnabled ? (parallelTeamsEnabled ? (s.status === 'skipped' ? 'pending' : s.status) : 'skipped') : 'skipped' }
                : s
          ),
        },
      }
      this.emit()
    } catch {
      // ignore
    }
  }

  setPipeline = (pipeline: EnginePipelinePayload) => {
    this.snapshot = { ...this.snapshot, pipeline }
    this.emit()
  }

  private async hydrateHistory() {
    let serverHistory: Session[] = []
    try {
      const response = await fetch(HISTORY_API_ENDPOINT, { cache: 'no-store' })
      if (response.ok) {
        const payload = await response.json()
        if (Array.isArray(payload)) serverHistory = payload as Session[]
      } else {
        console.warn(`History API returned ${response.status}; using local cache instead.`)
      }
    } catch (error) {
      console.error('Failed to load session history from API:', error)
    }

    const merged = mergeHistories(serverHistory, loadLocalHistory())
    this.snapshot = { ...this.snapshot, history: merged }
    persistLocalHistory(merged)
    this.emit()
  }

  startOrchestration = async (
    goal: string,
    fileContent: string | null,
    seedArtifacts: Artifact[] | undefined,
    runMode: RunMode = 'build',
    requestPayload?: Record<string, any>
  ) => {
    const token = this.nextRunToken()
    this.setSnapshot({ isOrchestrating: true, isComplete: false })
    this.snapshot = { ...this.snapshot, pipeline: makeInitialPipeline(this.snapshot.pipeline.hardeningEnabled) }
    this.emit()
    this.setAgentsStageStatus('running')
    this.runningTasks = new Set()
    this.setTasks([])

    let plannerRawText: string | null = null

    let initialContext = ''
    if (requestPayload && Object.keys(requestPayload).length > 0) {
      initialContext += `Request payload:\n${JSON.stringify(requestPayload, null, 2)}\n`
    }
    const initialTasks: Task[] = []
    const hasBriefSeed = Array.isArray(seedArtifacts) && seedArtifacts.length > 0

    if (hasBriefSeed) {
      initialTasks.push({
        id: 'task_project_brief',
        name: 'Project Brief (project_brief.json)',
        status: TaskStatus.COMPLETED,
        dependencies: [],
        agent: { role: 'Supervisor', specialization: 'Project Brief', log: ['Project brief provided by requirements wizard.'] },
        artifacts: seedArtifacts || [],
      })
      initialContext += `A structured Project Brief has been provided as artifacts in task_project_brief (including project_brief.json, PRD.md, ACCEPTANCE.md, MVP_PROMISE.md).\n`
    }
    if (fileContent) {
      let truncatedContent = fileContent
      if (fileContent.length > MAX_FILE_CONTEXT_LENGTH) {
        truncatedContent = fileContent.substring(0, MAX_FILE_CONTEXT_LENGTH) + '\n\n... [File Content Truncated due to size] ...'
      }
      initialContext += `The user has provided the following file content for analysis:\n\`\`\`\n${truncatedContent}\n\`\`\`\n`
      initialTasks.push({
        id: 'task_file_analyst',
        name: 'Analyze Provided File',
        status: TaskStatus.PENDING,
        dependencies: [],
        agent: { role: 'Researcher', specialization: 'File Intake', log: [] },
        artifacts: [],
      })
    }

    const newSession: Session = {
      id: simpleId(),
      goal,
      jobType: requestPayload?.job_type,
      requestPayload: requestPayload || undefined,
      runMode,
      fileContent,
      date: new Date().toISOString(),
      tasks: [],
      environmentalImpact: null,
      startTime: Date.now(),
      waterUsage: 0,
    }
    this.snapshot = { ...this.snapshot, session: newSession }
    this.emit()
    this.setTasks(initialTasks)

    try {
      const apiKey = getBrowserApiKey()
      if (!apiKey) throw new Error('Missing API key (NEXT_PUBLIC_API_KEY / NEXT_PUBLIC_OPENAI_API_KEY).')

      const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })

      const parallelTeamsEnabled = Boolean(this.snapshot.pipeline.parallelTeamsEnabled)
      const maxParallelTeams = this.snapshot.pipeline.maxParallelTeams ?? 4

      const parallelInstructions = parallelTeamsEnabled
        ? `
        Parallel Teams Mode is enabled.
        You MUST add a "Decision Lock" task first (id: task_decision_lock) with agent specialization "Shared Contracts Team" that produces these files (one file per task):
        - STACK_LOCK.json
        - API_CONTRACT.json
        - DB_SCHEMA.sql
        - types/shared/index.ts

        Every non-contract team task MUST depend on task_decision_lock.
        Create team tasks with agent specialization exactly one of:
        - Shared Contracts Team
        - Platform Team
        - API Team
        - UI Team
        - Data/ML Team

        Ownership boundaries (strict):
        - Shared Contracts Team: STACK_LOCK.json, API_CONTRACT.*, DB_SCHEMA.sql, types/shared/**
        - Platform Team: infra/**, scripts/**, .github/**, and root tooling/config files
        - API Team: apps/api/** (excluding types/shared/** and contract files)
        - UI Team: apps/web/**
        - Data/ML Team: apps/api/src/jobs/** and apps/api/src/ml/**

        Concurrency hint: prefer at most ${maxParallelTeams} independent teams running at once.
        `
        : ''

      const runModeInstruction =
        runMode === 'design'
          ? `This is a DESIGN RUN: generate docs/specs only. Do NOT generate runnable repo scaffolding. Put outputs under docs/ (and optionally prompts/).`
          : `This is a BUILD RUN: generate a runnable repo with real files. Avoid placeholders like '...'. Avoid bundled multi-file blobs; output one artifact per real file path.`

      const planPrompt = `
        As a Supervisor AI, create a detailed, parallelizable plan to achieve the following goal: "${goal}".
        ${runModeInstruction}
        ${initialContext ? `Start by using the following context:\n${initialContext}` : ''}
        The plan must be a Directed Acyclic Graph (DAG) of tasks.
        For tasks that generate files, specify a unique, descriptive filename in parentheses within the task name, e.g., "Write the main application logic (app.py)".
        Filenames must be a SINGLE file path only (no commas, no globs like *, no multi-target lists).
        ${parallelInstructions}
        Return RAW JSON only (no Markdown, no code fences, no extra commentary).
        Return a single JSON object with a key "tasks", containing an array of task objects.
        Each task object must have: "id" (string), "name" (string), "dependencies" (array of task ids), and "agent" (object with "role" and optional "specialization").
        Choose from agent roles:
        - Researcher
        - Engineer
        - Critic
        - Synthesizer
        - Commissioner
        - Supervisor
        - Historian
        - Image Generator (only when an image artifact is explicitly needed)
        ${hasBriefSeed ? 'The first task in your plan *must* depend on task_project_brief.' : ''}
        ${fileContent ? 'The first task in your plan *must* depend on task_file_analyst.' : ''}
      `

      const response = await openai.chat.completions.create({
        model: 'gpt-5.2',
        messages: [{ role: 'user', content: planPrompt }],
      })
      plannerRawText = response.choices[0]?.message?.content ?? null

      if (!this.isCurrentRun(token) || !this.snapshot.isOrchestrating) return

      const usage = response.usage
      if (usage && this.snapshot.session) {
        const planningCost = calculateCost('gpt-5.2', usage.prompt_tokens, usage.completion_tokens)
        const planningWater = calculateWaterUsage(usage.prompt_tokens, usage.completion_tokens)
        this.snapshot = {
          ...this.snapshot,
          session: {
            ...this.snapshot.session,
            planningCost,
            waterUsage: (this.snapshot.session.waterUsage || 0) + planningWater,
          },
        }
        this.emit()
      }

      const plan = parseJsonObjectFromModel(plannerRawText || '{}') as any
      const plannedTasks: Task[] = (plan.tasks || []).map((t: any) => ({
        ...t,
        status: TaskStatus.PENDING,
        agent: { ...t.agent, log: [] },
        artifacts: [],
      }))

      const adjustedTasks = hasBriefSeed
        ? plannedTasks.map((t) => (t.id === 'task_project_brief' ? t : { ...t, dependencies: Array.from(new Set([...(t.dependencies || []), 'task_project_brief'])) }))
        : plannedTasks

      if (!this.isCurrentRun(token) || !this.snapshot.isOrchestrating) return
      this.setTasks([...this.tasks, ...adjustedTasks])
      this.pump(token)
    } catch (error) {
      console.error('Orchestration planning failed:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      const rawSnippet = plannerRawText ? plannerRawText.slice(0, 800) : ''
      const planningTask: Task = {
        id: 'task_planning',
        name: 'Planning (planner_output.json)',
        status: TaskStatus.FAILED,
        dependencies: [],
        agent: {
          role: 'Supervisor',
          specialization: 'Planner',
          log: rawSnippet ? [`Planning failed: ${errorMessage}`, `Planner output (truncated): ${rawSnippet}`] : [`Planning failed: ${errorMessage}`],
        },
        artifacts: [],
      }
      const nextTasks = (this.tasks.length ? this.tasks : [])
        .map((t) =>
          t.status === TaskStatus.COMPLETED
            ? t
            : {
                ...t,
                status: TaskStatus.FAILED,
                agent: { ...t.agent, log: [...(t.agent?.log || []), `Planning failed: ${errorMessage}`] },
              }
        )
        .concat(planningTask)
      this.setTasks(nextTasks)
      if (this.isCurrentRun(token)) this.setSnapshot({ isOrchestrating: false })
    }
  }

  cancelOrchestration = () => {
    if (!this.snapshot.isOrchestrating) return
    this.nextRunToken()
    this.setSnapshot({ isOrchestrating: false })
    this.setAgentsStageStatus('failed')
    this.runningTasks = new Set()
    const next = this.tasks.map((t) => {
      if (t.status === TaskStatus.RUNNING || t.status === TaskStatus.PENDING) {
        return {
          ...t,
          status: TaskStatus.FAILED,
          agent: {
            ...t.agent,
            log: t.status === TaskStatus.RUNNING ? [...t.agent.log, 'Execution canceled by user.'] : ['Execution canceled by user before starting.'],
          },
        }
      }
      return t
    })
    this.setTasks(next)
  }

  clearHistory = () => {
    this.snapshot = { ...this.snapshot, history: [] }
    this.emit()
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STORAGE_KEY)
      } catch (error) {
        console.error('Failed to clear local session history cache:', error)
      }
    }
    void this.clearServerHistory()
  }

  runFeedback = async (session: Session, feedback: string): Promise<string> => {
    const apiKey = getBrowserApiKey()
    if (!apiKey) throw new Error('Missing API key (NEXT_PUBLIC_API_KEY / NEXT_PUBLIC_OPENAI_API_KEY).')

    const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
    const context = session.tasks.map((t) => `Task: ${t.name}, Agent: ${t.agent.role}, Status: ${t.status}`).join('\n')

    const feedbackPrompt = `
      An AI orchestration session with the goal "${session.goal}" was completed.
      The executed plan was:
      ${context}

      Here is the user's feedback on the results: "${feedback}".

      You are a Feedback Analyst Agent. Your task is to analyze this feedback in the context of the original goal and the executed plan.
      Restate the user's feedback into actionable points.
      Then, act as an Agent Architect and propose a specific, non-destructive update to an existing agent's instructions or the orchestration planning process to address this feedback in future runs.
      Finally, as an Update Proposer, format this into a clear "Agent Update Proposal" in Markdown.
    `

    const response = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [{ role: 'user', content: feedbackPrompt }],
    })
    return response.choices[0].message.content || ''
  }

  private pump(token: number) {
    if (!this.isCurrentRun(token)) return
    if (!this.snapshot.isOrchestrating) return
    if (!this.tasks.length) return

    const completedOrFailed = new Set(this.tasks.filter((t) => t.status === TaskStatus.COMPLETED || t.status === TaskStatus.FAILED).map((t) => t.id))
    const ready = this.tasks.filter(
      (task) =>
        task.status === TaskStatus.PENDING &&
        !this.runningTasks.has(task.id) &&
        Array.isArray(task.dependencies) &&
        task.dependencies.every((depId) => completedOrFailed.has(depId))
    )

    if (ready.length) {
      const parallelEnabled = Boolean(this.snapshot.pipeline.parallelTeamsEnabled)
      const limit = parallelEnabled ? Math.max(1, this.snapshot.pipeline.maxParallelTeams ?? 4) : Number.POSITIVE_INFINITY
      const available = Number.isFinite(limit) ? Math.max(0, limit - this.runningTasks.size) : ready.length
      const toStart = [...ready].sort((a, b) => a.id.localeCompare(b.id)).slice(0, available)

      for (const task of toStart) {
        this.runningTasks.add(task.id)
        void this.executeTask(task, token)
      }
      return
    }

    const anyPending = this.tasks.some((t) => t.status === TaskStatus.PENDING)
    if (!anyPending && this.runningTasks.size === 0) {
      this.finalizeOrchestration()
    }
  }

  private finalizeOrchestration() {
    if (!this.snapshot.session || !this.snapshot.isOrchestrating) return
    const session = this.snapshot.session

    const planningCost = session.planningCost || 0
    const tasksCost = this.tasks.reduce((sum, t) => sum + (t.cost || 0), 0)
    const totalCost = planningCost + tasksCost

    const finalSession: Session = { ...session, tasks: this.tasks, totalCost, environmentalImpact: null }
    const updatedHistory = [finalSession, ...this.snapshot.history].slice(0, MAX_HISTORY_ITEMS)
    this.snapshot = { ...this.snapshot, session: finalSession, history: updatedHistory, isOrchestrating: false, isComplete: true }
    persistLocalHistory(updatedHistory)
    this.setAgentsStageStatus('passed')
    void this.persistSessionToServer(finalSession)
  }

  private async executeTask(task: Task, token: number) {
    if (!this.isCurrentRun(token)) return

    this.updateTask(task.id, { status: TaskStatus.RUNNING }, token)
    this.appendToTaskLog(task.id, `Starting task: ${task.name}`, token)
    this.appendToTaskLog(task.id, `Agent ${task.agent.role} is working...`, token)

    try {
      const apiKey = getBrowserApiKey()
      if (!apiKey) throw new Error('Missing API key (NEXT_PUBLIC_API_KEY / NEXT_PUBLIC_OPENAI_API_KEY).')
      const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })

      let newArtifact: Artifact | null = null
      let taskCost = 0
      let inputTokens = 0
      let outputTokens = 0

      const session = this.snapshot.session
      const parentTasks = this.tasks.filter((t) => task.dependencies.includes(t.id))
      const context = parentTasks
        .flatMap((pt) =>
          pt.artifacts.map((a) => {
            let content = a.content
            if (content.length > MAX_ARTIFACT_CONTEXT_LENGTH) {
              content = content.substring(0, MAX_ARTIFACT_CONTEXT_LENGTH) + '\n\n... [Content Truncated due to size] ...'
            }
            return `Context from parent task "${pt.name}":\n\`\`\`${a.name}\n${content}\n\`\`\``
          })
        )
        .join('\n\n')

      if (task.id === 'task_file_analyst') {
        if (!session?.fileContent) throw new Error('File Analyst task was scheduled, but no file content was found in the session.')
        const summaryPrompt = `Summarize the following content for a developer. Focus on key entities, structure, and purpose:\n\n${session.fileContent}`
        const response = await openai.chat.completions.create({
          model: 'gpt-5.2',
          messages: [{ role: 'user', content: summaryPrompt }],
        })
        if (!this.isCurrentRun(token) || !this.snapshot.isOrchestrating) return
        const fileSummary = response.choices[0].message.content || ''
        newArtifact = { id: simpleId(), name: 'file_summary.md', type: ArtifactType.REPORT, content: fileSummary }
        const usage = response.usage
        if (usage) {
          inputTokens = usage.prompt_tokens
          outputTokens = usage.completion_tokens
          taskCost = calculateCost('gpt-5.2', inputTokens, outputTokens)
        }
      } else if (task.agent.role === 'Image Generator') {
        const baseImagePrompt = `Based on the goal "${session?.goal}", generate a suitable image for the task: "${task.name}".`
        const imagePromptRaw = context ? `${baseImagePrompt}\n\n${context}` : baseImagePrompt
        const imagePrompt = truncateForPromptLimit(imagePromptRaw, MAX_IMAGE_PROMPT_LENGTH, IMAGE_PROMPT_TRUNCATION_NOTICE)
        if (imagePrompt !== imagePromptRaw) {
          this.appendToTaskLog(task.id, `Image prompt exceeded ${MAX_IMAGE_PROMPT_LENGTH} characters; truncated before calling DALL·E.`, token)
        }
        const imageResponse = await openai.images.generate({
          model: 'dall-e-3',
          prompt: imagePrompt,
          n: 1,
          size: '1024x1024',
          response_format: 'b64_json',
        })
        if (!this.isCurrentRun(token) || !this.snapshot.isOrchestrating) return
        taskCost = calculateCost('dall-e-3', 0, 0, 1)
        inputTokens = imagePrompt.length / 4
        outputTokens = 0
        if (imageResponse.data && imageResponse.data[0]?.b64_json) {
          const filenameMatch = task.name.match(/\(([^)]+)\)/)
          const filename = filenameMatch ? filenameMatch[1] : 'generated_image.png'
          newArtifact = { id: simpleId(), name: filename, type: ArtifactType.IMAGE, content: imageResponse.data[0].b64_json }
        }
      } else {
        const textPrompt = `
          You are the ${task.agent.role} agent.
          Your task is: "${task.name}".
          The overall goal is: "${session?.goal}".
          ${context ? `You have the following context from previous tasks:\n${context}` : ''}
          
          Perform your task. Provide a log of your actions prefixed with "LOG:".
          When you are finished, provide your final output as a single artifact prefixed with "ARTIFACT:". This is mandatory.
        `
        const response = await openai.chat.completions.create({
          model: 'gpt-5.2',
          messages: [
            {
              role: 'system',
              content:
                'You must strictly follow the output format. Use "LOG:" for progress and "ARTIFACT:" for the final, complete output. Your final output must begin with ARTIFACT:.',
            },
            { role: 'user', content: textPrompt },
          ],
        })

        if (!this.isCurrentRun(token) || !this.snapshot.isOrchestrating) throw new Error('Execution canceled by user.')

        const fullResponseText = response.choices[0].message.content || ''
        const lines = (fullResponseText || '').split('\n')
        const artifactLines: string[] = []
        let hasSeenArtifactTag = false
        for (const line of lines) {
          if (line.startsWith('LOG:')) {
            this.appendToTaskLog(task.id, line.substring(4).trim(), token)
          } else if (line.startsWith('ARTIFACT:')) {
            hasSeenArtifactTag = true
            artifactLines.push(line.substring(9))
          } else if (hasSeenArtifactTag) {
            artifactLines.push(line)
          }
        }

        let artifactContent = artifactLines.join('\n')
        if (!artifactContent.trim() && fullResponseText.trim()) {
          this.appendToTaskLog(task.id, 'Agent did not use ARTIFACT: prefix. Treating raw output as artifact.', token)
          artifactContent = lines.filter((line) => !line.startsWith('LOG:')).join('\n')
        }

        const usage = response.usage
        if (usage) {
          inputTokens = usage.prompt_tokens
          outputTokens = usage.completion_tokens
          taskCost = calculateCost('gpt-5.2', inputTokens, outputTokens)
        }

      if (artifactContent.trim()) {
        const filenameMatch = task.name.match(/\(([^)]+)\)/)
        const planned = filenameMatch ? sanitizePlannedFilename(filenameMatch[1]) : ''
        const filename = planned || `${task.agent.role.toLowerCase().replace(/\s+/g, '_')}_output.md`
        const type = /\.(py|js|ts|html|css|json)$/i.test(filename) ? ArtifactType.CODE : ArtifactType.REPORT
        newArtifact = { id: simpleId(), name: filename, type, content: artifactContent.trim() }
      }
      }

      if (newArtifact) {
        this.appendToTaskLog(task.id, `Created artifact: ${newArtifact.name}`, token)
        this.updateTask(task.id, { status: TaskStatus.COMPLETED, artifacts: [newArtifact], cost: taskCost, inputTokens, outputTokens }, token)
      } else {
        this.appendToTaskLog(task.id, 'Agent completed without producing a usable artifact.', token)
        this.updateTask(task.id, { status: TaskStatus.COMPLETED, artifacts: [], cost: taskCost, inputTokens, outputTokens }, token)
      }

      const taskWaterUsage = calculateWaterUsage(inputTokens, outputTokens)
      if (this.snapshot.session) {
        this.snapshot = {
          ...this.snapshot,
          session: {
            ...this.snapshot.session,
            waterUsage: (this.snapshot.session.waterUsage || 0) + taskWaterUsage,
            tasks: this.tasks,
          },
        }
        this.emit()
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.'
      console.error(`Task ${task.id} failed:`, error)
      this.appendToTaskLog(task.id, `Error: ${errorMessage}`, token)
      this.updateTask(task.id, { status: TaskStatus.FAILED }, token)
    } finally {
      if (this.isCurrentRun(token)) {
        this.runningTasks.delete(task.id)
        this.pump(token)
      }
    }
  }
}

let _runtime: OrchestratorRuntime | null = null

export function getOrchestratorRuntime(): OrchestratorRuntime {
  if (!_runtime) _runtime = new OrchestratorRuntime()
  return _runtime
}
