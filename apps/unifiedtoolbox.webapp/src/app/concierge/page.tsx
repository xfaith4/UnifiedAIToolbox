'use client'

import { useEffect, useRef, useState } from 'react'
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
} from 'lucide-react'
import type { ChatMessage, Proposal, ProposalRisk } from '@/lib/types/proposal'
import { sendConciergeMessage } from '@/lib/services/conciergeAi'
import {
  saveProposal,
  updateProposalStatus,
  createDraftRunFromProposal,
  listProposals,
  getProposal,
} from '@/lib/services/proposalStore'

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

// ── Proposal panel ────────────────────────────────────────────────────────────
function ProposalPanel({
  proposal,
  onApprove,
  onReject,
  onEdit,
}: {
  proposal: Proposal
  onApprove: () => void
  onReject: () => void
  onEdit: () => void
}) {
  const isApproved = proposal.status === 'approved'
  const isRejected = proposal.status === 'rejected'

  return (
    <div className="flex flex-col rounded-2xl border border-gray-700 bg-gray-900 overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-blue-400" aria-hidden="true" />
          <span className="text-sm font-semibold text-white">Proposal</span>
          {isApproved && (
            <span className="rounded-full bg-emerald-900/50 border border-emerald-700 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
              Approved
            </span>
          )}
          {isRejected && (
            <span className="rounded-full bg-gray-800 border border-gray-700 px-2 py-0.5 text-[11px] font-semibold text-gray-400">
              Rejected
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

      {/* Action buttons */}
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

      {/* Approved — show open links */}
      {isApproved && (
        <div className="border-t border-gray-800 p-3 space-y-2">
          <p className="text-xs text-emerald-400 font-medium">
            Draft saved. Choose where to run it:
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href={`/orchestrator?draft=${proposal.id}`}
              className="flex items-center justify-between rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-xs font-medium text-gray-200 hover:border-blue-700 hover:text-white transition-colors"
            >
              Open in Playground
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
            <Link
              href={`/engine?draft=${proposal.id}`}
              className="flex items-center justify-between rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-xs font-medium text-gray-200 hover:border-blue-700 hover:text-white transition-colors"
            >
              Open in App Factory
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Chat bubble ────────────────────────────────────────────────────────────────
function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  // Strip JSON code blocks from assistant messages for display
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
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'rounded-tr-sm bg-blue-600 text-white'
            : 'rounded-tl-sm bg-gray-800 text-gray-200'
        }`}
      >
        {displayContent}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ConciergePage() {
  const searchParams = useSearchParams()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [draftCount, setDraftCount] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  // Load draft count for footer callout
  useEffect(() => {
    setDraftCount(listProposals().filter((p) => p.status === 'draft' || p.status === 'approved').length)
  }, [proposal])

  // Scroll chat to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setError(null)

    // Optimistically add user message
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    try {
      const result = await sendConciergeMessage(messages, text)

      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: result.message,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])

      if (result.proposal) {
        const saved = saveProposal(result.proposal)
        setProposal(saved)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
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

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col gap-4 md:flex-row">
      {/* ── Chat panel ── */}
      <div className="flex flex-1 flex-col rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden min-h-0">
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

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
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
        <div className="border-t border-gray-800 p-3">
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
      <div className="w-full md:w-80 lg:w-96 flex flex-col min-h-0">
        {proposal ? (
          <ProposalPanel
            proposal={proposal}
            onApprove={handleApprove}
            onReject={handleReject}
            onEdit={handleEdit}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-gray-800 bg-gray-900/40 px-6 text-center">
            <Sparkles size={24} className="mb-3 text-gray-700" aria-hidden="true" />
            <p className="text-sm text-gray-600 leading-relaxed">
              Your Proposal will appear here once the Concierge has enough context to generate one.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
