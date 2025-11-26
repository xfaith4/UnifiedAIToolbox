import { NavLink } from 'react-router-dom'
import { BarChart3, Settings, Github, Workflow, BookOpen, Bot, Users, Sparkles, Database, Activity, HelpCircle } from 'lucide-react'
import { type ReactNode, useState } from 'react'

const navSections = [
  {
    title: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: BarChart3 }],
  },
  {
    title: 'Libraries',
    items: [
      { to: '/prompts', label: 'Prompt Library', icon: BookOpen },
      { to: '/agents', label: 'Agent Library', icon: Bot },
    ],
  },
  {
    title: 'Integration Tools',
    items: [
      { to: '/orchestrator', label: 'Orchestrator', icon: Users },
      { to: '/genesys', label: 'Genesys', icon: Workflow },
      { to: '/github', label: 'GitHub', icon: Github },
    ],
  },
  {
    title: 'Data & Monitoring',
    items: [
      { to: '/datasets', label: 'Dataset Explorer', icon: Database },
      { to: '/sensors', label: 'Sensor Monitor', icon: Activity },
    ],
  },
  {
    title: 'Settings',
    isSettings: true,
    items: [
      { to: '/help', label: 'Help', icon: HelpCircle },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

const baseLinkClass =
  'flex items-center gap-2 rounded-xl px-3 py-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900'
const inactiveLinkClass = 'text-slate-300 hover:bg-slate-800/70'
const activeLinkClass = 'bg-slate-800/90 text-white font-medium shadow-inner'

export function Layout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
    `${baseLinkClass} ${isActive ? activeLinkClass : inactiveLinkClass}`

  const closeSidebar = () => setSidebarOpen(false)

  return (
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
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <div className="font-semibold">AI Toolbox</div>
              <div className="text-[10px] text-slate-400">Unified Prompt Hub</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="rounded-md border border-slate-700 px-3 py-1 text-sm font-medium text-slate-100 shadow-sm bg-slate-800/60"
            aria-expanded={sidebarOpen}
            aria-controls="sidebar-nav"
          >
            {sidebarOpen ? 'Close Menu' : 'Menu'}
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
          className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 border-r border-slate-800 p-4 transition-transform duration-200 ease-out md:static md:z-auto md:w-full md:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        >
          <div className="hidden md:flex items-center gap-2 mb-6">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <div className="font-semibold">AI Toolbox</div>
              <div className="text-[10px] text-slate-400">Unified Prompt Hub</div>
            </div>
          </div>

          <nav className="space-y-5">
            {navSections.map((section) => (
              <div
                key={section.title}
                className={section.isSettings ? 'pt-4 border-t border-slate-200' : undefined}
              >
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-3">
                  {section.title}
                </div>
                <div className="space-y-1">
                  {section.items.map(({ to, label, icon: Icon }) => (
                    <NavLink key={to} to={to} className={navLinkClassName} onClick={closeSidebar}>
                      <Icon size={18} /> {label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <main id="main-content" className="p-4 md:p-6 bg-slate-950">
          {children}
        </main>
      </div>
    </div>
  )
}
