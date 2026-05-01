'use client'

import type { ChatMessage, Proposal, ProposalPlanStep, ProposalRisk } from '@/lib/types/proposal'
import type { ConciergeMode } from '@/lib/types/conciergePreferences'
import { generateProposalId } from '@/lib/services/proposalStore'

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Concierge, the AI front door for the Unified AI Toolbox — a multi-agent orchestration platform.

Your job: help the user articulate their goal and, once you have enough context, generate a structured Proposal JSON.

Conversation rules:
1. Default to producing a complete proposal on the first turn. If details are missing (target repo, constraints, deliverable format, risk tolerance, success criteria, app type, performance budget, etc.), DO NOT interrogate the user — fill them in with sensible industry-standard defaults and list every assumption you made in the \`assumptions\` array. Only ask a clarifying question when a missing detail is genuinely critical AND cannot be reasonably defaulted (e.g. the target repo URL for a maintain_existing_app job). Never block the user for vague concepts like "measurable outcomes" or "success criteria" — derive reasonable acceptance_checks yourself from the goal and the app type.
2. Once you understand the goal, respond with a brief human summary followed by a JSON block containing the proposal.
3. Keep responses concise. Be practical about risks and costs.

When you are ready to generate the proposal, output it as a \`\`\`json code block with EXACTLY this schema (no extra fields, no markdown inside the JSON):

\`\`\`json
{
  "goal": {
    "summary": "One-sentence goal",
    "context": "Optional extra context"
  },
  "inputs": {
    "repo": "optional repo URL or name",
    "files": [],
    "constraints": []
  },
  "plan": {
    "steps": [
      { "id": "1", "title": "Step title", "description": "What happens", "agent": "AgentName" }
    ]
  },
  "recommended": {
    "prompts": [],
    "agents": ["Supervisor", "Engineer", "Critic"],
    "tools": ["read_file", "write_file"]
  },
  "approvals": {
    "required": ["Human review before any file writes"]
  },
  "acceptance_checks": [
    "Build passes with exit code 0",
    "No high-severity findings"
  ],
  "assumptions": [
    "Assumption you made about the goal, repo, or constraints"
  ],
  "confidence": {
    "level": "medium",
    "reasoning": "Why you are or aren't confident in this proposal"
  },
  "risks": [
    { "level": "low", "description": "Risk description" }
  ],
  "estimate": {
    "time": "~5 minutes",
    "cost": "~$0.05",
    "tokens": 5000
  },
  "run_recipe": {
    "goal": "Same as goal.summary — used to prefill run pages",
    "mode": "multi-agent",
    "agents": ["Supervisor", "Engineer", "Critic"],
    "jobType": "build_new_app"
  }
}
\`\`\`

run_recipe rules (always populate — never null):
- mode: "multi-agent" for most tasks; "codex-swarm" only for tasks needing parallel independent perspectives (research, large refactors, design reviews)
- agents: subset of recommended.agents that should be pre-selected (omit Historian, Commissioner unless genuinely needed)
- jobType: "build_new_app" when creating something new; "maintain_existing_app" when improving an existing local codebase; omit the field entirely if neither applies clearly
- goal: echo goal.summary verbatim

tools rules (recommended.tools): List only MCP tool names agents will genuinely need.
Common names: "read_file" (read source files), "write_file" (write/modify code), "fetch_url" (HTTP requests), "execute_command" (shell commands).
Omit entirely if no external tools are needed. Each tool will require explicit user enablement before the run starts.

assumptions rules: List every non-trivial assumption you made (repo tech stack, budget, deployment target, environment, etc.). Use an empty array [] only if the goal is completely self-contained with no ambiguity.

confidence rules:
- level: "high" if goal and context are unambiguous; "medium" if one or two unknowns exist; "low" if critical information is missing.
- reasoning: One sentence explaining the confidence level.

Keep plan.steps to 3–7 items. Include at least one risk. Make acceptance_checks measurable.

When the conversation includes a requirements request (blocker questions from an orchestration run), follow these rules:
1. Present each blocker as a numbered question. If default options exist, list them as numbered sub-choices.
2. Based on the user's original goal and conversation context, suggest which option seems most appropriate and why.
3. After the user responds with their choices, output a structured JSON block with the tag "checkpoint_answers" containing the answers mapped to each blocker:
\`\`\`checkpoint_answers
{
  "answers": [
    { "blocker_id": "req_1", "question": "The original question", "answer": "The user's chosen answer" }
  ]
}
\`\`\`
4. If the user's response is ambiguous or only partially answers the questions, ask targeted follow-ups for the missing blockers rather than guessing.
5. Do NOT generate the checkpoint_answers block until ALL blockers have clear answers.
6. After generating the checkpoint_answers block, tell the user to review the answers in the confirmation card that will appear.`

// ── Mode-specific system prompt suffix ───────────────────────────────────────

const MODE_SYSTEM_SUFFIX: Record<ConciergeMode, string> = {
  guided:
    '\n\nUser preference — GUIDED mode: Ask AT MOST one round of 1–2 high-leverage clarifying questions, only for details that genuinely cannot be defaulted (e.g. target repo URL, regulated-domain constraints). For everything else (success criteria, measurable outcomes, performance budgets, app-type parameters, deliverable format, risk tolerance), fill in industry-standard defaults and surface them in the `assumptions` array. Then generate the proposal.',
  confident: '', // no change — default behaviour
  'hands-off':
    '\n\nUser preference — HANDS-OFF mode: Generate a complete proposal immediately on the first user message without asking any clarifying questions. Be direct and efficient. List every assumption you made in the `assumptions` array — this is especially important since you are not asking for clarification.',
}

// ── Checkpoint answer extraction ────────────────────────────────────────────

export interface CheckpointAnswerPayload {
  answers: Array<{ blocker_id: string; question: string; answer: string }>
}

/**
 * Extract structured checkpoint answers from an AI response.
 * Looks for a ```checkpoint_answers ... ``` fenced JSON block.
 */
export function extractCheckpointAnswers(text: string): CheckpointAnswerPayload | null {
  const match = text.match(/```checkpoint_answers\s*([\s\S]*?)```/)
  if (!match) return null

  try {
    const parsed = JSON.parse(match[1].trim()) as Record<string, unknown>
    const answers = parsed.answers
    if (!Array.isArray(answers)) return null

    const valid = answers.every(
      (a: unknown) =>
        typeof a === 'object' &&
        a !== null &&
        typeof (a as Record<string, unknown>).blocker_id === 'string' &&
        typeof (a as Record<string, unknown>).answer === 'string',
    )
    if (!valid) return null

    return {
      answers: answers.map((a: Record<string, unknown>) => ({
        blocker_id: String(a.blocker_id),
        question: typeof a.question === 'string' ? a.question : '',
        answer: String(a.answer),
      })),
    }
  } catch {
    return null
  }
}

// ── JSON extraction ───────────────────────────────────────────────────────────

/**
 * Extract a Proposal JSON block from AI response text.
 * Handles ```json ... ``` fences or bare JSON objects.
 * Returns null if no valid proposal is found.
 */
export function extractProposalJson(text: string): Partial<Proposal> | null {
  // Try fenced block first
  const fenceMatch = text.match(/```json\s*([\s\S]*?)```/)
  const raw = fenceMatch ? fenceMatch[1].trim() : null

  // Fallback: try to find a standalone JSON object in the text
  const jsonCandidate = raw ?? (() => {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end === -1) return null
    return text.slice(start, end + 1)
  })()

  if (!jsonCandidate) return null

  try {
    const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>
    // Minimal validation: must have goal.summary
    if (typeof (parsed?.goal as Record<string, unknown>)?.summary !== 'string') return null
    return parsed as Partial<Proposal>
  } catch {
    return null
  }
}

/**
 * Build a complete, valid Proposal from a partial AI-generated object.
 * Fills in missing fields with safe defaults.
 */
export function hydrateProposal(
  partial: Partial<Proposal>,
  conversation: ChatMessage[]
): Proposal {
  const now = new Date().toISOString()

  const steps: ProposalPlanStep[] = (partial.plan?.steps ?? []).map((s, i) => ({
    id: s.id ?? String(i + 1),
    title: s.title ?? `Step ${i + 1}`,
    description: s.description ?? '',
    agent: s.agent,
    tool: s.tool,
  }))

  const risks: ProposalRisk[] = (partial.risks ?? []).map((r) => ({
    level: (['low', 'medium', 'high'] as const).includes(r.level as 'low' | 'medium' | 'high')
      ? (r.level as 'low' | 'medium' | 'high')
      : 'low',
    description: r.description ?? '',
  }))

  return {
    proposal_version: '1.0',
    id: generateProposalId(),
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    goal: {
      summary: partial.goal?.summary ?? 'Untitled goal',
      context: partial.goal?.context,
    },
    inputs: {
      repo: partial.inputs?.repo,
      files: partial.inputs?.files ?? [],
      constraints: partial.inputs?.constraints ?? [],
    },
    plan: { steps },
    recommended: {
      prompts: partial.recommended?.prompts ?? [],
      agents: partial.recommended?.agents ?? [],
      tools: partial.recommended?.tools ?? [],
    },
    approvals: {
      required: partial.approvals?.required ?? [],
    },
    acceptance_checks: partial.acceptance_checks ?? [],
    assumptions: partial.assumptions ?? [],
    confidence: partial.confidence ?? undefined,
    risks,
    estimate: {
      time: partial.estimate?.time,
      cost: partial.estimate?.cost,
      tokens: partial.estimate?.tokens,
    },
    run_recipe: partial.run_recipe ?? null,
    conversation,
  }
}

// ── Multi-turn chat ───────────────────────────────────────────────────────────

export interface ConciergeReply {
  message: string
  proposal: Proposal | null
}

/**
 * Send the full conversation to the AI and return the assistant reply + any
 * extracted proposal. Handles missing API key gracefully (demo mode).
 */
export async function sendConciergeMessage(
  history: ChatMessage[],
  userMessage: string,
  apiKey?: string,
  mode: ConciergeMode = 'confident',
  /** Optional past-run context block to inject into the system prompt (Option A). */
  runHistoryContext?: string,
): Promise<ConciergeReply> {
  const key = apiKey || (typeof window !== 'undefined' ? localStorage.getItem('ai-toolbox-api-key') ?? '' : '')

  const userMsg: ChatMessage = {
    id: `msg_${Date.now()}`,
    role: 'user',
    content: userMessage,
    timestamp: new Date().toISOString(),
  }
  const updatedHistory = [...history, userMsg]

  // Demo mode when no key
  if (!key) {
    return buildDemoReply(userMessage, updatedHistory, mode)
  }

  // Build messages for OpenAI — inject mode suffix + past-run history into system prompt
  const systemContent =
    SYSTEM_PROMPT + (MODE_SYSTEM_SUFFIX[mode] ?? '') + (runHistoryContext ?? '')
  const messages = [
    { role: 'system' as const, content: systemContent },
    ...updatedHistory.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ]

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.3,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Concierge AI request failed (${response.status}): ${detail}`)
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content ?? ''

  const assistantMsg: ChatMessage = {
    id: `msg_${Date.now() + 1}`,
    role: 'assistant',
    content,
    timestamp: new Date().toISOString(),
  }
  const fullHistory = [...updatedHistory, assistantMsg]

  const partialProposal = extractProposalJson(content)
  const proposal = partialProposal ? hydrateProposal(partialProposal, fullHistory) : null

  return { message: content, proposal }
}

// ── Demo mode (no API key) ────────────────────────────────────────────────────

function buildDemoReply(
  userMessage: string,
  history: ChatMessage[],
  mode: ConciergeMode = 'confident'
): ConciergeReply {
  const isFirstMessage = history.filter((m) => m.role === 'user').length === 1
  // Hands-off: propose immediately; Guided/Confident: ask on turn 1
  const shouldPropose = mode === 'hands-off' || !isFirstMessage

  if (!shouldPropose) {
    const guidedExtra =
      mode === 'guided'
        ? `\n\n3. Are there any constraints I should know about (budget, timeline, tech stack)?`
        : ''
    return {
      message:
        `Got it! To give you a solid Proposal, let me ask a couple of things:\n\n` +
        `1. Is there a specific repository or codebase to work with, or is this a standalone task?\n` +
        `2. What does "done" look like — what's the concrete deliverable?` +
        guidedExtra +
        `\n\n*(Demo mode — add an OpenAI API key in Settings to use the real Concierge.)*`,
      proposal: null,
    }
  }

  // Generate a demo proposal
  const goalSummary = history.find((m) => m.role === 'user')?.content ?? userMessage
  const demoPartial: Partial<Proposal> = {
    goal: { summary: goalSummary.slice(0, 120), context: 'Demo proposal — no API key configured.' },
    inputs: { repo: '', files: [], constraints: ['No breaking changes'] },
    plan: {
      steps: [
        { id: '1', title: 'Analyse scope', description: 'Researcher agent surveys the codebase and identifies relevant files.', agent: 'Researcher' },
        { id: '2', title: 'Implement changes', description: 'Engineer agent writes the code.', agent: 'Engineer' },
        { id: '3', title: 'Review & validate', description: 'Critic agent reviews output for correctness and style.', agent: 'Critic' },
        { id: '4', title: 'Synthesise report', description: 'Synthesizer produces the final summary.', agent: 'Synthesizer' },
      ],
    },
    recommended: { prompts: [], agents: ['Supervisor', 'Researcher', 'Engineer', 'Critic', 'Synthesizer'], tools: [] },
    approvals: { required: ['Human review before file writes'] },
    acceptance_checks: ['No test failures', 'Code passes linting'],
    assumptions: [
      'Repository is TypeScript-based',
      'Standard npm/Node.js setup assumed',
      'No strict token-budget constraints',
    ],
    confidence: {
      level: 'medium',
      reasoning: 'Goal is clear, but codebase scope and deployment context are unknown (demo mode).',
    },
    risks: [
      { level: 'low', description: 'Scope may expand if codebase is larger than expected.' },
      { level: 'medium', description: 'Demo mode: AI suggestions not verified against real codebase.' },
    ],
    estimate: { time: '~5 minutes', cost: '~$0.05', tokens: 5000 },
    run_recipe: {
      goal: goalSummary.slice(0, 120),
      mode: 'multi-agent',
      agents: ['Supervisor', 'Researcher', 'Engineer', 'Critic'],
      jobType: 'build_new_app',
    },
  }

  const proposal = hydrateProposal(demoPartial, [
    ...history,
    {
      id: `msg_demo_${Date.now()}`,
      role: 'assistant',
      content: '(Demo proposal generated)',
      timestamp: new Date().toISOString(),
    },
  ])

  return {
    message:
      `Here's a Proposal based on what you've described. Review each section and use **Approve**, **Edit**, or **Reject** below.\n\n` +
      `*(Demo mode — add an OpenAI API key in Settings for real AI-powered proposals.)*`,
    proposal,
  }
}
