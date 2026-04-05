'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowRight,
  BookOpen,
  Bot,
  Brain,
  Compass,
  History,
  PlayCircle,
  Settings2,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { ROUTES } from '@/lib/nav/navConfig'

type StoryLink = {
  href: string
  label: string
}

type StoryBanner = {
  stage: string
  title: string
  description: string
  icon: LucideIcon
  signals: [string, string, string]
  links: StoryLink[]
}

function getBanner(pathname: string): StoryBanner | null {
  if (pathname === ROUTES.home) return null

  if (pathname === ROUTES.concierge) {
    return {
      stage: 'Ideas',
      title: 'Turn intent into a proposal before you launch work.',
      description:
        'Concierge is the guided intake surface. Use it to clarify the story, capture assumptions, and create a build-ready proposal.',
      icon: Compass,
      signals: ['Define the outcome', 'Clarify blockers', 'Approve the next move'],
      links: [
        { href: ROUTES.appFactory, label: 'Open App Lifecycle' },
        { href: ROUTES.runs, label: 'Review active runs' },
      ],
    }
  }

  if (pathname === ROUTES.prompts) {
    return {
      stage: 'Recipes',
      title: 'Shape reusable prompt assets for future builds.',
      description:
        'Prompt Library is where instructions become durable building blocks. Refine them here, then reuse them in proposals and orchestration runs.',
      icon: BookOpen,
      signals: ['Curate voice and structure', 'Version what works', 'Reuse in future runs'],
      links: [
        { href: ROUTES.agents, label: 'Open Agent Library' },
        { href: ROUTES.concierge, label: 'Start a proposal' },
      ],
    }
  }

  if (pathname === ROUTES.agents) {
    return {
      stage: 'Recipes',
      title: 'Assemble the cast that will build and review your work.',
      description:
        'Agent Library defines roles, missions, and operating constraints. Keep agents sharp here, then compose them into an orchestration team.',
      icon: Bot,
      signals: ['Define role boundaries', 'Tune responsibilities', 'Reuse winning teams'],
      links: [
        { href: ROUTES.prompts, label: 'Review prompts' },
        { href: ROUTES.playground, label: 'Launch in Playground' },
      ],
    }
  }

  if (pathname === ROUTES.tooling) {
    return {
      stage: 'Admin',
      title: 'Govern the tools your agents can reach.',
      description:
        'Tooling is the control surface for MCP servers and capability access. Keep it deliberate so runs stay auditable and least-privilege by default.',
      icon: Wrench,
      signals: ['Register capabilities', 'Control access', 'Protect execution boundaries'],
      links: [
        { href: ROUTES.concierge, label: 'Start with Concierge' },
        { href: ROUTES.runs, label: 'Inspect run audit trails' },
      ],
    }
  }

  if (pathname === ROUTES.playground) {
    return {
      stage: 'Build',
      title: 'Launch flexible orchestration once the story and cast are ready.',
      description:
        'Playground is the exploratory execution surface for prompt-led, multi-agent, repo, and swarm workflows. Use it when you want more direct control.',
      icon: PlayCircle,
      signals: ['Tune the execution mode', 'Launch the cast', 'Observe progress live'],
      links: [
        { href: ROUTES.concierge, label: 'Refine the proposal first' },
        { href: ROUTES.runs, label: 'Watch live runs' },
      ],
    }
  }

  if (pathname === ROUTES.appFactory) {
    return {
      stage: 'Build',
      title: 'Run structured application-building and maintenance flows.',
      description:
        'App Lifecycle is the guided execution environment for turning a scoped objective into artifacts, quality checks, and a reviewable outcome.',
      icon: PlayCircle,
      signals: ['Start from a defined objective', 'Track the active chapter', 'Review the resulting artifacts'],
      links: [
        { href: ROUTES.concierge, label: 'Create a proposal' },
        { href: ROUTES.runs, label: 'Open run history' },
      ],
    }
  }

  if (pathname === ROUTES.runs || pathname.startsWith('/runs/')) {
    return {
      stage: 'Runs',
      title: 'Read execution as a story, not just a status feed.',
      description:
        'Runs collect the evidence trail: state, events, blockers, artifacts, and outcomes. This is where users should understand what happened and decide what happens next.',
      icon: History,
      signals: ['Inspect the active chapter', 'Answer blockers quickly', 'Branch or rerun with intent'],
      links: [
        { href: ROUTES.knowledge, label: 'Open Memory' },
        { href: ROUTES.concierge, label: 'Start a new proposal' },
      ],
    }
  }

  if (pathname === ROUTES.knowledge) {
    return {
      stage: 'Memory',
      title: 'Turn previous runs into reusable judgment.',
      description:
        'Memory is the compounding layer. Capture blockers, fixes, and patterns here so the next proposal starts smarter than the last one.',
      icon: Brain,
      signals: ['Compare outcomes', 'Promote lessons', 'Feed the next proposal'],
      links: [
        { href: ROUTES.runs, label: 'Review recent runs' },
        { href: ROUTES.concierge, label: 'Start the next chapter' },
      ],
    }
  }

  if (pathname === ROUTES.reports || pathname === '/dashboard') {
    return {
      stage: 'Observe',
      title: 'Use telemetry to steer the portfolio, not replace the story.',
      description:
        'Analytics, reports, and system telemetry are best used as operator context around active initiatives. Start from the mission, then validate it here.',
      icon: History,
      signals: ['Read the system pulse', 'Spot drift early', 'Return to a live initiative'],
      links: [
        { href: ROUTES.home, label: 'Go to Home' },
        { href: ROUTES.runs, label: 'Open active runs' },
      ],
    }
  }

  if (pathname === ROUTES.settings) {
    return {
      stage: 'Admin',
      title: 'Set the guardrails for how the system guides and executes.',
      description:
        'Settings control local credentials and operator guidance mode. Keep this surface lean so execution choices remain visible and intentional.',
      icon: Settings2,
      signals: ['Store local preferences', 'Adjust guidance style', 'Return to the workflow quickly'],
      links: [
        { href: ROUTES.concierge, label: 'Back to Concierge' },
        { href: ROUTES.home, label: 'Go to Home' },
      ],
    }
  }

  return null
}

export function RouteStoryBanner() {
  const pathname = usePathname()
  const banner = getBanner(pathname)

  if (!banner) return null

  const Icon = banner.icon

  return (
    <section className="overflow-hidden rounded-[28px] border border-gray-800/90 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.22),_transparent_42%),linear-gradient(145deg,_rgba(15,23,42,0.9),_rgba(3,7,18,0.88))]">
      <div className="flex flex-col gap-6 px-5 py-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-7">
        <div className="max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-200">
            <Icon size={14} aria-hidden="true" />
            {banner.stage}
          </div>
          <h1 className="max-w-2xl text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {banner.title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-[15px]">
            {banner.description}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {banner.links.map((link) => (
            <Link
              key={`${pathname}-${link.href}`}
              href={link.href}
              className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-950/55 px-4 py-2 text-sm text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
            >
              {link.label}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-0 border-t border-white/10 md:grid-cols-3">
        {banner.signals.map((signal) => (
          <div key={signal} className="border-t border-white/10 px-5 py-3 text-sm text-slate-300 md:border-t-0 md:border-l md:border-white/10 first:border-l-0 sm:px-6 lg:px-7">
            {signal}
          </div>
        ))}
      </div>
    </section>
  )
}
