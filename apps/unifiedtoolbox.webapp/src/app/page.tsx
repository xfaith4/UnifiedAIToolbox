import Link from 'next/link'
import {
  ArrowRight,
  BookOpen,
  Bot,
  Brain,
  Compass,
  History,
  PlayCircle,
  Sparkles,
  Wrench,
} from 'lucide-react'
import { ROUTES } from '@/lib/nav/navConfig'

const STORY_STEPS = [
  {
    step: '01',
    title: 'Frame the application story',
    body: 'Start in Concierge to define what the application should accomplish, what is still unknown, and what a successful first chapter looks like.',
  },
  {
    step: '02',
    title: 'Assemble reusable building blocks',
    body: 'Move through prompts, agents, and tools as a recipe system. The goal is not just to run once, but to keep what worked reusable.',
  },
  {
    step: '03',
    title: 'Launch and supervise the build',
    body: 'Use Playground or App Lifecycle depending on how guided the execution needs to be. Follow the live chapter rather than raw system mechanics.',
  },
  {
    step: '04',
    title: 'Learn and branch the next chapter',
    body: 'Runs and Memory should make it obvious what changed, what blocked progress, and what should become part of the next proposal.',
  },
]

const ENTRY_POINTS = [
  {
    icon: Compass,
    label: 'Ideas',
    title: 'Start with a proposal, not a blank form.',
    body: 'Use Concierge when the application goal is still being shaped and you want the system to help scope the next move.',
    href: ROUTES.concierge,
    cta: 'Open Concierge',
  },
  {
    icon: PlayCircle,
    label: 'Build',
    title: 'Run a guided application workflow.',
    body: 'Use App Lifecycle for structured build and maintenance flows when the objective and acceptance path are already clear enough to execute.',
    href: ROUTES.appFactory,
    cta: 'Open App Lifecycle',
  },
  {
    icon: History,
    label: 'Runs',
    title: 'Review the active chapter and its evidence.',
    body: 'Use Runs to understand current execution, answer blockers, and decide whether to rerun, branch, or promote what just worked.',
    href: ROUTES.runs,
    cta: 'Open Runs',
  },
]

const RECIPE_SURFACES = [
  {
    icon: BookOpen,
    name: 'Prompt Library',
    detail: 'Keep instructions versioned, testable, and ready to reuse in proposals and runs.',
    href: ROUTES.prompts,
  },
  {
    icon: Bot,
    name: 'Agent Library',
    detail: 'Define the cast: roles, mission boundaries, and operating style for each specialist.',
    href: ROUTES.agents,
  },
  {
    icon: Wrench,
    name: 'Tooling',
    detail: 'Control what external capabilities the cast can reach and keep tool access deliberate.',
    href: ROUTES.tooling,
  },
  {
    icon: Brain,
    name: 'Memory',
    detail: 'Promote lessons from runs so future proposals start with more judgment and less repetition.',
    href: ROUTES.knowledge,
  },
]

export default function HomePage() {
  return (
    <div className="space-y-16 pb-10">
      <section className="relative isolate overflow-hidden rounded-[36px] border border-slate-800/80 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.28),_transparent_42%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.16),_transparent_28%),linear-gradient(150deg,_rgba(15,23,42,0.96),_rgba(3,7,18,0.92))] px-6 py-8 sm:px-8 lg:px-12 lg:py-12">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/70 to-transparent" />
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)] lg:items-end">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-200">
              <Sparkles size={14} aria-hidden="true" />
              Unified AI Toolbox
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
              Build applications with an orchestration engine that writes the story with you.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Unified AI Toolbox already has the engine, the prompt library, the agent roster, and the run memory.
              Home should make those surfaces feel like one production pipeline instead of a shelf of separate tools.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={ROUTES.concierge}
                className="inline-flex items-center gap-2 rounded-full bg-blue-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-400"
              >
                Start with Concierge
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
              <Link
                href={ROUTES.appFactory}
                className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-950/45 px-5 py-3 text-sm font-medium text-slate-100 transition-colors hover:border-slate-500 hover:text-white"
              >
                Open App Lifecycle
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-transparent px-5 py-3 text-sm font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
              >
                Review system telemetry
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="border-t border-white/10 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
              Story model
            </p>
            <div className="mt-4 space-y-5">
              {[
                'Intent becomes a proposal with explicit risks and assumptions.',
                'Prompts, agents, and tools become a cast instead of separate inventories.',
                'Runs become readable chapters with artifacts, blockers, and decisions.',
                'Knowledge turns successful patterns into the next application move.',
              ].map((line, index) => (
                <div key={line} className="flex gap-4">
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-400/30 bg-blue-500/10 text-xs font-semibold text-blue-200">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-6 text-slate-300">{line}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            What the interface should do
          </p>
          <h2 className="mt-3 max-w-md text-3xl font-semibold tracking-tight text-white">
            Guide the user through one coherent application journey.
          </h2>
        </div>
        <div className="grid gap-0 border border-slate-800/90 bg-slate-900/45">
          {STORY_STEPS.map((item) => (
            <div
              key={item.step}
              className="grid gap-3 border-t border-slate-800/90 px-5 py-5 first:border-t-0 md:grid-cols-[72px_minmax(0,1fr)] md:items-start"
            >
              <div className="text-sm font-semibold tracking-[0.2em] text-slate-500">{item.step}</div>
              <div>
                <h3 className="text-lg font-medium text-white">{item.title}</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-8 border-y border-slate-800/90 py-8 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Entry points
          </p>
          <h2 className="mt-3 max-w-sm text-3xl font-semibold tracking-tight text-white">
            Start from the right doorway for the work in front of you.
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {ENTRY_POINTS.map((entry) => {
            const Icon = entry.icon
            return (
              <div key={entry.title} className="border-l border-slate-800 pl-5 first:border-l-0 first:pl-0">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  <Icon size={14} aria-hidden="true" className="text-blue-300" />
                  {entry.label}
                </div>
                <h3 className="mt-3 text-xl font-medium text-white">{entry.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{entry.body}</p>
                <Link
                  href={entry.href}
                  className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-slate-200 transition-colors hover:text-white"
                >
                  {entry.cta}
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            )
          })}
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Reusable system
          </p>
          <h2 className="mt-3 max-w-sm text-3xl font-semibold tracking-tight text-white">
            Treat prompts, agents, tools, and memory as one evolving recipe library.
          </h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {RECIPE_SURFACES.map((surface) => {
            const Icon = surface.icon
            return (
              <Link
                key={surface.name}
                href={surface.href}
                className="group border-t border-slate-800 py-4 transition-colors hover:border-slate-600"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <Icon size={16} aria-hidden="true" className="text-blue-300" />
                  {surface.name}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-400 transition-colors group-hover:text-slate-300">
                  {surface.detail}
                </p>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
