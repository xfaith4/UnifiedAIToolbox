'use client'

import './globals.css'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  BarChart3,
  Settings,
  Workflow,
  BookOpen,
  Bot,
  Users,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { installUxInstrumentation, trackUxEvent } from '@/lib/ux/telemetry'
import { UxDebugOverlay } from '@/components/ux/UxDebugOverlay'

const navSections: NavSection[] = [
  {
    title: 'Overview',
    items: [{ href: '/dashboard', label: 'Dashboard', icon: BarChart3 }],
  },
  {
    title: 'Libraries',
    items: [
      { href: '/prompts', label: 'Prompt Library', icon: BookOpen },
      { href: '/agents', label: 'Agent Library', icon: Bot },
      { href: '/mcp-library', label: 'MCP Library', icon: Sparkles },
    ],
  },
  {
    title: 'Integration Tools',
    items: [
      { href: '/orchestrator', label: 'Orchestrator', icon: Users },
      { href: '/milestones', label: 'Milestones', icon: BarChart3 },
      { href: '/engine', label: 'App Factory', icon: Workflow },
    ],
  },
  {
    title: 'Settings',
    isSettings: true,
    items: [{ href: '/settings', label: 'Settings', icon: Settings }],
  },
]

const baseLinkClass =
  'flex items-center gap-2 rounded-xl px-3 py-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900'
const inactiveLinkClass = 'text-slate-300 hover:bg-slate-800/70'
const activeLinkClass = 'bg-slate-800/90 text-white font-medium shadow-inner'

type NavItem = { href: string; label: string; icon: LucideIcon }
type NavSection = { title: string; isSettings?: boolean; items: NavItem[] }

export default function RootLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
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
        <div className="min-h-screen bg-slate-950 text-slate-100">
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-white/90 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-900"
          >
            Skip to main content
          </a>
          <div className="min-h-screen md:grid md:grid-cols-[260px_1fr]">
            {/* Mobile top bar */}
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3 md:hidden">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
                  <Sparkles size={20} className="text-white" />
                </div>
                <div>
                  <div className="font-semibold">AI Toolbox</div>
                  <div className="text-[10px] text-slate-400">Unified Web App</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen((prev) => !prev)}
                className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1 text-sm font-medium text-slate-100 shadow-sm"
                aria-controls="sidebar-nav"
              >
                {sidebarOpen ? 'Close' : 'Menu'}
              </button>
            </div>

            {/* Overlay for mobile */}
            {sidebarOpen && (
              <button
                type="button"
                className="fixed inset-0 z-30 bg-slate-900/30 md:hidden"
                aria-label="Close sidebar"
                onClick={closeSidebar}
              />
            )}

            <aside
              id="sidebar-nav"
              className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-slate-800 bg-slate-900 p-4 transition-transform duration-200 ease-out md:static md:z-auto md:w-full md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
            >
              <div className="mb-6 hidden items-center gap-2 md:flex">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
                  <Sparkles size={20} className="text-white" />
                </div>
                <div>
                  <div className="font-semibold">AI Toolbox</div>
                  <div className="text-[10px] text-slate-400">Unified Web App</div>
                </div>
              </div>

              <nav className="space-y-5">
                {navSections.map((section) => (
                  <div key={section.title}>
                    {section.isSettings && <hr className="mb-4 border-slate-800" />}
                    <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {section.title}
                    </div>
                    <div className="space-y-1">
                      {section.items.map(({ href, label, icon: Icon }) => {
                        const isActive = pathname === href
                        return (
                          <Link
                            key={href}
                            href={href}
                            className={`${baseLinkClass} ${isActive ? activeLinkClass : inactiveLinkClass}`}
                            onClick={closeSidebar}
                          >
                            <Icon size={18} /> {label}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </nav>
            </aside>

            <main id="main-content" className="bg-slate-950 p-4 md:p-6">
              {children}
            </main>
          </div>
        </div>

        <UxDebugOverlay enabled={uxDebugEnabled} />
      </body>
    </html>
  )
}
