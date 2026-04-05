'use client'

import { useState } from 'react'
import { X, ChevronRight, ChevronLeft, Home, BookOpen, PlayCircle, History, Settings, HelpCircle } from 'lucide-react'

const STORAGE_KEY = 'utb_tour_dismissed_v2'

// ── Tour steps ────────────────────────────────────────────────────────────────
interface TourStep {
  title: string
  body: string
  icon: React.ElementType
  iconColor: string
}

const STEPS: TourStep[] = [
  {
    title: 'Welcome to Unified AI Toolbox',
    body: 'This quick tour walks you through the story-led workflow so you can move from idea to execution without guessing which surface to open next. Takes about 30 seconds.',
    icon: Home,
    iconColor: 'text-blue-400',
  },
  {
    title: 'Home — orient the next chapter',
    body: 'Home is now the narrative front door. Start a proposal, jump into a build, or review the current chapter before you dive into telemetry or execution detail.',
    icon: Home,
    iconColor: 'text-blue-400',
  },
  {
    title: 'Build reusable recipes',
    body: 'Prompt Library, Agent Library, and Tooling (MCP) work best as one recipe system. Shape reusable prompts, define the cast, and control which tools they can reach.',
    icon: BookOpen,
    iconColor: 'text-purple-400',
  },
  {
    title: 'Run the work in the right mode',
    body: 'Concierge helps you frame a proposal first. Playground is the flexible orchestration surface, while App Lifecycle is for guided application-build and maintenance flows.',
    icon: PlayCircle,
    iconColor: 'text-emerald-400',
  },
  {
    title: 'Observe what happened and what changed',
    body: 'Runs gives you the evidence trail for each chapter. Knowledge captures what should be promoted into future proposals, while Reports remains the telemetry and trend layer.',
    icon: History,
    iconColor: 'text-amber-400',
  },
  {
    title: 'Configure — API keys & Concierge Mode',
    body: 'Settings holds your OpenAI key (required for real AI proposals) and your Concierge Mode — choose Guided, Confident, or Hands-off to control how the AI guides you. Everything stays local in your browser.',
    icon: Settings,
    iconColor: 'text-gray-400',
  },
  {
    title: 'Help is always one click away',
    body: 'The "Help & Docs" button at the bottom of the sidebar opens this reference panel from any page. You\'re all set!',
    icon: HelpCircle,
    iconColor: 'text-blue-400',
  },
]

// ── Progress dots ──────────────────────────────────────────────────────────────
function Dots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${current + 1} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-200 ${
            i === current ? 'w-4 bg-blue-400' : 'w-1.5 bg-gray-600'
          }`}
        />
      ))}
    </div>
  )
}

// ── Tour ──────────────────────────────────────────────────────────────────────
interface FirstLaunchTourProps {
  /** Called when the user clicks "Open Docs" from the final step */
  onOpenDocs?: () => void
}

export function FirstLaunchTour({ onOpenDocs }: FirstLaunchTourProps) {
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return false
    return !localStorage.getItem(STORAGE_KEY)
  })
  const [step, setStep] = useState(0)

  const dismiss = (permanent = true) => {
    if (permanent) localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1)
    } else {
      dismiss()
    }
  }

  const handlePrev = () => {
    setStep((s) => Math.max(0, s - 1))
  }

  const handleOpenDocsAndClose = () => {
    dismiss()
    onOpenDocs?.()
  }

  if (!visible) return null

  const current = STEPS[step]
  const StepIcon = current.icon
  const isLast = step === STEPS.length - 1
  const isFirst = step === 0

  return (
    <>
      {/* Backdrop (light, non-blocking) */}
      <div
        className="fixed inset-0 z-50 bg-gray-950/40 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={() => dismiss(false)}
      />

      {/* Tour card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Tour step ${step + 1} of ${STEPS.length}: ${current.title}`}
        className="fixed bottom-8 right-6 z-50 w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl"
      >
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Quick tour
          </span>
          <button
            type="button"
            onClick={() => dismiss()}
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Dismiss tour permanently"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-800">
              <StepIcon size={20} className={current.iconColor} aria-hidden="true" />
            </div>
            <h2 className="text-sm font-semibold text-white leading-snug">{current.title}</h2>
          </div>
          <p className="text-sm leading-relaxed text-gray-400">{current.body}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-800 px-5 py-3 gap-3">
          <Dots total={STEPS.length} current={step} />

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={handlePrev}
                className="flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-xs text-gray-300 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <ChevronLeft size={14} aria-hidden="true" /> Back
              </button>
            )}

            {isLast ? (
              <>
                <button
                  type="button"
                  onClick={handleOpenDocsAndClose}
                  className="rounded-lg border border-blue-700 bg-blue-900/50 px-3 py-1.5 text-xs font-medium text-blue-200 hover:bg-blue-800/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  Open Docs
                </button>
                <button
                  type="button"
                  onClick={() => dismiss()}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  Get started
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Next <ChevronRight size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* "Don't show again" link */}
        <div className="pb-3 text-center">
          <button
            type="button"
            onClick={() => dismiss()}
            className="text-[11px] text-gray-600 hover:text-gray-400 transition-colors underline underline-offset-2"
          >
            Don&apos;t show again
          </button>
        </div>
      </div>
    </>
  )
}
