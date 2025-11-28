import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export type ThemeMode = 'dark' | 'light' | 'system'
export type AccentColor = 'blue' | 'purple' | 'emerald' | 'rose' | 'amber'

interface ThemeConfig {
  mode: ThemeMode
  accent: AccentColor
  reducedMotion: boolean
}

interface ThemeContextValue {
  theme: ThemeConfig
  effectiveMode: 'dark' | 'light'
  setThemeMode: (mode: ThemeMode) => void
  setAccentColor: (accent: AccentColor) => void
  setReducedMotion: (reduced: boolean) => void
}

const THEME_STORAGE_KEY = 'unified-ai-theme'

const defaultTheme: ThemeConfig = {
  mode: 'dark',
  accent: 'blue',
  reducedMotion: false,
}

/** Accent color palette - extracted for maintainability */
export const ACCENT_COLORS: Record<AccentColor, { primary: string; secondary: string; label: string }> = {
  blue: { primary: '59, 130, 246', secondary: '96, 165, 250', label: 'Blue' },
  purple: { primary: '168, 85, 247', secondary: '192, 132, 252', label: 'Purple' },
  emerald: { primary: '16, 185, 129', secondary: '52, 211, 153', label: 'Emerald' },
  rose: { primary: '244, 63, 94', secondary: '251, 113, 133', label: 'Rose' },
  amber: { primary: '245, 158, 11', secondary: '251, 191, 36', label: 'Amber' },
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function getSystemPreference(): 'dark' | 'light' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'dark'
}

function loadTheme(): ThemeConfig {
  if (typeof window === 'undefined') return defaultTheme
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ThemeConfig>
      return { ...defaultTheme, ...parsed }
    }
  } catch {
    // Ignore parse errors
  }
  return defaultTheme
}

function saveTheme(theme: ThemeConfig) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme))
  } catch {
    // Ignore storage errors
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeConfig>(loadTheme)
  const [systemMode, setSystemMode] = useState<'dark' | 'light'>(getSystemPreference)

  const effectiveMode = theme.mode === 'system' ? systemMode : theme.mode

  // Listen for system preference changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemMode(e.matches ? 'dark' : 'light')
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement
    
    // Remove old theme classes
    root.classList.remove('dark', 'light')
    root.classList.add(effectiveMode)

    // Set accent color CSS variable
    const accent = ACCENT_COLORS[theme.accent]
    root.style.setProperty('--accent-primary', accent.primary)
    root.style.setProperty('--accent-secondary', accent.secondary)

    // Set reduced motion preference
    root.style.setProperty('--motion-duration', theme.reducedMotion ? '0ms' : '300ms')
    root.style.setProperty('--motion-timing', theme.reducedMotion ? 'linear' : 'cubic-bezier(0.4, 0, 0.2, 1)')

    saveTheme(theme)
  }, [theme, effectiveMode])

  const setThemeMode = (mode: ThemeMode) => {
    setTheme(prev => ({ ...prev, mode }))
  }

  const setAccentColor = (accent: AccentColor) => {
    setTheme(prev => ({ ...prev, accent }))
  }

  const setReducedMotion = (reducedMotion: boolean) => {
    setTheme(prev => ({ ...prev, reducedMotion }))
  }

  return (
    <ThemeContext.Provider value={{ theme, effectiveMode, setThemeMode, setAccentColor, setReducedMotion }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
