import { useEffect, useMemo, useState } from 'react'
import { fetchPromptLibrary } from '../services/promptStore'
import { listAgents } from '../services/agentStore'
import { loadDatasets } from '../services/datasetStore'
import { listRuns } from '../services/orchestratorStore'
import { Link } from 'react-router-dom'
import { Sparkles, Zap, Users } from 'lucide-react'

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

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Unified AI Toolbox</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Multi-agent orchestration platform for complex AI workflows
        </p>
      </div>

      {/* Hero Section - AI Orchestration */}
      <div className="rounded-xl border-2 border-blue-500/50 bg-gradient-to-br from-blue-900/20 to-purple-900/20 p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <div className="space-y-3 flex-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-blue-400" />
              <h2 className="text-xl font-bold text-slate-100">AI Orchestration</h2>
            </div>
            <p className="text-sm text-slate-300 max-w-2xl">
              Transform high-level ideas into results through intelligent multi-agent collaboration. 
              The orchestrator analyzes your goal, selects the right agents from the library, creates 
              ad-hoc specialists when needed, and coordinates them to deliver high-quality outcomes.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Users className="h-4 w-4" />
                <span>{agentCount} agents available</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Zap className="h-4 w-4" />
                <span>{runsCount} successful orchestrations</span>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <Link
            to="/orchestrator"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-500 transition-colors shadow-lg"
          >
            <Sparkles className="h-4 w-4" />
            Start New Orchestration
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link
            to={card.to}
            key={card.title}
            className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow hover:border-emerald-600 transition-colors"
          >
            <div className="text-sm text-slate-400">{card.title}</div>
            <div className="mt-2 text-3xl font-semibold text-slate-100">{card.value}</div>
            {card.sub && <div className="text-xs text-slate-500 mt-1">{card.sub}</div>}
          </Link>
        ))}
      </div>

      {/* Quick Links */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow">
        <div className="text-sm font-semibold text-slate-200">Quick actions</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Link
            to="/orchestrator"
            className="rounded-lg border border-blue-700 bg-blue-800/30 px-3 py-3 text-sm font-medium text-slate-100 hover:bg-blue-700/40 transition-colors"
          >
            <div className="text-xs text-blue-300">Multi-agent orchestration</div>
            <div className="text-base text-slate-100">Launch</div>
          </Link>
          <Link
            to="/agents"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-sm font-medium text-slate-100 hover:bg-slate-700 transition-colors"
          >
            <div className="text-xs text-slate-400">Manage agents</div>
            <div className="text-base text-slate-100">Agent Library</div>
          </Link>
          <Link
            to="/prompts"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-sm font-medium text-slate-100 hover:bg-slate-700 transition-colors"
          >
            <div className="text-xs text-slate-400">Browse prompts</div>
            <div className="text-base text-slate-100">Prompt Library</div>
          </Link>
          <Link
            to="/settings"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-sm font-medium text-slate-100 hover:bg-slate-700 transition-colors"
          >
            <div className="text-xs text-slate-400">Configure system</div>
            <div className="text-base text-slate-100">Settings</div>
          </Link>
        </div>
      </div>
    </div>
  )
}
