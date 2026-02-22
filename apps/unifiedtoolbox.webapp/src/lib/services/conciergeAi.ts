'use client'

import type { ChatMessage, Proposal, ProposalPlanStep, ProposalRisk } from '@/lib/types/proposal'
import { generateProposalId } from '@/lib/services/proposalStore'

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Concierge, the AI front door for the Unified AI Toolbox — a multi-agent orchestration platform.

Your job: help the user articulate their goal and, once you have enough context, generate a structured Proposal JSON.

Conversation rules:
1. For the first 1–2 turns, ask clarifying questions if the goal is vague (target repo, constraints, deliverable format, risk tolerance).
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
    "tools": []
  },
  "approvals": {
    "required": ["Human review before any file writes"]
  },
  "acceptance_checks": [
    "Build passes with exit code 0",
    "No high-severity findings"
  ],
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

Keep plan.steps to 3–7 items. Include at least one risk. Make acceptance_checks measurable.`

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
  apiKey?: string
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
    const demoReply = buildDemoReply(userMessage, updatedHistory)
    return demoReply
  }

  // Build messages for OpenAI
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
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

function buildDemoReply(userMessage: string, history: ChatMessage[]): ConciergeReply {
  const isFirstMessage = history.filter((m) => m.role === 'user').length === 1

  if (isFirstMessage) {
    return {
      message:
        `Got it! To give you a solid Proposal, let me ask a couple of things:\n\n` +
        `1. Is there a specific repository or codebase to work with, or is this a standalone task?\n` +
        `2. What does "done" look like — what's the concrete deliverable?\n\n` +
        `*(Demo mode — add an OpenAI API key in Settings to use the real Concierge.)*`,
      proposal: null,
    }
  }

  // On second turn, generate a demo proposal
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
