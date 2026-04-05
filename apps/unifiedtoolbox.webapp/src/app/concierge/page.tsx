'use client'

import { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Send,
  Bot,
  User,
  CheckCircle2,
  XCircle,
  Edit3,
  AlertTriangle,
  Clock,
  Coins,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  ArrowRight,
  Play,
  Radio,
  Wrench,
  Lock,
  ShieldCheck,
} from 'lucide-react'
import type { ChatMessage, Proposal, ProposalRisk } from '@/lib/types/proposal'
import type { ToolPermission, ToolAuditEntry } from '@/lib/types/toolPermission'
import { inferToolAccess, defaultToolPermission } from '@/lib/types/toolPermission'
import type { ConciergeMode } from '@/lib/types/conciergePreferences'
import { CONCIERGE_MODES, DEFAULT_PREFERENCES } from '@/lib/types/conciergePreferences'
import { sendConciergeMessage } from '@/lib/services/conciergeAi'
import { getConciergeMode, setConciergeMode } from '@/lib/services/userPreferencesStore'
import {
  saveProposal,
  updateProposalStatus,
  createDraftRunFromProposal,
  listProposals,
  getProposal,
  getDraftRun,
  updateDraftRun,
} from '@/lib/services/proposalStore'
import { saveToolAudit } from '@/lib/services/toolPermissionStore'
import {
  startOrchestratorRun,
  fetchOrchestrationRun,
  narrateRunEvent,
  TERMINAL_RUN_STATUSES,
} from '@/lib/services/conciergeRunService'
import { fetchOrchestrationRuns, isOrchestratorApiHttpError } from '@/lib/services/orchestratorApi'
import type { OrchestrationRun } from '@/lib/types/orchestrator'
import {
  findSimilarRuns,
  buildRunHistoryPrompt,
  type PastRunInsight,
} from '@/lib/services/runHistoryAnalyzer'
import {
  saveRunContext,
  listRecentRunContexts,
  type RunContextEntry,
  type RunContextStatus,
} from '@/lib/services/runContextStore'
import { buildRequirementsRequestPrompt } from '@/lib/concierge/requirementsLoop'
import { buildKickoffRefinementMessage, getRunMonitorHref } from '@/lib/services/conciergeKickoff'
import type { Recipe } from '@/lib/types/recipes'
import {
  applyRecipeToProposal,
  buildRecipeContextPrompt,
  getRecipe,
} from '@/lib/services/recipeStore'
import CurrentRunCard from '@/components/runs/CurrentRunCard'
import LiveEventPanel from '@/components/runs/LiveEventPanel'

function buildRequirementsRequestMessage(run: OrchestrationRun): string | null {
  const packet = run.requirementsRequest ?? run.sandboxReport?.requirementsRequest
  return buildRequirementsRequestPrompt(packet)
}

function renderChatInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const [fullMatch, label, href] = match
    if (match.index > lastIndex) {
      nodes.push(
        <span key={`${keyPrefix}-text-${lastIndex}`}>
          {text.slice(lastIndex, match.index)}
        </span>,
      )
    }

    const trimmedHref = href.trim()
    if (trimmedHref.startsWith('/')) {
      nodes.push(
        <Link
          key={`${keyPrefix}-link-${match.index}`}
          href={trimmedHref}
          className="font-medium text-blue-300 underline underline-offset-2 hover:text-blue-200"
        >
          {label}
        </Link>,
      )
    } else if (/^https?:\/\//i.test(trimmedHref)) {
      nodes.push(
        <a
          key={`${keyPrefix}-link-${match.index}`}
          href={trimmedHref}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-blue-300 underline underline-offset-2 hover:text-blue-200"
        >
          {label}
        </a>,
      )
    } else {
      nodes.push(<span key={`${keyPrefix}-raw-${match.index}`}>{fullMatch}</span>)
    }

    lastIndex = match.index + fullMatch.length
  }

  if (lastIndex < text.length) {
    nodes.push(<span key={`${keyPrefix}-tail`}>{text.slice(lastIndex)}</span>)
  }

  return nodes
}

function renderChatContent(content: string): React.ReactNode {
  const lines = content.split('\n')
  return (
    <div className="space-y-2">
      {lines.map((line, index) =>
        line
          ? (
            <p key={`line-${index}`} className="break-words">
              {renderChatInline(line, `line-${index}`)}
            </p>
          )
          : <div key={`line-${index}`} className="h-1.5" aria-hidden="true" />
      )}
    </div>
  )
}

// ── Risk badge ────────────────────────────────────────────────────────────────
function RiskBadge({ level }: { level: ProposalRisk['level'] }) {
  const map = {
    low: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
    medium: 'bg-amber-900/50 text-amber-300 border-amber-700',
    high: 'bg-rose-900/50 text-rose-300 border-rose-700',
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${map[level]}`}>
      {level}
    </span>
  )
}

// ── Pill list ─────────────────────────────────────────────────────────────────
function PillList({ items, color = 'gray' }: { items: string[]; color?: 'blue' | 'purple' | 'gray' }) {
  if (!items.length) return <span className="text-xs text-gray-600">none</span>
  const cls = {
    blue: 'bg-blue-900/40 text-blue-300 border-blue-800',
    purple: 'bg-purple-900/40 text-purple-300 border-purple-800',
    gray: 'bg-gray-800 text-gray-300 border-gray-700',
  }[color]
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className={`rounded-full border px-2 py-0.5 text-xs ${cls}`}>{item}</span>
      ))}
    </div>
  )
}

// ── Collapsible section ────────────────────────────────────────────────────────
function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-800 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-200 transition-colors"
      >
        {title}
        {open ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

// ── Tool enablement panel ─────────────────────────────────────────────────────
function ToolEnablementPanel({
  tools,
  planStepTools,
  value,
  onChange,
}: {
  tools: string[]
  planStepTools: Set<string>
  value: ToolPermission[]
  onChange: (perms: ToolPermission[]) => void
}) {
  const permMap = new Map(value.map((p) => [p.name, p]))

  const update = (name: string, patch: Partial<ToolPermission>) => {
    const current = permMap.get(name) ?? defaultToolPermission(name)
    const next = value.map((p) =>
      p.name === name ? { ...p, ...patch } : p
    )
    // If not in list yet, add
    if (!permMap.has(name)) {
      onChange([...value, { ...current, ...patch }])
    } else {
      onChange(next)
    }
  }

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-700 px-3 py-2">
        <Wrench size={12} className="text-gray-400" aria-hidden="true" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Tools ({tools.length})
        </span>
        <span className="ml-auto text-[10px] text-gray-600">enable before running</span>
      </div>
      <div className="divide-y divide-gray-700/60">
        {tools.map((name) => {
          const perm = permMap.get(name) ?? defaultToolPermission(name)
          const likelyWrite = inferToolAccess(name) === 'write'
          const isWriteSelected = perm.access === 'write'
          return (
            <div
              key={name}
              className={`px-3 py-2.5 space-y-2 ${isWriteSelected ? 'bg-amber-950/10' : ''}`}
            >
              <div className="flex items-center gap-2">
                {/* Enable toggle */}
                <input
                  type="checkbox"
                  id={`tool-enable-${name}`}
                  checked={perm.enabled}
                  onChange={(e) => update(name, { enabled: e.target.checked })}
                  className="accent-blue-500"
                />
                {/* Name + badges */}
                <label
                  htmlFor={`tool-enable-${name}`}
                  className={`flex-1 text-xs font-mono cursor-pointer ${perm.enabled ? 'text-gray-100' : 'text-gray-500'}`}
                >
                  {name}
                </label>
                {planStepTools.has(name) && (
                  <span className="rounded-full bg-blue-900/40 border border-blue-800 px-1.5 py-0.5 text-[10px] text-blue-300">
                    plan
                  </span>
                )}
                {likelyWrite && (
                  <span className="text-[10px] text-amber-500" title="This tool may need write access">⚠</span>
                )}
                {/* Access selector */}
                <select
                  value={perm.access}
                  onChange={(e) => update(name, { access: e.target.value as 'read' | 'write' })}
                  disabled={!perm.enabled}
                  className={`rounded-lg border px-1.5 py-0.5 text-[10px] font-medium bg-gray-900 transition-colors disabled:opacity-40 focus:outline-none ${
                    isWriteSelected
                      ? 'border-amber-700 text-amber-300'
                      : 'border-gray-700 text-gray-300'
                  }`}
                >
                  <option value="read">read</option>
                  <option value="write">write</option>
                </select>
              </div>
              {/* Path allowlist */}
              {perm.enabled && (
                <input
                  type="text"
                  placeholder="Path allowlist: e.g. src/**, tests/** (empty = unrestricted)"
                  value={perm.pathAllowlist.join(', ')}
                  onChange={(e) =>
                    update(name, {
                      pathAllowlist: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-2 py-1 text-[11px] text-gray-300 placeholder-gray-600 focus:border-blue-600 focus:outline-none"
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Tool audit view (read-only, shown after run starts) ───────────────────────
function ToolAuditView({ permissions }: { permissions: ToolPermission[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Lock size={12} className="text-gray-500" aria-hidden="true" />
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Tool Audit — frozen at run start
        </span>
        {open ? <ChevronUp size={12} className="text-gray-600" /> : <ChevronDown size={12} className="text-gray-600" />}
      </button>
      {open && (
        <div className="divide-y divide-gray-700/60 border-t border-gray-700">
          {permissions.map((p) => (
            <div key={p.name} className="flex items-center gap-2 px-3 py-2 text-xs">
              {p.enabled
                ? <CheckCircle2 size={11} className="shrink-0 text-emerald-500" aria-hidden="true" />
                : <XCircle size={11} className="shrink-0 text-gray-600" aria-hidden="true" />
              }
              <span className={`flex-1 font-mono ${p.enabled ? 'text-gray-200' : 'text-gray-600'}`}>{p.name}</span>
              {p.enabled && (
                <>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${
                    p.access === 'write'
                      ? 'border-amber-700 bg-amber-950/30 text-amber-300'
                      : 'border-gray-700 bg-gray-800 text-gray-400'
                  }`}>
                    {p.access}
                  </span>
                  <span className="text-[10px] text-gray-600">
                    {p.pathAllowlist.length ? p.pathAllowlist.join(', ') : 'unrestricted'}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Pre-flight gate ────────────────────────────────────────────────────────────
function PreflightGate({
  approvals,
  onConfirm,
  loading,
  error,
}: {
  approvals: string[]
  onConfirm: () => void
  loading: boolean
  error: string | null
}) {
  const [checked, setChecked] = useState<boolean[]>(() => approvals.map(() => false))
  const allChecked = approvals.length === 0 || checked.every(Boolean)

  return (
    <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-3 space-y-2">
      {approvals.length > 0 && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">
            Confirm before running
          </p>
          <ul className="space-y-1.5">
            {approvals.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id={`approval-${i}`}
                  checked={checked[i]}
                  onChange={(e) => {
                    const next = [...checked]
                    next[i] = e.target.checked
                    setChecked(next)
                  }}
                  className="mt-0.5 accent-amber-500"
                />
                <label htmlFor={`approval-${i}`} className="text-xs text-amber-200 cursor-pointer">
                  {item}
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && (
        <p className="text-xs text-rose-400">{error}</p>
      )}
      <button
        type="button"
        onClick={onConfirm}
        disabled={!allChecked || loading}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {loading
          ? <><Loader2 size={12} className="animate-spin" aria-hidden="true" /> Starting…</>
          : <><Play size={12} aria-hidden="true" /> Start Run</>
        }
      </button>
    </div>
  )
}

// ── Run status indicator ───────────────────────────────────────────────────────
function RunStatusIndicator({
  runId,
  runMode,
  runStatus,
  verificationStatus,
}: {
  runId: string
  runMode?: string | null
  runStatus: string | null
  verificationStatus?: string | null
}) {
  const status = runStatus ?? 'queued'
  const monitorHref = getRunMonitorHref(runId, runMode)
  const isTerminal = TERMINAL_RUN_STATUSES.has(status)
  const isCompleted = status === 'completed'
  const isBlockedRequirements = status === 'blocked_requirements' || status === 'needs_requirements'
  const isNeedsRequirements = isCompleted && verificationStatus === 'needs_requirements'
  const isVerified = isCompleted && verificationStatus === 'passed'

  const cls = isVerified
    ? 'border-emerald-600 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-950/60'
    : isBlockedRequirements
      ? 'border-amber-700 bg-amber-950/30 text-amber-200 hover:bg-amber-950/50'
    : isNeedsRequirements
      ? 'border-amber-700 bg-amber-950/30 text-amber-200 hover:bg-amber-950/50'
    : isCompleted
      ? 'border-emerald-700 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-950/50'
      : isTerminal
        ? 'border-rose-700 bg-rose-950/30 text-rose-300 hover:bg-rose-950/50'
        : 'border-blue-800/60 bg-blue-950/20 text-blue-300 hover:bg-blue-950/40'

  return (
    <Link
      href={monitorHref}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-colors ${cls}`}
    >
      {!isTerminal && <Radio size={12} className="animate-pulse" aria-hidden="true" />}
      {isVerified && <ShieldCheck size={12} aria-hidden="true" />}
      {isBlockedRequirements && <AlertTriangle size={12} aria-hidden="true" />}
      {isNeedsRequirements && <AlertTriangle size={12} aria-hidden="true" />}
      {isCompleted && !isVerified && !isNeedsRequirements && <CheckCircle2 size={12} aria-hidden="true" />}
      {isTerminal && !isCompleted && <XCircle size={12} aria-hidden="true" />}
      <span>
        {!isTerminal
          ? `Running… (${status})`
          : isBlockedRequirements
            ? 'Needs requirements'
          : isVerified
            ? 'Run verified'
            : isNeedsRequirements
              ? 'Needs requirements'
            : isCompleted
              ? 'Run completed'
              : `Run ${status}`}
      </span>
      <span className="ml-auto font-mono text-[10px] opacity-50">{runId.slice(0, 14)}</span>
      <ArrowRight size={11} className="opacity-50" aria-hidden="true" />
    </Link>
  )
}

// ── Proposal panel ────────────────────────────────────────────────────────────
function ProposalPanel({
  proposal,
  onApprove,
  onReject,
  onEdit,
  runId,
  runStatus,
  verificationStatus,
  onStartRun,
  startRunLoading,
  startRunError,
  allTools,
  planStepTools,
  toolPermissions,
  onToolPermissionsChange,
}: {
  proposal: Proposal
  onApprove: () => void
  onReject: () => void
  onEdit: () => void
  runId: string | null
  runStatus: string | null
  verificationStatus?: string | null
  onStartRun: () => void
  startRunLoading: boolean
  startRunError: string | null
  allTools: string[]
  planStepTools: Set<string>
  toolPermissions: ToolPermission[]
  onToolPermissionsChange: (p: ToolPermission[]) => void
}) {
  const isApproved = ['approved', 'running', 'completed'].includes(proposal.status)
  const isRejected = proposal.status === 'rejected'
  const isRunning = proposal.status === 'running'
  const isCompleted = proposal.status === 'completed'
  const isMaintainJob = proposal.run_recipe?.jobType === 'maintain_existing_app'
  const runMonitorHref = runId ? getRunMonitorHref(runId, proposal.run_recipe?.mode) : null

  return (
    <div className="flex flex-col rounded-2xl border border-gray-700 bg-gray-900 overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-blue-400" aria-hidden="true" />
          <span className="text-sm font-semibold text-white">Proposal</span>
          {proposal.status === 'approved' && (
            <span className="rounded-full bg-emerald-900/50 border border-emerald-700 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
              Approved
            </span>
          )}
          {isRunning && (
            <span className="rounded-full bg-blue-900/50 border border-blue-700 px-2 py-0.5 text-[11px] font-semibold text-blue-300">
              Running
            </span>
          )}
          {isCompleted && (
            <span className="rounded-full bg-emerald-900/50 border border-emerald-700 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
              Completed
            </span>
          )}
          {isRejected && (
            <span className="rounded-full bg-gray-800 border border-gray-700 px-2 py-0.5 text-[11px] font-semibold text-gray-400">
              Rejected
            </span>
          )}
          {proposal.confidence && (
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${CONFIDENCE_COLORS[proposal.confidence.level]}`}
              title={proposal.confidence.reasoning}
            >
              {proposal.confidence.level === 'high' ? '↑' : proposal.confidence.level === 'low' ? '↓' : '~'}{' '}
              {proposal.confidence.level} confidence
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono text-gray-600">{proposal.id.slice(0, 20)}</span>
      </div>

      {/* Goal */}
      <div className="border-b border-gray-800 bg-gray-800/30 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Goal</p>
        <p className="text-sm font-medium text-white">{proposal.goal.summary}</p>
        {proposal.goal.context && (
          <p className="mt-1 text-xs text-gray-400">{proposal.goal.context}</p>
        )}
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Estimate */}
        {(proposal.estimate.time || proposal.estimate.cost) && (
          <div className="flex items-center gap-4 border-b border-gray-800 px-4 py-3 text-xs text-gray-300">
            {proposal.estimate.time && (
              <span className="flex items-center gap-1.5">
                <Clock size={12} className="text-gray-500" aria-hidden="true" />
                {proposal.estimate.time}
              </span>
            )}
            {proposal.estimate.cost && (
              <span className="flex items-center gap-1.5">
                <Coins size={12} className="text-gray-500" aria-hidden="true" />
                {proposal.estimate.cost}
              </span>
            )}
          </div>
        )}

        {/* Plan steps */}
        <CollapsibleSection title={`Plan (${proposal.plan.steps.length} steps)`}>
          <ol className="space-y-2">
            {proposal.plan.steps.map((step) => (
              <li key={step.id} className="flex gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-800 text-[10px] font-bold text-gray-400">
                  {step.id}
                </span>
                <div>
                  <p className="text-xs font-semibold text-gray-200">{step.title}</p>
                  <p className="text-xs text-gray-500">{step.description}</p>
                  {step.agent && (
                    <span className="mt-0.5 inline-block text-[10px] text-blue-400">→ {step.agent}</span>
                  )}
                  {step.tool && (
                    <span className="mt-0.5 ml-1 inline-block text-[10px] text-purple-400">🔧 {step.tool}</span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </CollapsibleSection>

        {/* Recommended */}
        <CollapsibleSection title="Recommended">
          <div className="space-y-2">
            {proposal.recommended.agents.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600">Agents</p>
                <PillList items={proposal.recommended.agents} color="blue" />
              </div>
            )}
            {proposal.recommended.prompts.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600">Prompts</p>
                <PillList items={proposal.recommended.prompts} color="purple" />
              </div>
            )}
            {proposal.recommended.tools.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600">Tools</p>
                <PillList items={proposal.recommended.tools} />
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* Acceptance checks */}
        {proposal.acceptance_checks.length > 0 && (
          <CollapsibleSection title="Acceptance checks" defaultOpen={false}>
            <ul className="space-y-1">
              {proposal.acceptance_checks.map((check, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                  <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden="true" />
                  {check}
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        )}

        {/* Assumptions */}
        {(proposal.assumptions ?? []).length > 0 && (
          <CollapsibleSection title={`Assumptions (${proposal.assumptions!.length})`} defaultOpen>
            <ul className="space-y-1">
              {proposal.assumptions!.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                  <span className="mt-0.5 shrink-0 text-amber-400">⚠</span>
                  {a}
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        )}

        {/* Risks */}
        {proposal.risks.length > 0 && (
          <CollapsibleSection title="Risks" defaultOpen={false}>
            <ul className="space-y-2">
              {proposal.risks.map((risk, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
                  <span>
                    <RiskBadge level={risk.level} />
                    <span className="ml-1.5">{risk.description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        )}

        {/* Approvals */}
        {proposal.approvals.required.length > 0 && (
          <CollapsibleSection title="Required approvals" defaultOpen={false}>
            <ul className="space-y-1">
              {proposal.approvals.required.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                  <span className="mt-0.5 text-amber-400">⚠</span>
                  {a}
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        )}
      </div>

      {/* Draft action buttons */}
      {!isApproved && !isRejected && (
        <div className="border-t border-gray-800 p-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onApprove}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <CheckCircle2 size={13} aria-hidden="true" /> Approve
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-xs font-medium text-gray-300 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Edit3 size={13} aria-hidden="true" /> Edit
          </button>
          <button
            type="button"
            onClick={onReject}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-xs font-medium text-gray-400 hover:text-rose-300 hover:border-rose-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            <XCircle size={13} aria-hidden="true" /> Reject
          </button>
        </div>
      )}

      {/* Approved footer */}
      {isApproved && (
        <div className="border-t border-gray-800 p-3 space-y-2">
          {/* Tool enablement (before run) or audit view (after run) */}
          {!isMaintainJob && (
            <>
              {runId ? (
                <>
                  <RunStatusIndicator
                    runId={runId}
                    runMode={proposal.run_recipe?.mode}
                    runStatus={runStatus}
                    verificationStatus={verificationStatus}
                  />
                  {toolPermissions.length > 0 && (
                    <ToolAuditView permissions={toolPermissions} />
                  )}
                </>
              ) : (
                <>
                  {allTools.length > 0 && (
                    <ToolEnablementPanel
                      tools={allTools}
                      planStepTools={planStepTools}
                      value={toolPermissions}
                      onChange={onToolPermissionsChange}
                    />
                  )}
                  <PreflightGate
                    approvals={proposal.approvals.required}
                    onConfirm={onStartRun}
                    loading={startRunLoading}
                    error={startRunError}
                  />
                </>
              )}
            </>
          )}

          {/* Navigation links */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">
              {runId ? 'View in:' : 'Or open in:'}
            </p>
            {runId && (
              <Link
                href={runMonitorHref ?? `/runs/${encodeURIComponent(runId)}`}
                className="flex items-center justify-between rounded-xl border border-blue-800 bg-blue-950/30 px-3 py-2 text-xs font-medium text-blue-200 hover:border-blue-600 hover:text-white transition-colors"
              >
                Open Run Monitor
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            )}
            <Link
              href={`/orchestrator?draft=${proposal.id}`}
              className="flex items-center justify-between rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-xs font-medium text-gray-200 hover:border-blue-700 hover:text-white transition-colors"
            >
              Open in Playground
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
            {isMaintainJob && (
              <Link
                href={`/engine?draft=${proposal.id}`}
                className="flex items-center justify-between rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-xs font-medium text-gray-200 hover:border-blue-700 hover:text-white transition-colors"
              >
                Open in App Factory
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Confidence colors ──────────────────────────────────────────────────────────
const CONFIDENCE_COLORS = {
  high: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  medium: 'bg-blue-900/50 text-blue-300 border-blue-700',
  low: 'bg-amber-900/50 text-amber-300 border-amber-700',
} as const

// ── Mode selector ──────────────────────────────────────────────────────────────
function ModeSelector({
  value,
  onChange,
}: {
  value: ConciergeMode
  onChange: (m: ConciergeMode) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 shrink-0">
        Mode
      </span>
      <div className="flex items-center gap-0.5 rounded-xl border border-gray-800 bg-gray-900 p-0.5">
        {CONCIERGE_MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            title={m.description}
            onClick={() => onChange(m.value)}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              value === m.value
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Chat bubble ────────────────────────────────────────────────────────────────
function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const displayContent = isUser
    ? message.content
    : message.content.replace(/```json[\s\S]*?```/g, '*(Proposal generated — see panel →)*').trim()

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isUser ? 'bg-blue-600' : 'bg-gray-700'}`}>
        {isUser
          ? <User size={14} className="text-white" aria-hidden="true" />
          : <Bot size={14} className="text-blue-300" aria-hidden="true" />
        }
      </div>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'rounded-tr-sm bg-blue-600 text-white'
            : 'rounded-tl-sm bg-gray-800 text-gray-200'
        }`}
      >
        {renderChatContent(displayContent)}
      </div>
    </div>
  )
}

// ── Preflight card (Option B) ─────────────────────────────────────────────────
/**
 * Shown above the first AI reply when similar failed runs are found.
 * Summarises Overseer findings so the user can refine their goal before launching.
 */
function PreflightCard({
  insights,
  onDismiss,
}: {
  insights: PastRunInsight[]
  onDismiss: () => void
}) {
  const failures = insights.filter((r) => r.isFailure)
  const anyAgentErrors = insights.some((r) => r.agentErrors.length > 0)
  const anyOverseerWarnings = insights.some((r) => r.overseerWarnings.length > 0)

  return (
    <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-3.5 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle size={13} className="shrink-0 text-amber-400 mt-px" aria-hidden="true" />
          <span className="font-semibold text-amber-300">Run History Analysis</span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-amber-600 hover:text-amber-400 shrink-0 text-[10px] leading-none mt-0.5"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>

      <p className="mt-2 text-amber-200/80 leading-relaxed">
        Found <span className="font-medium text-amber-300">{insights.length} similar past run{insights.length !== 1 ? 's' : ''}</span>
        {failures.length > 0 && (
          <>, <span className="font-medium text-rose-400">{failures.length} of which failed</span></>
        )}.
        {' '}The Concierge has been briefed and will factor this into its advice.
      </p>

      {insights.slice(0, 2).map((r) => (
        <div key={r.runId} className="mt-2.5 rounded-lg border border-amber-900/40 bg-amber-950/40 px-3 py-2 space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                r.isFailure
                  ? 'bg-rose-900/60 text-rose-300'
                  : 'bg-emerald-900/60 text-emerald-300'
              }`}
            >
              {r.status}
            </span>
            <span className="text-amber-400/70 truncate">{r.goal.slice(0, 80)}</span>
          </div>
          {r.agentErrors.slice(0, 1).map((msg, i) => (
            <p key={i} className="text-amber-200/60 pl-0.5">
              ⚠ Agent error: {msg.slice(0, 120)}
            </p>
          ))}
          {r.runErrors.slice(0, 1).map((msg, i) => (
            <p key={i} className="text-rose-300/60 pl-0.5">
              ✖ {msg.slice(0, 120)}
            </p>
          ))}
        </div>
      ))}

      {(anyAgentErrors || anyOverseerWarnings) && (
        <p className="mt-2 text-amber-400/60 italic">
          Overseer observations have been included in the Concierge&apos;s context.
        </p>
      )}
    </div>
  )
}

// ── Overseer history panel (Option C) ────────────────────────────────────────
/**
 * Shown in the proposal sidebar when there are Overseer findings from similar past runs.
 * Gives the user visibility into what the Overseer detected and advised.
 */
function OverseerHistoryPanel({ insights }: { insights: PastRunInsight[] }) {
  const relevant = insights.filter(
    (r) => r.agentErrors.length > 0 || r.overseerWarnings.length > 0 || r.overseerActions.length > 0,
  )
  if (!relevant.length) return null

  return (
    <div className="rounded-xl border border-purple-800/50 bg-purple-950/20 p-3.5 text-xs space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-1.5 rounded-full bg-purple-500" aria-hidden="true" />
        <span className="font-semibold text-purple-300 tracking-wide uppercase text-[10px]">
          Overseer History
        </span>
        <span className="ml-auto rounded px-1.5 py-0.5 bg-purple-900/50 text-purple-400 text-[10px]">
          internal · not shown to users
        </span>
      </div>

      {relevant.map((r) => (
        <div key={r.runId} className="space-y-1">
          <p className="text-purple-200/70 font-medium truncate">
            Run: {r.goal.slice(0, 70)}
          </p>
          {r.agentErrors.map((msg, i) => (
            <p key={`ae-${i}`} className="text-purple-300/60 pl-2 border-l border-purple-800/50">
              {msg.slice(0, 150)}
            </p>
          ))}
          {r.overseerWarnings
            .filter((m) => !m.includes('agent_output_error'))
            .slice(0, 2)
            .map((msg, i) => (
              <p key={`ow-${i}`} className="text-amber-300/50 pl-2 border-l border-amber-800/40">
                {msg.slice(0, 150)}
              </p>
            ))}
          {r.overseerActions.map((msg, i) => (
            <p key={`oa-${i}`} className="text-blue-300/50 pl-2 border-l border-blue-800/40">
              ↳ {msg.slice(0, 150)}
            </p>
          ))}
        </div>
      ))}

      <p className="text-purple-400/50 italic text-[10px]">
        Concierge has been briefed on these findings and will factor them into proposal generation.
      </p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
function ConciergePageContent() {
  const searchParams = useSearchParams()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [activeRecipe, setActiveRecipe] = useState<Recipe | null>(null)
  const [draftCount, setDraftCount] = useState(0)

  // Run state
  const [runId, setRunId] = useState<string | null>(null)
  const [runStatus, setRunStatus] = useState<string | null>(null)
  const [runVerificationStatus, setRunVerificationStatus] = useState<string | null>(null)
  const [startRunLoading, setStartRunLoading] = useState(false)
  const [startRunError, setStartRunError] = useState<string | null>(null)
  const seenEventCount = useRef(0)

  // Persistent run context: last run card + live event panel
  const [lastRunEntry, setLastRunEntry] = useState<RunContextEntry | null>(null)
  const [showEventPanel, setShowEventPanel] = useState(false)

  // Run history for self-healing loop (Options A / B / C)
  const [allRuns, setAllRuns] = useState<OrchestrationRun[]>([])
  const [preflight, setPreflight] = useState<PastRunInsight[]>([])
  const [preflightDismissed, setPreflightDismissed] = useState(false)

  // Mode preference — initialize with static default so SSR and first client render match,
  // then sync from localStorage after mount to avoid hydration mismatch.
  const [mode, setMode] = useState<ConciergeMode>(DEFAULT_PREFERENCES.conciergeMode)
  useEffect(() => {
    setMode(getConciergeMode())
  }, [])

  // Restore last run context on mount so the CurrentRunCard survives navigation.
  // We only restore if the run is within the last 24 hours and there's no
  // active in-page run already (runId would be set by the proposal param restore).
  useEffect(() => {
    const recent = listRecentRunContexts()
    if (recent.length > 0) {
      setLastRunEntry(recent[0])
    }
  }, [])

  // Tool permission state
  const [toolPermissions, setToolPermissions] = useState<ToolPermission[]>([])

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Derived tool lists from current proposal
  const allTools = useMemo(() => {
    if (!proposal) return []
    return Array.from(new Set([
      ...(proposal.recommended.tools ?? []),
      ...(proposal.plan.steps.map((s) => s.tool).filter(Boolean) as string[]),
    ]))
  }, [proposal])

  const planStepTools = useMemo(
    () => new Set(proposal?.plan.steps.map((s) => s.tool).filter(Boolean) as string[] ?? []),
    [proposal]
  )

  useEffect(() => {
    const recipeId = searchParams.get('recipe')
    if (!recipeId) {
      setActiveRecipe(null)
      return
    }
    const recipe = getRecipe(recipeId)
    if (!recipe) return
    setActiveRecipe(recipe)
    setInput((current) => {
      if (current.trim()) return current
      return recipe.suggestedGoal
        ? `Use the "${recipe.name}" recipe to ${recipe.suggestedGoal}`
        : `Use the "${recipe.name}" recipe for this application workflow`
    })
  }, [searchParams])

  // Restore a saved proposal when navigating from the Runs page (?proposal=id)
  useEffect(() => {
    const proposalId = searchParams.get('proposal')
    if (!proposalId) return
    const saved = getProposal(proposalId)
    if (saved) {
      setProposal(saved)
      setMessages(saved.conversation)
    }
  }, [searchParams])

  // Load all orchestration runs on mount — used for the self-healing loop (Options A/B/C)
  useEffect(() => {
    fetchOrchestrationRuns()
      .then((runs) => setAllRuns(runs))
      .catch(() => { /* API unavailable — graceful degradation, no history context */ })
  }, [])

  // Load draft count for footer callout
  useEffect(() => {
    setDraftCount(listProposals().filter((p) => p.status === 'draft' || p.status === 'approved').length)
  }, [proposal])

  // Scroll chat to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Init tool permissions when proposal changes
  useEffect(() => {
    if (!proposal) { setToolPermissions([]); return }
    const draft = getDraftRun(proposal.id)
    if (draft?.toolPermissions?.length) {
      setToolPermissions(draft.toolPermissions)
      return
    }
    setToolPermissions(allTools.map(defaultToolPermission))
  }, [proposal?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Run polling ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!runId || !proposal?.id) return

    const proposalId = proposal.id
    let cancelled = false
    let consecutiveErrors = 0
    const timer: { id: ReturnType<typeof setInterval> | undefined } = { id: undefined }

    const poll = async () => {
      if (cancelled) return
      try {
        const run = await fetchOrchestrationRun(runId)
        if (cancelled) return
        consecutiveErrors = 0

        const events = run.events ?? []
        const newEvents = events.slice(seenEventCount.current)
        seenEventCount.current += newEvents.length

        for (const event of newEvents) {
          const narration = narrateRunEvent(event)
          if (narration) {
            setMessages((prev) => [
              ...prev,
              {
                id: `run_ev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                role: 'assistant' as const,
                content: narration,
                timestamp: new Date().toISOString(),
              },
            ])
          }
        }

        if (run.status) {
          setRunStatus(run.status)
          if (run.verificationStatus) {
            setRunVerificationStatus(run.verificationStatus)
          }
          if (TERMINAL_RUN_STATUSES.has(run.status)) {
            cancelled = true
            clearInterval(timer.id)
            if (run.status === 'completed' || run.status === 'blocked_requirements' || run.status === 'needs_requirements') {
              if (run.verificationStatus === 'needs_requirements') {
                updateDraftRun(proposalId, { runStatus: 'pending' })
                const needsInfoMsg = buildRequirementsRequestMessage(run)
                if (needsInfoMsg) {
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: `run_req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                      role: 'assistant' as const,
                      content: needsInfoMsg,
                      timestamp: new Date().toISOString(),
                    },
                  ])
                }
              } else if (run.status === 'blocked_requirements' || run.status === 'needs_requirements') {
                updateDraftRun(proposalId, { runStatus: 'pending' })
                const needsInfoMsg = buildRequirementsRequestMessage(run)
                if (needsInfoMsg) {
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: `run_req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                      role: 'assistant' as const,
                      content: needsInfoMsg,
                      timestamp: new Date().toISOString(),
                    },
                  ])
                }
              } else {
                updateDraftRun(proposalId, { runStatus: 'completed' })
                const updated = updateProposalStatus(proposalId, 'completed')
                if (updated) setProposal(updated)
              }
            } else {
              updateDraftRun(proposalId, { runStatus: 'failed' })
            }
          }
        }
      } catch (e) {
        if (isOrchestratorApiHttpError(e)) {
          if (e.status === 404) {
            cancelled = true
            clearInterval(timer.id)
            setRunStatus('failed')
            return
          }
          if (e.status >= 500) {
            consecutiveErrors += 1
            if (consecutiveErrors >= 3) {
              cancelled = true
              clearInterval(timer.id)
            }
          }
        }
        console.warn('[Concierge] Poll error:', e)
      }
    }

    timer.id = setInterval(poll, 3000)
    void poll()

    return () => {
      cancelled = true
      clearInterval(timer.id)
    }
  }, [runId, proposal?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setError(null)

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    // ── Self-healing loop: preflight check on first user message ──────────────
    // Find similar past runs and inject their Overseer findings into the AI
    // system prompt so the Concierge can proactively guide the user (Options A/B).
    const contextBlocks: string[] = []
    const isFirstMessage = messages.filter((m) => m.role === 'user').length === 0
    if (isFirstMessage && allRuns.length > 0) {
      const insights = findSimilarRuns(text, allRuns)
      if (insights.length > 0) {
        setPreflight(insights)
        setPreflightDismissed(false)
        contextBlocks.push(buildRunHistoryPrompt(insights))
      }
    }
    if (activeRecipe) {
      contextBlocks.push(buildRecipeContextPrompt(activeRecipe))
    }

    try {
      const result = await sendConciergeMessage(
        messages,
        text,
        undefined,
        mode,
        contextBlocks.length > 0 ? contextBlocks.join('\n\n') : undefined
      )

      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: result.message,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])

      if (result.proposal) {
        const proposalWithRecipe = activeRecipe
          ? applyRecipeToProposal(result.proposal, activeRecipe)
          : result.proposal
        const saved = saveProposal(proposalWithRecipe)
        setProposal(saved)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }

  const handleModeChange = (m: ConciergeMode) => {
    setMode(m)
    setConciergeMode(m)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleApprove = () => {
    if (!proposal) return
    const updated = updateProposalStatus(proposal.id, 'approved')
    if (updated) {
      createDraftRunFromProposal(updated)
      setProposal(updated)
    }
  }

  const handleReject = () => {
    if (!proposal) return
    const updated = updateProposalStatus(proposal.id, 'rejected')
    if (updated) setProposal(updated)
  }

  const handleEdit = () => {
    setInput(`Please revise the proposal — `)
    textareaRef.current?.focus()
  }

  const handleToolPermissionsChange = (perms: ToolPermission[]) => {
    setToolPermissions(perms)
    if (proposal?.id) updateDraftRun(proposal.id, { toolPermissions: perms })
  }

  const handleStartRun = async () => {
    if (!proposal) return
    const draft = getDraftRun(proposal.id)
    if (!draft) {
      setStartRunError('Draft config not found. Try re-approving the proposal.')
      return
    }
    setStartRunLoading(true)
    setStartRunError(null)
    try {
      const run = await startOrchestratorRun(draft)

      // Freeze tool audit
      const now = new Date().toISOString()
      const auditTools = toolPermissions.map((p) =>
        p.enabled ? { ...p, enabledAt: now } : p
      )
      const audit: ToolAuditEntry = {
        id: proposal.id,
        proposalId: proposal.id,
        runId: run.id,
        startedAt: now,
        tools: auditTools,
      }
      saveToolAudit(audit)
      setToolPermissions(auditTools)

      // Update draft + proposal status
      updateDraftRun(draft.id, {
        activeRunId: run.id,
        runStatus: 'running',
        toolPermissions: auditTools,
      })
      const updated = updateProposalStatus(proposal.id, 'running')
      if (updated) setProposal(updated)

      seenEventCount.current = 0
      setRunId(run.id)
      setRunStatus(run.status ?? 'queued')

      // Persist run context to localStorage so the card survives navigation
      const contextEntry = saveRunContext({
        runId: run.id,
        goal: draft.goal,
        startedAt: now,
        mode: draft.mode,
        status: (run.status ?? 'queued') as RunContextStatus,
        proposalId: proposal.id,
      })
      setLastRunEntry(contextEntry)

      setMessages((prev) => [
        ...prev,
        {
          id: `run_start_${Date.now()}`,
          role: 'assistant' as const,
          content: buildKickoffRefinementMessage({
            proposal,
            draft,
            runId: run.id,
            toolPermissions: auditTools,
          }),
          timestamp: now,
        },
      ])
    } catch (e) {
      setStartRunError(String(e))
    } finally {
      setStartRunLoading(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col gap-4 md:flex-row">
      {/* ── Chat panel ── */}
      <div className="flex flex-1 flex-col rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden min-h-0">
        {/* Current / Last Run card — shown above the chat when a recent run exists */}
        {lastRunEntry && (
          <div className="shrink-0 border-b border-gray-800 p-3">
            <CurrentRunCard
              entry={lastRunEntry}
              onViewEvents={() => setShowEventPanel((v) => !v)}
              onStatusChange={(status) =>
                setLastRunEntry((prev) => prev ? { ...prev, status } : prev)
              }
            />
          </div>
        )}
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-gray-800 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
            <Bot size={16} className="text-white" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">Concierge</h1>
            <p className="text-[11px] text-gray-500">Describe your goal — I&apos;ll build a Proposal</p>
          </div>
          {draftCount > 0 && (
            <Link
              href="/runs"
              className="ml-auto text-[11px] text-blue-400 hover:underline"
            >
              {draftCount} draft{draftCount !== 1 ? 's' : ''} saved →
            </Link>
          )}
        </div>

        {activeRecipe && (
          <div className="border-b border-gray-800 bg-blue-950/20 px-4 py-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-300">
                  Active Recipe
                </p>
                <p className="mt-1 text-sm text-slate-200">
                  {activeRecipe.name}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  {activeRecipe.description}
                </p>
                <p className="mt-2 text-[11px] text-slate-500">
                  {activeRecipe.promptTitles.length > 0 ? `Prompts: ${activeRecipe.promptTitles.join(', ')} · ` : ''}
                  {activeRecipe.agentNames.length > 0 ? `Agents: ${activeRecipe.agentNames.join(', ')} · ` : ''}
                  {activeRecipe.tools.length > 0 ? `Tools: ${activeRecipe.tools.join(', ')}` : 'No tools preset'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveRecipe(null)}
                className="shrink-0 text-xs text-blue-300 hover:text-blue-100"
              >
                Ignore recipe
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Option B — preflight card: shown after first send when similar past runs exist */}
          {preflight.length > 0 && !preflightDismissed && messages.length > 0 && (
            <PreflightCard insights={preflight} onDismiss={() => setPreflightDismissed(true)} />
          )}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center pb-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-600/20 border border-blue-800/40 mb-4">
                <Sparkles size={24} className="text-blue-400" aria-hidden="true" />
              </div>
              <h2 className="text-base font-semibold text-white mb-2">What do you want to achieve?</h2>
              <p className="max-w-sm text-sm text-gray-400 leading-relaxed">
                Describe your goal in plain language. I&apos;ll ask a couple of questions, then generate a
                structured Proposal you can approve and run.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {[
                  'Refactor the auth module for readability',
                  'Write tests for the payments service',
                  'Add dark mode to the settings page',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setInput(suggestion)}
                    className="rounded-full border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
          {loading && (
            <div className="flex gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-700">
                <Bot size={14} className="text-blue-300" aria-hidden="true" />
              </div>
              <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-gray-800 px-3.5 py-2.5">
                <Loader2 size={14} className="animate-spin text-blue-400" aria-hidden="true" />
                <span className="text-sm text-gray-400">Thinking…</span>
              </div>
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-rose-800 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
              {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-800 p-3 space-y-2">
          <ModeSelector value={mode} onChange={handleModeChange} />
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your goal… (Enter to send, Shift+Enter for newline)"
              rows={2}
              className="flex-1 resize-none rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              disabled={loading}
              aria-label="Message Concierge"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Send message"
            >
              <Send size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Proposal panel ── */}
      <div className="w-full md:w-80 lg:w-96 flex flex-col min-h-0 gap-3 overflow-y-auto">
        {proposal ? (
          <ProposalPanel
            proposal={proposal}
            onApprove={handleApprove}
            onReject={handleReject}
            onEdit={handleEdit}
            runId={runId}
            runStatus={runStatus}
            verificationStatus={runVerificationStatus}
            onStartRun={handleStartRun}
            startRunLoading={startRunLoading}
            startRunError={startRunError}
            allTools={allTools}
            planStepTools={planStepTools}
            toolPermissions={toolPermissions}
            onToolPermissionsChange={handleToolPermissionsChange}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-gray-800 bg-gray-900/40 px-6 text-center">
            <Sparkles size={24} className="mb-3 text-gray-700" aria-hidden="true" />
            <p className="text-sm text-gray-600 leading-relaxed">
              Your Proposal will appear here once the Concierge has enough context to generate one.
            </p>
            <p className="mt-3 text-[11px] text-gray-700 leading-relaxed">
              Concierge creates proposals — runs are tracked in{' '}
              <Link href="/runs" className="text-blue-500 hover:underline">Observe → Runs</Link>.
            </p>
          </div>
        )}
        {/* Option C — Overseer history panel: visible when past-run Overseer data exists */}
        {preflight.length > 0 && (
          <OverseerHistoryPanel insights={preflight} />
        )}
      </div>

      {/* ── Live Event Panel (docked right drawer) ── */}
      {showEventPanel && lastRunEntry?.runId?.trim() && (
        <div className="w-full md:w-72 lg:w-80 flex-shrink-0 rounded-2xl border border-gray-800 overflow-hidden min-h-0">
          <LiveEventPanel
            runId={lastRunEntry.runId}
            onClose={() => setShowEventPanel(false)}
          />
        </div>
      )}
    </div>
  )
}

export default function ConciergePage() {
  return (
    <Suspense>
      <ConciergePageContent />
    </Suspense>
  )
}
