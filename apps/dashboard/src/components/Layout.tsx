import { NavLink } from 'react-router-dom'
import { BarChart3, Settings, Github, Workflow, BookOpen, Bot, Sparkles, Database, Activity, HelpCircle, Sun, Moon, Monitor, Palette } from 'lucide-react'
import { type ReactNode, useState, useRef, useEffect } from 'react'
import { useTheme, type AccentColor } from '../contexts/ThemeContext'

const navSections = [
  {
    title: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: BarChart3 }],
  },
  {
    title: 'AI Orchestration',
    isPrimary: true,
    items: [
      { to: '/orchestrator', label: 'Orchestrator', icon: Sparkles },
    ],
  },
  {
    title: 'Libraries',
    items: [
      { to: '/agents', label: 'Agent Library', icon: Bot },
      { to: '/prompts', label: 'Prompt Library', icon: BookOpen },
    ],
  },
  {
    title: 'Integration Tools',
    items: [
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

const accentColors: { value: AccentColor; label: string; class: string }[] = [
  { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { value: 'emerald', label: 'Emerald', class: 'bg-emerald-500' },
  { value: 'rose', label: 'Rose', class: 'bg-rose-500' },
  { value: 'amber', label: 'Amber', class: 'bg-amber-500' },
]

function ThemeToggle() {
  const { theme, effectiveMode, setThemeMode, setAccentColor } = useTheme()
  const [showPalette, setShowPalette] = useState(false)
  const paletteRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (paletteRef.current && !paletteRef.current.contains(event.target as Node)) {
        setShowPalette(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const cycleThemeMode = () => {
    const modes = ['dark', 'light', 'system'] as const
    const currentIndex = modes.indexOf(theme.mode)
    const nextIndex = (currentIndex + 1) % modes.length
    setThemeMode(modes[nextIndex])
  }

  const ModeIcon = theme.mode === 'dark' ? Moon : theme.mode === 'light' ? Sun : Monitor

  return (
    <div className="flex items-center gap-1 relative" ref={paletteRef}>
      <button
        onClick={cycleThemeMode}
        className="p-2 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--card-hover-border)] transition-all duration-200 group"
        title={`Theme: ${theme.mode} (click to change)`}
        aria-label={`Current theme: ${theme.mode}`}
      >
        <ModeIcon size={16} className="text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors" />
      </button>
      <button
        onClick={() => setShowPalette(!showPalette)}
        className="p-2 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--card-hover-border)] transition-all duration-200 group"
        title="Change accent color"
        aria-label="Change accent color"
        aria-expanded={showPalette}
      >
        <Palette size={16} className="text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors" />
      </button>
      {showPalette && (
        <div className="absolute top-full right-0 mt-2 p-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--card-border)] shadow-lg z-50 animate-scale-in">
          <div className="text-xs text-[var(--text-tertiary)] mb-2 px-1">Accent Color</div>
          <div className="flex gap-1.5">
            {accentColors.map((color) => (
              <button
                key={color.value}
                onClick={() => {
                  setAccentColor(color.value)
                  setShowPalette(false)
                }}
                className={`w-6 h-6 rounded-full ${color.class} transition-transform hover:scale-110 ${
                  theme.accent === color.value ? 'ring-2 ring-offset-2 ring-offset-[var(--bg-elevated)] ring-slate-900 dark:ring-white' : ''
                }`}
                title={color.label}
                aria-label={`Set ${color.label} accent color`}
                aria-pressed={theme.accent === color.value}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const baseLinkClass =
  'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--accent-primary),0.8)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-secondary)]'
const inactiveLinkClass = 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] hover:translate-x-1'
const activeLinkClass = 'bg-gradient-to-r from-[rgba(var(--accent-primary),1)] to-[rgba(var(--accent-secondary),1)] text-white font-medium shadow-lg'

export function Layout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { effectiveMode } = useTheme()

  const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
    `${baseLinkClass} ${isActive ? activeLinkClass : inactiveLinkClass}`

  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className={`min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] ${effectiveMode}`}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-white/90 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-900"
      >
        Skip to main content
      </a>
      <div className="min-h-screen md:grid md:grid-cols-[280px_1fr]">
        {/* Mobile top bar */}
        <div className="flex items-center justify-between border-b border-[var(--card-border)] bg-[var(--bg-secondary)] px-4 py-3 md:hidden">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[rgba(var(--accent-primary),1)] to-[rgba(var(--accent-secondary),1)] flex items-center justify-center shadow-lg animate-pulse-glow">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <div className="font-bold text-[var(--text-primary)]">AI Toolbox</div>
              <div className="text-[10px] text-[var(--text-tertiary)] tracking-wide">Unified Orchestration</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              className="rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] shadow-sm bg-[var(--bg-tertiary)] hover:bg-[var(--card-hover-border)] transition-colors"
              aria-expanded={sidebarOpen}
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
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden animate-fade-in"
            aria-label="Close sidebar"
            onClick={closeSidebar}
          />
        )}

        <aside
          id="sidebar-nav"
          className={`fixed inset-y-0 left-0 z-40 w-72 bg-[var(--bg-secondary)] border-r border-[var(--card-border)] p-5 transition-transform duration-300 ease-out md:static md:z-auto md:w-full md:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        >
          {/* Logo Section */}
          <div className="hidden md:flex items-center gap-4 mb-8 px-1">
            <div className="relative">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[rgba(var(--accent-primary),1)] to-[rgba(var(--accent-secondary),1)] flex items-center justify-center shadow-xl animate-pulse-glow">
                <Sparkles size={24} className="text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 border-2 border-[var(--bg-secondary)]" title="Online" />
            </div>
            <div>
              <div className="font-bold text-xl text-[var(--text-primary)] tracking-tight">AI Toolbox</div>
              <div className="text-[11px] text-[var(--text-tertiary)] tracking-wide font-medium">Unified Orchestration</div>
            </div>
          </div>

          {/* Theme Toggle - Desktop */}
          <div className="hidden md:flex items-center justify-between mb-6 px-1">
            <span className="text-xs text-[var(--text-tertiary)] font-medium">Theme</span>
            <ThemeToggle />
          </div>

          <nav className="space-y-6">
            {navSections.map((section) => (
              <div
                key={section.title}
                className={
                  section.isSettings 
                    ? 'pt-4 border-t border-[var(--card-border)]' 
                    : section.isPrimary
                    ? 'rounded-xl border border-[rgba(var(--accent-primary),0.3)] bg-[rgba(var(--accent-primary),0.05)] p-3'
                    : undefined
                }
              >
                <div className={`text-[11px] font-semibold uppercase tracking-wider mb-2.5 px-3 ${
                  section.isPrimary ? 'text-[rgba(var(--accent-secondary),1)]' : 'text-[var(--text-tertiary)]'
                }`}>
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

          {/* Footer */}
          <div className="absolute bottom-5 left-5 right-5">
            <div className="p-3 rounded-xl bg-gradient-to-br from-[rgba(var(--accent-primary),0.1)] to-transparent border border-[rgba(var(--accent-primary),0.2)]">
              <div className="text-xs text-[var(--text-tertiary)]">Version {import.meta.env.VITE_APP_VERSION || '0.1.0'}</div>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Professional Theme</div>
            </div>
          </div>
        </aside>

        <main id="main-content" className="p-4 md:p-8 bg-[var(--bg-primary)] min-h-screen">
          <div className="animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
