'use client'

import { useEffect, useRef } from 'react'
import { X, BookOpen, Lightbulb, Rocket, Wrench, HelpCircle, Sliders } from 'lucide-react'

interface DocsHubProps {
  open: boolean
  onClose: () => void
}

// ── Concept pill ──────────────────────────────────────────────────────────────
function ConceptPill({ term, definition }: { term: string; definition: string }) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/60 px-3 py-2">
      <span className="text-xs font-semibold text-blue-300">{term}</span>
      <p className="mt-0.5 text-xs text-gray-400">{definition}</p>
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────
function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-blue-400" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      <div>{children}</div>
    </section>
  )
}

// ── DocsHub ───────────────────────────────────────────────────────────────────
export function DocsHub({ open, onClose }: DocsHubProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Trap focus and handle Escape
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    panelRef.current?.focus()
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-gray-950/70 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Help and documentation"
        tabIndex={-1}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col overflow-y-auto border-l border-gray-800 bg-gray-900 shadow-2xl focus:outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <div className="flex items-center gap-2">
            <HelpCircle size={18} className="text-blue-400" aria-hidden="true" />
            <h1 className="text-base font-semibold text-white">Help &amp; Docs</h1>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Close help panel"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-8 px-6 py-6">
          {/* What this does */}
          <Section icon={BookOpen} title="What this does">
            <p className="text-sm text-gray-300 leading-relaxed">
              Unified AI Toolbox helps you turn an idea into an application chapter:
              define the intent, assemble the cast, run the work, and learn from the result.
              Prompts, agents, tools, runs, and memory are different surfaces on the same workflow.
            </p>
            <div className="mt-3 grid grid-cols-4 gap-1 text-center text-[11px]">
              {['Intent', 'Cast', 'Run', 'Learn'].map((stage, i) => (
                <div key={stage} className="flex items-center gap-1">
                  {i > 0 && <span className="text-gray-600">→</span>}
                  <span className="rounded-lg bg-gray-800 px-2 py-1 font-medium text-gray-200">
                    {stage}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          {/* Core concepts */}
          <Section icon={Lightbulb} title="Core concepts">
            <div className="grid grid-cols-2 gap-2">
              <ConceptPill
                term="Prompt"
                definition="A versioned instruction template stored in Prompt Library, with quality scoring and refinement history."
              />
              <ConceptPill
                term="Agent"
                definition="A named AI worker with a role, mission, triggers, and a bound prompt. Stored in Agent Library."
              />
              <ConceptPill
                term="Tool / MCP"
                definition="A server or capability registered in Tooling (MCP). Agents pick up tools at runtime."
              />
              <ConceptPill
                term="Run"
                definition="One orchestrated job — goal, agents, token usage, events, and final output."
              />
              <ConceptPill
                term="Gate"
                definition="A quality threshold. A run must pass its gates before it's considered successful."
              />
              <ConceptPill
                term="Report"
                definition="Aggregate analytics across many runs: trends, outliers, milestone progress."
              />
            </div>
          </Section>

          {/* Quick start */}
          <Section icon={Rocket} title="Quick start">
            <ol className="space-y-2 text-sm text-gray-300">
              <li className="flex gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">1</span>
                <span>Start at <strong className="text-white">Home</strong> or <strong className="text-white">Concierge</strong> and frame the application goal as a proposal.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">2</span>
                <span>Use <strong className="text-white">Prompt Library</strong>, <strong className="text-white">Agent Library</strong>, and <strong className="text-white">Tooling</strong> to shape reusable building blocks when the proposal needs them.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">3</span>
                <span>Launch execution in <strong className="text-white">Playground</strong> for flexible orchestration or <strong className="text-white">App Lifecycle</strong> for guided build and maintenance flows.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">4</span>
                <span>Review the evidence trail in <strong className="text-white">Runs</strong> and promote useful patterns into <strong className="text-white">Knowledge</strong>.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">5</span>
                <span>Use <strong className="text-white">Reports</strong> and telemetry when you need portfolio-level trend and quality context.</span>
              </li>
            </ol>
          </Section>

          {/* Concierge Modes */}
          <Section icon={Sliders} title="Concierge Modes">
            <div className="space-y-2 text-sm text-gray-300">
              <p className="text-xs text-gray-400 mb-2">
                Choose how the AI guides you when creating a proposal.
              </p>
              <details className="rounded-xl border border-gray-700 bg-gray-800/50 px-3 py-2">
                <summary className="cursor-pointer font-medium text-gray-200 hover:text-white">
                  Guided / Confident / Hands-off
                </summary>
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-gray-400">
                    <strong className="text-gray-200">Guided</strong> — asks 2–3 clarifying questions
                    before proposing. Best for complex or ambiguous tasks.
                  </p>
                  <p className="text-xs text-gray-400">
                    <strong className="text-gray-200">Confident</strong> — one clarifying turn then
                    a proposal. The balanced default.
                  </p>
                  <p className="text-xs text-gray-400">
                    <strong className="text-gray-200">Hands-off</strong> — generates a proposal on
                    the first message. Best for experienced users with clear goals.
                  </p>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Change mode in <strong className="text-gray-400">Settings → Concierge Mode</strong>,
                    or use the toggle above the Concierge chat input.
                  </p>
                </div>
              </details>
            </div>
          </Section>

          {/* Troubleshooting */}
          <Section icon={Wrench} title="Troubleshooting">
            <div className="space-y-2 text-sm text-gray-300">
              <details className="rounded-xl border border-gray-700 bg-gray-800/50 px-3 py-2">
                <summary className="cursor-pointer font-medium text-gray-200 hover:text-white">
                  Playground shows &quot;API unavailable&quot;
                </summary>
                <p className="mt-2 text-gray-400">
                  The orchestration bridge must be running on{' '}
                  <code className="rounded bg-gray-700 px-1 text-xs text-gray-200">
                    http://localhost:8000
                  </code>
                  . Start it via{' '}
                  <code className="rounded bg-gray-700 px-1 text-xs text-gray-200">
                    Start-Toolbox.ps1
                  </code>{' '}
                  or run the bridge manually.
                </p>
              </details>
              <details className="rounded-xl border border-gray-700 bg-gray-800/50 px-3 py-2">
                <summary className="cursor-pointer font-medium text-gray-200 hover:text-white">
                  Prompt / Agent not saving
                </summary>
                <p className="mt-2 text-gray-400">
                  Libraries persist to <code className="rounded bg-gray-700 px-1 text-xs text-gray-200">localStorage</code>. Check browser storage limits and ensure you&apos;re not in private/incognito mode.
                </p>
              </details>
              <details className="rounded-xl border border-gray-700 bg-gray-800/50 px-3 py-2">
                <summary className="cursor-pointer font-medium text-gray-200 hover:text-white">
                  AI refinement fails
                </summary>
                <p className="mt-2 text-gray-400">
                  An OpenAI API key is required. Set it in{' '}
                  <strong className="text-white">Configure → Settings</strong>.
                </p>
              </details>
              <details className="rounded-xl border border-gray-700 bg-gray-800/50 px-3 py-2">
                <summary className="cursor-pointer font-medium text-gray-200 hover:text-white">
                  Runs page shows no data
                </summary>
                <p className="mt-2 text-gray-400">
                  Runs are fetched from the orchestrator API. If the bridge is offline, only
                  locally-stored runs are shown. Launch an orchestration in Playground to create
                  your first run.
                </p>
              </details>
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 px-6 py-4">
          <p className="text-xs text-gray-500">
            Unified AI Toolbox · Press <kbd className="rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px] font-mono">Esc</kbd> to close
          </p>
        </div>
      </div>
    </>
  )
}
