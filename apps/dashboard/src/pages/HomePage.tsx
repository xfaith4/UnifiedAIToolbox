import { useEffect, useMemo, useState } from 'react'
import { fetchPromptLibrary } from '../services/promptStore'
import { listAgents } from '../services/agentStore'
import { loadDatasets } from '../services/datasetStore'
import { listRuns } from '../services/orchestratorStore'
import { Link } from 'react-router-dom'

type Card = { title: string; value: string; sub?: string; to: string }

export default function HomePage() {
  const [promptCount, setPromptCount] = useState(0)
  const [agentCount, setAgentCount] = useState(0)
  const [datasetCount, setDatasetCount] = useState(0)
  const [runsCount, setRunsCount] = useState(0)

  useEffect(() => {
    fetchPromptLibrary().then((p) => setPromptCount(p.length)).catch(() => setPromptCount(0))
    setAgentCount(listAgents().length)
    setDatasetCount(loadDatasets().length)
    setRunsCount(listRuns().length)
  }, [])

  const cards: Card[] = useMemo(
    () => [
      { title: 'Prompts', value: String(promptCount), sub: 'Library size', to: '/prompts' },
      { title: 'Agents', value: String(agentCount), sub: 'Ready to orchestrate', to: '/agents' },
      { title: 'Datasets', value: String(datasetCount), sub: 'Imported locally', to: '/datasets' },
      { title: 'Runs', value: String(runsCount), sub: 'Orchestrator history', to: '/orchestrator' },
    ],
    [promptCount, agentCount, datasetCount, runsCount]
  )

  const quickLinks: Card[] = [
    { title: 'New prompt', value: 'Create', to: '/prompts' },
    { title: 'Launch orchestration', value: 'Run', to: '/orchestrator' },
    { title: 'Import dataset', value: 'Import', to: '/datasets' },
    { title: 'Settings', value: 'Configure', to: '/settings' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Overview of your AI Toolbox: prompt and agent inventory, datasets, and orchestration runs.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link
            to={card.to}
            key={card.title}
            className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow hover:border-emerald-600"
          >
            <div className="text-sm text-slate-400">{card.title}</div>
            <div className="mt-2 text-3xl font-semibold text-slate-100">{card.value}</div>
            {card.sub && <div className="text-xs text-slate-500 mt-1">{card.sub}</div>}
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow">
        <div className="text-sm font-semibold text-slate-200">Quick actions</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map((link) => (
            <Link
              key={link.title}
              to={link.to}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-sm font-medium text-slate-100 hover:bg-slate-700"
            >
              <div className="text-xs text-slate-400">{link.title}</div>
              <div className="text-base text-slate-100">{link.value}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
