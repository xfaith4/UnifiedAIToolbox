import React, { useEffect, useMemo, useState } from 'react'
import { fetchPromptLibrary } from '../services/promptStore'
import { listAgents } from '../services/agentStore'
import { loadDatasets } from '../services/datasetStore'
import { listRuns } from '../services/orchestratorStore'
import { Link } from 'react-router-dom'
import { Sparkles, Zap, Users, BookOpen, Bot, Database, Activity, ArrowRight, TrendingUp, Clock, Star } from 'lucide-react'

type Card = { title: string; value: string; sub?: string; to: string; icon: React.ElementType; trend?: string }

export default function HomePage() {
  const [promptCount, setPromptCount] = useState(0)
  const [agentCount, setAgentCount] = useState(0)
  const [datasetCount, setDatasetCount] = useState(0)
  const [runsCount, setRunsCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

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
      setIsLoading(false)
    }
    loadData()
  }, [])

  const cards: Card[] = useMemo(
    () => [
      { title: 'Prompts', value: String(promptCount), sub: 'In library', to: '/prompts', icon: BookOpen, trend: '+12%' },
      { title: 'Agents', value: String(agentCount), sub: 'Ready to deploy', to: '/agents', icon: Bot, trend: '+5%' },
      { title: 'Datasets', value: String(datasetCount), sub: 'Imported', to: '/datasets', icon: Database },
      { title: 'Runs', value: String(runsCount), sub: 'Completed', to: '/orchestrator', icon: Activity, trend: '+23%' },
    ],
    [promptCount, agentCount, datasetCount, runsCount]
  )

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Welcome Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl md:text-4xl font-bold text-gradient tracking-tight">
            Unified AI Toolbox
          </h1>
          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            Pro
          </span>
        </div>
        <p className="text-[var(--text-secondary)] text-lg max-w-2xl">
          Multi-agent orchestration platform for complex AI workflows. Build, test, and deploy intelligent automation at scale.
        </p>
      </div>

      {/* Hero Card - AI Orchestration */}
      <div className="relative overflow-hidden rounded-2xl border border-[rgba(var(--accent-primary),0.3)] bg-gradient-to-br from-[rgba(var(--accent-primary),0.15)] via-[var(--bg-secondary)] to-[rgba(168,85,247,0.1)] p-8 shadow-xl animate-fade-in">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[rgba(var(--accent-primary),0.2)] to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-purple-500/10 to-transparent rounded-full blur-2xl translate-y-1/2 -translate-x-1/4 pointer-events-none" />
        
        <div className="relative z-10">
          <div className="flex items-start justify-between flex-wrap gap-6">
            <div className="space-y-4 flex-1 min-w-[300px]">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-gradient-to-br from-[rgba(var(--accent-primary),1)] to-[rgba(var(--accent-secondary),1)] shadow-lg animate-pulse-glow">
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-[var(--text-primary)]">AI Orchestration</h2>
                  <p className="text-sm text-[var(--text-tertiary)]">Intelligent Multi-Agent Collaboration</p>
                </div>
              </div>
              <p className="text-[var(--text-secondary)] leading-relaxed max-w-xl">
                Transform high-level ideas into actionable results. The orchestrator analyzes your goal, 
                selects optimal agents, creates specialists on-demand, and coordinates them to deliver 
                exceptional outcomes.
              </p>
              <div className="flex flex-wrap gap-6 pt-2">
                <div className="flex items-center gap-2.5 text-sm">
                  <div className="p-1.5 rounded-lg bg-blue-500/20">
                    <Users className="h-4 w-4 text-blue-400" />
                  </div>
                  <span className="text-[var(--text-primary)] font-medium">{agentCount}</span>
                  <span className="text-[var(--text-tertiary)]">agents ready</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm">
                  <div className="p-1.5 rounded-lg bg-emerald-500/20">
                    <Zap className="h-4 w-4 text-emerald-400" />
                  </div>
                  <span className="text-[var(--text-primary)] font-medium">{runsCount}</span>
                  <span className="text-[var(--text-tertiary)]">orchestrations</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm">
                  <div className="p-1.5 rounded-lg bg-purple-500/20">
                    <Star className="h-4 w-4 text-purple-400" />
                  </div>
                  <span className="text-[var(--text-tertiary)]">99.9% uptime</span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-4">
            <Link
              to="/orchestrator"
              className="group inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-[rgba(var(--accent-primary),1)] to-[rgba(var(--accent-secondary),1)] px-6 py-3.5 text-sm font-semibold text-white hover:shadow-xl hover:shadow-[rgba(var(--accent-primary),0.3)] transition-all duration-300 hover:-translate-y-0.5"
            >
              <Sparkles className="h-4 w-4" />
              Start New Orchestration
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              to="/help"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--bg-tertiary)] px-5 py-3.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--card-hover-border)] transition-all duration-200"
            >
              <Clock className="h-4 w-4" />
              Quick Start Guide
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, index) => (
          <Link
            to={card.to}
            key={card.title}
            className="group relative overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 shadow-md hover:border-[var(--card-hover-border)] hover:shadow-lg hover:shadow-[rgba(var(--accent-primary),0.1)] transition-all duration-300 hover:-translate-y-1 animate-slide-up"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[rgba(var(--accent-primary),0.1)] to-transparent rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10">
              <div className="flex items-start justify-between">
                <div className="p-2.5 rounded-xl bg-[var(--bg-tertiary)] group-hover:bg-[rgba(var(--accent-primary),0.15)] transition-colors duration-300">
                  <card.icon className="h-5 w-5 text-[var(--text-tertiary)] group-hover:text-[rgba(var(--accent-primary),1)]" />
                </div>
                {card.trend && (
                  <div className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                    <TrendingUp className="h-3 w-3" />
                    {card.trend}
                  </div>
                )}
              </div>
              <div className="mt-4">
                <div className="text-sm text-[var(--text-tertiary)] font-medium">{card.title}</div>
                <div className="mt-1 text-3xl font-bold text-[var(--text-primary)] tracking-tight">
                  {isLoading ? (
                    <div className="h-9 w-16 rounded-lg bg-[var(--bg-tertiary)] animate-shimmer" role="status" aria-label={`Loading ${card.title} count`}>
                      <span className="sr-only">Loading {card.title}...</span>
                    </div>
                  ) : (
                    card.value
                  )}
                </div>
                {card.sub && <div className="text-xs text-[var(--text-muted)] mt-1">{card.sub}</div>}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-lg backdrop-blur-xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-lg font-semibold text-[var(--text-primary)]">Quick Actions</div>
            <div className="text-sm text-[var(--text-tertiary)]">Jump into your most common workflows</div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            to="/orchestrator"
            className="group relative overflow-hidden rounded-xl border-2 border-[rgba(var(--accent-primary),0.3)] bg-gradient-to-br from-[rgba(var(--accent-primary),0.15)] to-transparent px-4 py-4 text-sm font-medium text-[var(--text-primary)] hover:border-[rgba(var(--accent-primary),0.5)] hover:shadow-lg hover:shadow-[rgba(var(--accent-primary),0.1)] transition-all duration-300"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[rgba(var(--accent-primary),0.1)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative">
              <div className="flex items-center gap-2 text-xs text-[rgba(var(--accent-secondary),1)] font-semibold uppercase tracking-wide">
                <Sparkles className="h-3.5 w-3.5" />
                Featured
              </div>
              <div className="text-base text-[var(--text-primary)] font-semibold mt-1">Launch Orchestration</div>
              <div className="text-xs text-[var(--text-tertiary)] mt-1">Multi-agent collaboration</div>
            </div>
          </Link>
          <Link
            to="/agents"
            className="group rounded-xl border border-[var(--card-border)] bg-[var(--bg-tertiary)] px-4 py-4 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] hover:border-[var(--card-hover-border)] transition-all duration-200"
          >
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] uppercase tracking-wide">
              <Bot className="h-3.5 w-3.5" />
              Manage
            </div>
            <div className="text-base text-[var(--text-primary)] font-semibold mt-1">Agent Library</div>
            <div className="text-xs text-[var(--text-tertiary)] mt-1">Configure AI agents</div>
          </Link>
          <Link
            to="/prompts"
            className="group rounded-xl border border-[var(--card-border)] bg-[var(--bg-tertiary)] px-4 py-4 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] hover:border-[var(--card-hover-border)] transition-all duration-200"
          >
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] uppercase tracking-wide">
              <BookOpen className="h-3.5 w-3.5" />
              Browse
            </div>
            <div className="text-base text-[var(--text-primary)] font-semibold mt-1">Prompt Library</div>
            <div className="text-xs text-[var(--text-tertiary)] mt-1">Templates & prompts</div>
          </Link>
          <Link
            to="/settings"
            className="group rounded-xl border border-[var(--card-border)] bg-[var(--bg-tertiary)] px-4 py-4 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] hover:border-[var(--card-hover-border)] transition-all duration-200"
          >
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] uppercase tracking-wide">
              <Zap className="h-3.5 w-3.5" />
              Configure
            </div>
            <div className="text-base text-[var(--text-primary)] font-semibold mt-1">Settings</div>
            <div className="text-xs text-[var(--text-tertiary)] mt-1">API keys & options</div>
          </Link>
        </div>
      </div>

      {/* Feature Highlights */}
      <div className="grid gap-5 md:grid-cols-3">
        <div className="p-5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]">
          <div className="p-2.5 rounded-xl bg-blue-500/15 w-fit">
            <Users className="h-5 w-5 text-blue-400" />
          </div>
          <h3 className="mt-4 font-semibold text-[var(--text-primary)]">Multi-Agent Teams</h3>
          <p className="mt-2 text-sm text-[var(--text-tertiary)] leading-relaxed">
            Coordinate multiple AI agents working together on complex tasks with intelligent handoffs.
          </p>
        </div>
        <div className="p-5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]">
          <div className="p-2.5 rounded-xl bg-emerald-500/15 w-fit">
            <Zap className="h-5 w-5 text-emerald-400" />
          </div>
          <h3 className="mt-4 font-semibold text-[var(--text-primary)]">Real-time Execution</h3>
          <p className="mt-2 text-sm text-[var(--text-tertiary)] leading-relaxed">
            Watch your orchestrations execute in real-time with live logs and progress tracking.
          </p>
        </div>
        <div className="p-5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]">
          <div className="p-2.5 rounded-xl bg-purple-500/15 w-fit">
            <Star className="h-5 w-5 text-purple-400" />
          </div>
          <h3 className="mt-4 font-semibold text-[var(--text-primary)]">Prompt Templates</h3>
          <p className="mt-2 text-sm text-[var(--text-tertiary)] leading-relaxed">
            Build and share reusable prompt templates with variable substitution and versioning.
          </p>
        </div>
      </div>
    </div>
  )
}
