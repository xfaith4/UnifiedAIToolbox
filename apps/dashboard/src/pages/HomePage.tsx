import { useEffect, useMemo, useState } from 'react'
import { fetchPromptLibrary } from '../services/promptStore'
import { listAgents } from '../services/agentStore'
import { loadDatasets } from '../services/datasetStore'
import { listRuns } from '../services/orchestratorStore'
import { Link } from 'react-router-dom'
import { BookOpen, Bot, Database, Activity, Plus, Play, Upload, Settings as SettingsIcon } from 'lucide-react'
import { CardSkeleton } from '../components/LoadingSpinner'

type Card = { title: string; value: string; sub?: string; to: string; icon: React.ElementType }

export default function HomePage() {
  const [promptCount, setPromptCount] = useState(0)
  const [agentCount, setAgentCount] = useState(0)
  const [datasetCount, setDatasetCount] = useState(0)
  const [runsCount, setRunsCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      try {
        const prompts = await fetchPromptLibrary()
        setPromptCount(prompts.length)
      } catch {
        setPromptCount(0)
      }
      setAgentCount(listAgents().length)
      setDatasetCount(loadDatasets().length)
      setRunsCount(listRuns().length)
      setLoading(false)
    }
    loadData()
  }, [])

  const cards: Card[] = useMemo(
    () => [
      { title: 'Prompts', value: String(promptCount), sub: 'Library size', to: '/prompts', icon: BookOpen },
      { title: 'Agents', value: String(agentCount), sub: 'Ready to orchestrate', to: '/agents', icon: Bot },
      { title: 'Datasets', value: String(datasetCount), sub: 'Imported locally', to: '/datasets', icon: Database },
      { title: 'Runs', value: String(runsCount), sub: 'Orchestrator history', to: '/orchestrator', icon: Activity },
    ],
    [promptCount, agentCount, datasetCount, runsCount]
  )

  const quickLinks = [
    { title: 'New prompt', description: 'Create a new AI prompt', to: '/prompts', icon: Plus, color: 'blue' },
    { title: 'Launch orchestration', description: 'Run AI workflows', to: '/orchestrator', icon: Play, color: 'emerald' },
    { title: 'Import dataset', description: 'Upload data files', to: '/datasets', icon: Upload, color: 'purple' },
    { title: 'Settings', description: 'Configure toolbox', to: '/settings', icon: SettingsIcon, color: 'slate' },
  ]

  const getColorClasses = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      slate: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    }
    return colors[color] || colors.blue
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p className="text-sm text-slate-400">
          Your unified AI orchestration hub - manage prompts, agents, datasets, and workflows all in one place.
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon
            return (
              <Link
                to={card.to}
                key={card.title}
                className="group rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg hover:shadow-xl hover:border-blue-600/50 transition-all duration-200 hover:scale-105"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium text-slate-400">{card.title}</div>
                  <Icon className="h-5 w-5 text-slate-500 group-hover:text-blue-400 transition-colors" />
                </div>
                <div className="text-4xl font-bold text-slate-100 mb-1">{card.value}</div>
                {card.sub && <div className="text-xs text-slate-500">{card.sub}</div>}
              </Link>
            )
          })}
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          <h2 className="text-lg font-semibold text-slate-200">Quick Actions</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map((link) => {
            const Icon = link.icon
            return (
              <Link
                key={link.title}
                to={link.to}
                className={`group rounded-lg border px-4 py-4 hover:shadow-md transition-all duration-200 ${getColorClasses(
                  link.color
                )}`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <div className="text-sm font-semibold text-slate-100">{link.title}</div>
                </div>
                <div className="text-xs opacity-80">{link.description}</div>
              </Link>
            )
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900/60 to-slate-900/40 p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-slate-200 mb-2">Getting Started</h2>
        <div className="space-y-2 text-sm text-slate-400">
          <p>
            <span className="font-medium text-slate-300">1. Create prompts</span> - Build your AI prompt library with templates and variables
          </p>
          <p>
            <span className="font-medium text-slate-300">2. Define agents</span> - Configure autonomous agents with specific roles and capabilities
          </p>
          <p>
            <span className="font-medium text-slate-300">3. Run orchestrations</span> - Execute complex AI workflows with your prompts and agents
          </p>
        </div>
      </div>
    </div>
  )
}
