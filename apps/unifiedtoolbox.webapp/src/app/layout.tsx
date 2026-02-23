'use client'

import './globals.css'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  Settings,
  Workflow,
  BookOpen,
  Bot,
  Sparkles,
  Wrench,
  PlayCircle,
  History,
  TrendingUp,
  Home,
  HelpCircle,
  MessageSquare,
  Brain,
  type LucideIcon,
} from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { installUxInstrumentation, trackUxEvent } from '@/lib/ux/telemetry'
import { UxDebugOverlay } from '@/components/ux/UxDebugOverlay'
import { NAV_LABELS, ROUTES } from '@/lib/nav/navConfig'
import { DocsHub } from '@/components/docs/DocsHub'
import { FirstLaunchTour } from '@/components/tour/FirstLaunchTour'

// ── Active-path helper ────────────────────────────────────────────────────────
// Treats redirect aliases as active for their canonical route.
const ACTIVE_ALIASES: Record<string, string> = {
  '/home': '/dashboard',
  '/overview': '/dashboard',
  '/playground': '/orchestrator',
  '/reports': '/milestones',
}

function isNavItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  const canonical = ACTIVE_ALIASES[pathname]
  return canonical === href
}

// ── Nav data (consumed from navConfig constants) ──────────────────────────────
type NavItem = { href: string; label: string; icon: LucideIcon }
type NavSection = { title: string; isSettings?: boolean; items: NavItem[] }

const navSections: NavSection[] = [
  {
    title: NAV_LABELS.sections.home,
    items: [
      { href: ROUTES.home, label: NAV_LABELS.items.home, icon: Home },
      { href: ROUTES.concierge, label: NAV_LABELS.items.concierge, icon: MessageSquare },
    ],
  },
  {
    title: NAV_LABELS.sections.build,
    items: [
      { href: ROUTES.prompts, label: NAV_LABELS.items.promptLibrary, icon: BookOpen },
      { href: ROUTES.agents, label: NAV_LABELS.items.agentLibrary, icon: Bot },
      { href: ROUTES.tooling, label: NAV_LABELS.items.tooling, icon: Wrench },
    ],
  },
  {
    title: NAV_LABELS.sections.run,
    items: [
      { href: ROUTES.playground, label: NAV_LABELS.items.playground, icon: PlayCircle },
      { href: ROUTES.appFactory, label: NAV_LABELS.items.appFactory, icon: Workflow },
    ],
  },
  {
    title: NAV_LABELS.sections.observe,
    items: [
      { href: ROUTES.runs, label: NAV_LABELS.items.runs, icon: History },
      { href: ROUTES.knowledge, label: NAV_LABELS.items.knowledge, icon: Brain },
      { href: ROUTES.reports, label: NAV_LABELS.items.reports, icon: TrendingUp },
    ],
  },
  {
    title: NAV_LABELS.sections.settings,
    isSettings: true,
    items: [{ href: ROUTES.settings, label: NAV_LABELS.items.settings, icon: Settings }],
  },
]

const baseLinkClass =
  'flex items-center gap-2 rounded-xl px-3 py-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900'
const inactiveLinkClass = 'text-gray-300 hover:bg-gray-800/70'
const activeLinkClass = 'bg-gray-800/90 text-white font-medium shadow-inner'

export default function RootLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [docsOpen, setDocsOpen] = useState(false)
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  useEffect(() => {
    installUxInstrumentation({
      getRoute: () => window.location.pathname,
    })
  }, [])

  useEffect(() => {
    trackUxEvent('page_view', { route: pathname })
  }, [pathname])

  const uxDebugEnabled = useMemo(() => {
    if (process.env.NODE_ENV === 'production') return false
    const qsEnabled = searchParams.get('uxdebug') === '1'
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('utb_uxdebug') === '1' : false

    if (qsEnabled && typeof window !== 'undefined') {
      window.localStorage.setItem('utb_uxdebug', '1')
    }

    return qsEnabled || stored
  }, [searchParams])

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-gray-950 text-gray-100">
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-white/90 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-gray-900"
          >
            Skip to main content
          </a>
          <div className="min-h-screen md:grid md:grid-cols-[260px_1fr]">
            {/* Mobile top bar */}
            <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-4 py-3 md:hidden">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
                  <Sparkles size={20} className="text-white" />
                </div>
                <div>
                  <div className="font-semibold">AI Toolbox</div>
                  <div className="text-[10px] text-gray-400">Unified Web App</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDocsOpen(true)}
                  className="rounded-md border border-gray-700 bg-gray-800/60 p-1.5 text-gray-300 hover:text-white"
                  aria-label="Open help and docs"
                >
                  <HelpCircle size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarOpen((prev) => !prev)}
                  className="rounded-md border border-gray-700 bg-gray-800/60 px-3 py-1 text-sm font-medium text-gray-100 shadow-sm"
                  aria-controls="sidebar-nav"
                >
                  {sidebarOpen ? 'Close' : 'Menu'}
                </button>
              </div>
            </div>

            {/* Overlay for mobile */}
            {sidebarOpen && (
              <button
                type="button"
                className="fixed inset-0 z-30 bg-gray-900/30 md:hidden"
                aria-label="Close sidebar"
                onClick={closeSidebar}
              />
            )}

            <aside
              id="sidebar-nav"
              className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-800 bg-gray-900 p-4 transition-transform duration-200 ease-out md:static md:z-auto md:w-full md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
              {/* Logo */}
              <div className="mb-6 hidden items-center gap-2 md:flex">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
                  <Sparkles size={20} className="text-white" />
                </div>
                <div>
                  <div className="font-semibold">AI Toolbox</div>
                  <div className="text-[10px] text-gray-400">Unified Web App</div>
                </div>
              </div>

              {/* Nav sections */}
              <nav className="flex-1 space-y-5" aria-label="Main navigation">
                {navSections.map((section) => (
                  <div key={section.title}>
                    {section.isSettings && <hr className="mb-4 border-gray-800" />}
                    <div
                      className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400"
                      aria-hidden="true"
                    >
                      {section.title}
                    </div>
                    <div className="space-y-1">
                      {section.items.map(({ href, label, icon: Icon }) => {
                        const isActive = isNavItemActive(pathname, href)
                        return (
                          <Link
                            key={href}
                            href={href}
                            className={`${baseLinkClass} ${isActive ? activeLinkClass : inactiveLinkClass}`}
                            onClick={closeSidebar}
                            aria-current={isActive ? 'page' : undefined}
                          >
                            <Icon size={18} aria-hidden="true" /> {label}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </nav>

              {/* Sidebar footer — Help button */}
              <div className="mt-4 border-t border-gray-800 pt-4">
                <button
                  type="button"
                  onClick={() => setDocsOpen(true)}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-gray-400 transition-colors hover:bg-gray-800/70 hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label="Open help and docs"
                >
                  <HelpCircle size={18} aria-hidden="true" />
                  <span className="text-sm">Help &amp; Docs</span>
                </button>
              </div>
            </aside>

            <main id="main-content" className="bg-gray-950 p-4 md:p-6">
              {children}
            </main>
          </div>
        </div>

        <UxDebugOverlay enabled={uxDebugEnabled} />

        {/* Global docs hub — accessible from any page */}
        <DocsHub open={docsOpen} onClose={() => setDocsOpen(false)} />

        {/* First-launch tour — shown once, dismissed via localStorage */}
        <FirstLaunchTour onOpenDocs={() => setDocsOpen(true)} />
      </body>
    </html>
  )
}
