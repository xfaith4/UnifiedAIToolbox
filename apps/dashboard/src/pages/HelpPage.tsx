import React from 'react'
import { BookOpen, ExternalLink, FileText, Rocket, Settings, Shield } from 'lucide-react'

interface DocSection {
  title: string
  description: string
  icon: React.ElementType
  links: Array<{
    name: string
    file: string
    description: string
  }>
}

const docSections: DocSection[] = [
  {
    title: 'Getting Started',
    description: 'Quick guides to get you up and running',
    icon: Rocket,
    links: [
      {
        name: 'Quick Start Guide',
        file: 'quick-start.md',
        description: 'Get up and running in 30 seconds'
      },
      {
        name: 'Launch Guide',
        file: 'launch-guide.md',
        description: 'Comprehensive deployment instructions'
      },
      {
        name: 'Architecture Overview',
        file: 'architecture.md',
        description: 'System design and components'
      }
    ]
  },
  {
    title: 'User Guides',
    description: 'Learn how to use key features',
    icon: BookOpen,
    links: [
      {
        name: 'Prompt Refiner Guide',
        file: 'prompt-refiner.md',
        description: 'AI-powered prompt optimization'
      },
      {
        name: 'API Reference',
        file: 'api-reference.md',
        description: 'REST API documentation'
      }
    ]
  },
  {
    title: 'Administration',
    description: 'Configuration and deployment',
    icon: Settings,
    links: [
      {
        name: 'Deployment Guide',
        file: 'deployment.md',
        description: 'Production deployment checklist'
      }
    ]
  }
]

export default function HelpPage() {
  const openDocumentation = (file: string) => {
    // Open the documentation file from GitHub
    const docsUrl = `https://github.com/xfaith4/UnifiedAIToolbox/blob/main/docs/help/${file}`
    window.open(docsUrl, '_blank')
  }

  const openDocsFolder = () => {
    // Open the GitHub docs folder
    window.open('https://github.com/xfaith4/UnifiedAIToolbox/tree/main/docs/help', '_blank')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Documentation</h1>
          <p className="mt-1 text-slate-400">
            Comprehensive guides and references for the Unified AI Toolbox
          </p>
        </div>
        <button
          onClick={openDocsFolder}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <ExternalLink size={16} />
          View on GitHub
        </button>
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-3">
        <a
          href="https://github.com/xfaith4/UnifiedAIToolbox"
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl border border-slate-700 bg-slate-800/50 p-6 transition-all hover:border-blue-500 hover:bg-slate-800"
        >
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-blue-600/20 p-3">
              <FileText className="text-blue-400" size={24} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-100">README</h3>
              <p className="mt-1 text-sm text-slate-400">Project overview and setup</p>
            </div>
          </div>
        </a>

        <button
          onClick={() => window.open('http://localhost:8000/docs', '_blank')}
          className="block w-full rounded-xl border border-slate-700 bg-slate-800/50 p-6 text-left transition-all hover:border-purple-500 hover:bg-slate-800"
        >
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-purple-600/20 p-3">
              <BookOpen className="text-purple-400" size={24} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-100">API Docs</h3>
              <p className="mt-1 text-sm text-slate-400">Interactive API reference</p>
            </div>
          </div>
        </button>

        <a
          href="https://github.com/xfaith4/UnifiedAIToolbox/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl border border-slate-700 bg-slate-800/50 p-6 transition-all hover:border-green-500 hover:bg-slate-800"
        >
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-green-600/20 p-3">
              <Shield className="text-green-400" size={24} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-100">Support</h3>
              <p className="mt-1 text-sm text-slate-400">Get help and report issues</p>
            </div>
          </div>
        </a>
      </div>

      {/* Documentation Sections */}
      <div className="space-y-6">
        {docSections.map((section) => {
          const Icon = section.icon
          return (
            <div
              key={section.title}
              className="rounded-xl border border-slate-700 bg-slate-800/30 p-6"
            >
              <div className="mb-4 flex items-start gap-3">
                <div className="rounded-lg bg-slate-700/50 p-2">
                  <Icon className="text-blue-400" size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-slate-100">{section.title}</h2>
                  <p className="mt-1 text-sm text-slate-400">{section.description}</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {section.links.map((link) => (
                  <button
                    key={link.file}
                    onClick={() => openDocumentation(link.file)}
                    className="flex items-start gap-3 rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-left transition-all hover:border-slate-600 hover:bg-slate-900"
                  >
                    <FileText className="mt-1 flex-shrink-0 text-slate-500" size={16} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-slate-200">{link.name}</h3>
                        <ExternalLink className="flex-shrink-0 text-slate-500" size={14} />
                      </div>
                      <p className="mt-1 text-sm text-slate-400">{link.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Additional Resources */}
      <div className="rounded-xl border border-slate-700 bg-gradient-to-br from-slate-800/30 to-slate-900/30 p-6">
        <h2 className="mb-4 text-xl font-semibold text-slate-100">Additional Resources</h2>
        <div className="space-y-3">
          <a
            href="https://github.com/xfaith4/UnifiedAIToolbox/blob/main/docs/help/index.md"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
          >
            <ExternalLink size={16} />
            <span>Full Documentation Index</span>
          </a>
          <a
            href="https://github.com/xfaith4/UnifiedAIToolbox/discussions"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
          >
            <ExternalLink size={16} />
            <span>Community Discussions</span>
          </a>
          <a
            href="https://github.com/xfaith4/UnifiedAIToolbox/blob/main/CONTRIBUTING.md"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
          >
            <ExternalLink size={16} />
            <span>Contributing Guide</span>
          </a>
        </div>
      </div>

      {/* Footer Note */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/20 p-4 text-sm text-slate-400">
        <p>
          <strong className="text-slate-300">Note:</strong> Documentation links open files
          from the <code className="rounded bg-slate-700 px-1.5 py-0.5">docs/help/</code>{' '}
          directory on GitHub. You can also access the documentation files directly in
          your local repository at the project root.
        </p>
      </div>
    </div>
  )
}
