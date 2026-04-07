// Fix: Import 'useEffect' from 'react'.
import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
const safeGetDraftRun = (draftId: string) => {
  try {
    const req = (globalThis as any)?.require as undefined | ((id: string) => any)
    const mod = req ? req('@/lib/services/proposalStore') : null
    const fn = mod?.getDraftRun as undefined | ((id: string) => any)
    return fn ? fn(draftId) : null
  } catch {
    return null
  }
}
const safeGetRecipe = (recipeId: string) => {
  try {
    const req = (globalThis as any)?.require as undefined | ((id: string) => any)
    const mod = req ? req('@/lib/services/recipeStore') : null
    const fn = mod?.getRecipe as undefined | ((id: string) => any)
    return fn ? fn(recipeId) : null
  } catch {
    return null
  }
}

import Header from './components/Header';
import GoalInput from './components/GoalInput';
import ExpectedOutputsPanel from './components/ExpectedOutputsPanel';
import RunMonitorPanel from './components/RunMonitorPanel';
import TaskClustersView from './components/TaskClustersView';
import TaskGraph from './components/TaskGraph';
import SidePanel from './components/SidePanel';
import ExportModal from './components/ExportModal';
import DefinitionsPanel from './components/DefinitionsPanel';
import SessionHistoryPanel from './components/SessionHistoryPanel';
import FeedbackModal from './components/FeedbackModal';
import SettingsModal from './components/SettingsModal';
import ApiKeyModal from './components/ApiKeyModal';
import PipelineStepper from './components/PipelineStepper';
import RunFileModal from './components/RunFileModal';
import JobTypeOverviewPanel from './components/JobTypeOverviewPanel';
import MaintenanceRunPanel from './components/MaintenanceRunPanel';
import LocalRepoPathPicker from './components/LocalRepoPathPicker';
import RuntimeActivityDrawer from './components/RuntimeActivityDrawer';

import useOrchestrator from './hooks/useOrchestrator';
import { useJobTypes } from './hooks/useJobTypes';
import { useRunStatus } from './hooks/useRunStatus';
import { useRuntimeActivity } from './hooks/useRuntimeActivity';
import { getBrowserApiKeyFromEnv } from './utils/apiKey';
import type { Task, Artifact, RunMode } from './types';
type EnginePipelinePayload = any;
const safeGetGithubApi = () => {
  try {
    const req = (globalThis as any)?.require as undefined | ((id: string) => any)
    const mod = req ? req('@/lib/services/github') : null
    return mod ?? null
  } catch {
    return null
  }
}

const githubApi = safeGetGithubApi()
const getGithubStatus: any = githubApi?.getGithubStatus ?? (async () => ({ authenticated: false }))
const listAccessibleRepos: any = githubApi?.listAccessibleRepos ?? (async () => [])
const safeGetOrchestratorApi = () => {
  try {
    const req = (globalThis as any)?.require as undefined | ((id: string) => any)
    const mod = req ? req('@/lib/services/orchestratorApi') : null
    return mod ?? null
  } catch {
    return null
  }
}

const orchestratorApi = safeGetOrchestratorApi()
const startRepoOrchestration: any = orchestratorApi?.startRepoOrchestration ?? (async () => {
  throw new Error('Repo orchestration API not available.')
})
const ORCHESTRATOR_API_BASE: string | undefined = orchestratorApi?.ORCHESTRATOR_API_BASE
type GitHubRepo = import('@/lib/types/github').GitHubRepo
type RepoOrchestrationResult = {
  runId?: string
  run_id?: string
  artifacts_index?: Array<{ fileName?: string; artifactId?: string }>
  [key: string]: unknown
}

type RepoOrchestrationEvent = {
  type?: string
  message?: string
  final?: boolean
  result?: RepoOrchestrationResult
  [key: string]: unknown
}
import GitHubRepoPanel from './components/GitHubRepoPanel';

const App: React.FC = () => {
  const searchParams = useSearchParams();

  const {
    session: liveSession,
    history,
    isOrchestrating,
    isComplete,
    pipeline,
    setPipeline,
    startOrchestration,
    runFeedback,
    cancelOrchestration,
    clearHistory
  } = useOrchestrator();

  const { data: jobTypesData, loading: jobTypesLoading } = useJobTypes()
  const [jobType, setJobType] = useState<string>('build_new_app')
  const jobTypeConfig = jobTypesData?.job_types?.[jobType] ?? null
  const isJobTypesHydrating = jobTypesLoading && !jobTypesData
  const isMaintenance = jobType === 'maintain_existing_app'
  const isGithubRepo = jobType === 'github_repo'
  const jobTypeOptions = useMemo(
    () => [
      ...(jobTypesData
        ? Object.values(jobTypesData.job_types).map((entry) => ({ id: entry.id, label: entry.label || entry.id }))
        : [
          { id: 'build_new_app', label: 'Create New' },
          { id: 'maintain_existing_app', label: 'Maintain Existing' },
        ]),
      { id: 'github_repo', label: 'GitHub Repo' },
    ],
    [jobTypesData]
  )

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'live' | string>('live');
  const [viewMode, setViewMode] = useState<'clusters' | 'graph'>('clusters');
  const [sidePanelMinimized, setSidePanelMinimized] = useState(false);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [maintenanceRunId, setMaintenanceRunId] = useState<string | null>(null)
  const [maintenanceStartError, setMaintenanceStartError] = useState<string | null>(null)
  const [maintenanceRunning, setMaintenanceRunning] = useState(false)
  const [maintenanceCanceling, setMaintenanceCanceling] = useState(false)
  const [localRepoPath, setLocalRepoPath] = useState('')
  const { status: maintenanceStatus, error: maintenanceStatusError, loading: maintenanceStatusLoading } = useRunStatus(maintenanceRunId, { enabled: isMaintenance })
  const maintenanceError = maintenanceStartError || maintenanceStatusError
  const runtimeRunId = isMaintenance ? maintenanceRunId : pipeline?.runId || null
  const runtimeStatus = isMaintenance ? maintenanceStatus : null
  const runtimeActivity = useRuntimeActivity(runtimeRunId, Boolean(runtimeRunId))

  // GitHub Repo Orchestration state
  const [githubEnvReady, setGithubEnvReady] = useState(false)
  const [githubEnvStatusMessage, setGithubEnvStatusMessage] = useState<string | null>(null)
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([])
  const [githubReposLoading, setGithubReposLoading] = useState(false)
  const [selectedGithubRepo, setSelectedGithubRepo] = useState<GitHubRepo | null>(null)
  const [githubBranch, setGithubBranch] = useState('')
  const [githubIntegrationBranch, setGithubIntegrationBranch] = useState('')
  const [githubEvents, setGithubEvents] = useState<RepoOrchestrationEvent[]>([])
  const [githubRunning, setGithubRunning] = useState(false)
  const [githubResult, setGithubResult] = useState<RepoOrchestrationResult | null>(null)
  const [githubReportMd, setGithubReportMd] = useState('')
  const [githubCancelFn, setGithubCancelFn] = useState<(() => void) | null>(null)
  const [githubError, setGithubError] = useState<string | null>(null)
  const [githubRunId, setGithubRunId] = useState<string | null>(null)
  const [githubRunDir, setGithubRunDir] = useState<string | null>(null)
  const [githubLogsDir, setGithubLogsDir] = useState<string | null>(null)

  // Modal and Panel States
  const [showExport, setShowExport] = useState(false);
  const [showDefinitions, setShowDefinitions] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isApiKeyMissing, setIsApiKeyMissing] = useState(false);
  const [viewFile, setViewFile] = useState<{ runId: string; relPath: string; scope?: 'repo' | 'run' } | null>(null);
  const [autoValidatedSessionId, setAutoValidatedSessionId] = useState<string | null>(null);

  // Draft prefill from Concierge (?draft=<proposalId>)
  const [draftGoal, setDraftGoal] = useState<string | undefined>(undefined);
  const [draftProposalId, setDraftProposalId] = useState<string | null>(null);
  const [recipeName, setRecipeName] = useState<string | null>(null);

  useEffect(() => {
    const draftId = searchParams.get('draft');
    if (!draftId) return;
    const draft = safeGetDraftRun(draftId);
    if (!draft) return;
    setDraftGoal(draft.goal);
    setDraftProposalId(draft.proposalId);
    if (draft.jobType) setJobType(draft.jobType);
  }, [searchParams]);

  useEffect(() => {
    const recipeId = searchParams.get('recipe');
    if (!recipeId) {
      setRecipeName(null);
      return;
    }
    const recipe = safeGetRecipe(recipeId);
    if (!recipe) return;
    setRecipeName(recipe.name ?? null);
    if (recipe.suggestedGoal) setDraftGoal(recipe.suggestedGoal);
    if (recipe.suggestedJobType) setJobType(recipe.suggestedJobType);
  }, [searchParams]);

  useEffect(() => {
    if (!jobTypesData?.job_types) return
    if (jobType === 'github_repo') return // static UI-only option, not in server config
    if (jobTypesData.job_types[jobType]) return
    const firstJobType = Object.keys(jobTypesData.job_types)[0]
    if (firstJobType) setJobType(firstJobType)
  }, [jobType, jobTypesData])

  // Timer effect to update elapsed time when orchestrating
  useEffect(() => {
    if (isOrchestrating && liveSession?.startTime) {
      const interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - liveSession.startTime!) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    } else if (!isOrchestrating) {
      setElapsedTime(0);
    }
  }, [isOrchestrating, liveSession?.startTime]);

  useEffect(() => {
    // Check if the client-side API key is available and valid.
    // In Next.js, only NEXT_PUBLIC_* vars are accessible in the browser bundle.
    const browserApiKey = getBrowserApiKeyFromEnv();
    if (!browserApiKey) {
      setIsApiKeyMissing(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem('app-factory:last-maintenance-run')
    if (stored && !maintenanceRunId) setMaintenanceRunId(stored)
  }, [maintenanceRunId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (maintenanceRunId) {
      window.localStorage.setItem('app-factory:last-maintenance-run', maintenanceRunId)
    } else {
      window.localStorage.removeItem('app-factory:last-maintenance-run')
    }
  }, [maintenanceRunId])

  useEffect(() => {
    if (!isMaintenance) return
    const state = maintenanceStatus?.status
    if (!state) return
    setMaintenanceRunning(state === 'queued' || state === 'running')
  }, [isMaintenance, maintenanceStatus?.status])

  useEffect(() => {
    if (!isGithubRepo) return
    let cancelled = false
    setGithubReposLoading(true)
    setGithubEnvStatusMessage(null)
    setGithubError(null)
    void Promise.all([
      getGithubStatus()
        .then((s: { authenticated?: boolean } | null) => {
          if (cancelled) return
          setGithubEnvReady(Boolean(s?.authenticated))
          if (!s) {
            setGithubEnvStatusMessage(`Unable to verify GitHub credentials. Could not reach ${ORCHESTRATOR_API_BASE}/github/status.`)
            return
          }
          if (!s.authenticated) {
            setGithubEnvStatusMessage('No GitHub token detected by the orchestrator process. Configure GITHUB_TOKEN in the environment used to start the API service.')
            return
          }
          setGithubEnvStatusMessage(null)
        })
        .catch(() => {
          if (!cancelled) {
            setGithubEnvStatusMessage(`Unable to verify GitHub credentials. Could not reach ${ORCHESTRATOR_API_BASE}/github/status.`)
          }
        }),
      listAccessibleRepos(undefined, { includeAppfactory: true })
        .then((repos: GitHubRepo[]) => {
          if (!cancelled)
            setGithubRepos(
              [...repos].sort((a, b) => Number(Boolean(b.appfactory?.known)) - Number(Boolean(a.appfactory?.known)))
            )
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            const msg = err instanceof Error ? err.message : String(err)
            setGithubError(msg)
          }
        }),
    ]).finally(() => { if (!cancelled) setGithubReposLoading(false) })
    return () => { cancelled = true }
  }, [isGithubRepo])

  const displayedSession = useMemo(() => {
    if (activeView === 'live') return liveSession;
    return history.find(s => s.id === activeView) || null;
  }, [activeView, liveSession, history]);

  // ### BEGIN: Export availability should not be blocked by validation failures
  const hasAnyArtifacts = useMemo(() => {
    const t = displayedSession?.tasks ?? [];
    return t.some((task) => Array.isArray(task?.artifacts) && task.artifacts.length > 0);
  }, [displayedSession]);

  // Fix: Enable Export for any run that has artifacts (even if acceptance checks fail),
  // while keeping "completed" as the primary success signal.
  const isExportAvailable = useMemo(() => {
    if (isMaintenance) {
      return Boolean(maintenanceRunId);
    }

    if (activeView !== 'live') {
      // Any historical session is considered exportable.
      return !!history.find((s) => s.id === activeView);
    }

    // Live view: exportable if the run completed OR if we already have artifacts on disk/in memory.
    return isComplete || hasAnyArtifacts;
  }, [activeView, history, isComplete, isMaintenance, maintenanceRunId, hasAnyArtifacts]);
  // ### END: Export availability should not be blocked by validation failures

  const totalCost = useMemo(() => {
    if (!displayedSession) return null;
    if (displayedSession.totalCost) return displayedSession.totalCost;

    const planningCost = displayedSession.planningCost || 0;
    const tasksCost = displayedSession.tasks.reduce((sum, task) => sum + (task.cost || 0), 0);
    const runningTotal = planningCost + tasksCost;
    return runningTotal > 0 ? runningTotal : null;
  }, [displayedSession]);

  const tasks = displayedSession?.tasks || [];
  const selectedTask = useMemo(() => tasks.find(t => t.id === selectedTaskId) || null, [tasks, selectedTaskId]);
  const graphPaneHeightPx = useMemo(() => {
    // Clusters-mode only: let the panel breathe as task count grows.
    const taskCount = Math.max(tasks.length, 1)
    const estimated = 480 + taskCount * 20
    return Math.max(560, Math.min(1200, estimated))
  }, [tasks.length])

  const startMaintenanceRun = async (requestPayload?: Record<string, any>) => {
    setMaintenanceStartError(null)
    setMaintenanceRunning(true)
    try {
      const res = await fetch('/api/app-factory/runs/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: requestPayload || { job_type: 'maintain_existing_app' } }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        const msg = json?.error?.message || `Failed to start maintenance run (${res.status})`
        setMaintenanceStartError(msg)
        setMaintenanceRunning(false)
        return
      }
      const runId = json?.runId as string | undefined
      if (runId) {
        setMaintenanceRunId(runId)
      } else {
        setMaintenanceStartError('Run started but runId was missing from response.')
        setMaintenanceRunning(false)
      }
    } catch (err) {
      setMaintenanceStartError(err instanceof Error ? err.message : 'Failed to start maintenance run.')
      setMaintenanceRunning(false)
    }
  }

  const cancelMaintenanceRun = async () => {
    if (!maintenanceRunId || maintenanceCanceling) return
    setMaintenanceCanceling(true)
    setMaintenanceStartError(null)
    try {
      const res = await fetch(`/api/app-factory/runs/${encodeURIComponent(maintenanceRunId)}/cancel`, {
        method: 'POST',
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        const msg = json?.error?.message || `Failed to cancel maintenance run (${res.status})`
        setMaintenanceStartError(msg)
        return
      }
      setMaintenanceRunning(false)
    } catch (err) {
      setMaintenanceStartError(err instanceof Error ? err.message : 'Failed to cancel maintenance run.')
    } finally {
      setMaintenanceCanceling(false)
    }
  }

  // Clears a stale / not-found run from local state without hitting the cancel API
  const clearMaintenanceRun = () => {
    setMaintenanceRunId(null)
    setMaintenanceStartError(null)
    setMaintenanceRunning(false)
  }

  const startGithubRepoRun = async (goal: string) => {
    if (!selectedGithubRepo) { setGithubError('Select a repository first.'); return }
    if (!goal.trim()) { setGithubError('Enter an instruction/goal.'); return }
    const repoUrl = `https://github.com/${selectedGithubRepo.full_name}.git`
    const branchValue = githubBranch.trim() || selectedGithubRepo.default_branch || 'main'
    const integBranch = githubIntegrationBranch.trim() || `${branchValue}-orchestration`
    setGithubRunning(true)
    setGithubEvents([])
    setGithubResult(null)
    setGithubReportMd('')
    setGithubError(null)
    setGithubRunId(null)
    setGithubRunDir(null)
    setGithubLogsDir(null)
    try {
      const { cancel } = await startRepoOrchestration(
        { repo: repoUrl, goal: goal.trim(), options: { branch: branchValue, integration_branch: integBranch } },
        async (event: RepoOrchestrationEvent) => {
          setGithubEvents((prev) => [...prev, event])
          if (event.result) {
            const result = event.result as RepoOrchestrationResult
            setGithubResult(result)
            const rid = (result.runId ?? (result as Record<string, unknown>)['run_id']) as string | undefined
            if (rid) setGithubRunId(rid)
            const extra = result as Record<string, unknown>
            if (extra['run_dir']) setGithubRunDir(String(extra['run_dir']))
            if (extra['logs_dir']) setGithubLogsDir(String(extra['logs_dir']))
            if (rid && ORCHESTRATOR_API_BASE) {
              const idx = Array.isArray((result as Record<string, unknown>)['artifacts_index'])
                ? ((result as Record<string, unknown>)['artifacts_index'] as Record<string, unknown>[])
                : []
              const mdItem = idx.find((a) => a['fileName'] === 'REPORT.md')
              if (mdItem?.['artifactId']) {
                const r = await fetch(
                  `${ORCHESTRATOR_API_BASE}/orchestrate/repo/${encodeURIComponent(rid)}/artifacts/${encodeURIComponent(String(mdItem['artifactId']))}`
                )
                if (r.ok) setGithubReportMd(await r.text())
              }
            }
          }
          if (event.type === 'error' && event.message) setGithubError(String(event.message))
          if (event.final || event.type === 'error') {
            setGithubRunning(false)
            setGithubCancelFn(null)
          }
        }
      )
      setGithubCancelFn(() => cancel)
    } catch (err) {
      setGithubError(err instanceof Error ? err.message : 'Failed to start repo orchestration.')
      setGithubRunning(false)
    }
  }

  const handleGoalSubmit = (
    goal: string,
    fileContent: string | null,
    seedArtifacts: Artifact[] | undefined,
    runMode: RunMode,
    requestPayload?: Record<string, any>
  ) => {
    if (activeView !== 'live') {
      setActiveView('live');
    }
    if (isGithubRepo) {
      void startGithubRepoRun(goal)
      return
    }
    if (isMaintenance) {
      const localPathPayload = localRepoPath.trim() ? { local_path: localRepoPath.trim() } : {}
      void startMaintenanceRun({ ...(requestPayload || {}), ...localPathPayload, job_type: jobType, goal })
      return
    }
    startOrchestration(goal, fileContent, seedArtifacts, runMode, { ...(requestPayload || {}), job_type: jobType });
    setSelectedTaskId(null);
  };

  useEffect(() => {
    // Auto-run hardening validation for the live session once agents complete (when enabled),
    // so the Export button only enables after gates pass.
    if (!pipeline?.hardeningEnabled) return
    if (!isComplete) return
    if (!liveSession?.id) return
    if (liveSession?.runMode === 'design') return
    if (autoValidatedSessionId === liveSession.id) return

    const normalize = pipeline.stages.find((s) => s.id === 'normalize')?.status
    const contract = pipeline.stages.find((s) => s.id === 'contract')?.status
    const gates = pipeline.stages.find((s) => s.id === 'gates')?.status
    const alreadyPassed = normalize === 'passed' && contract === 'passed' && gates === 'passed'
    const alreadyRunning = [normalize, contract, gates].some((s) => s === 'running')
    if (alreadyPassed || alreadyRunning) return

    let cancelled = false
    const run = async () => {
      const startedAt = new Date().toISOString()
      setPipeline({
        ...pipeline,
        stages: pipeline.stages.map((s) =>
          ['decision-lock', 'teams', 'assemble', 'normalize', 'contract', 'gates', 'repair', 'export'].includes(s.id) ? { ...s, status: 'running', startedAt } : s
        ),
      } as EnginePipelinePayload)

      try {
        const apiKey = getBrowserApiKeyFromEnv()
        const res = await fetch('/api/app-factory/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stackId: 'node-next-app-npm',
            runLabel: 'ui-auto-validate',
            sessionId: liveSession.id,
            artifacts: [],
            config: { apiKey: apiKey || undefined, runMode: liveSession?.runMode || 'build' },
          }),
        })
        const json = await res.json().catch(() => null)
        if (!cancelled && json?.pipeline) {
          setPipeline(json.pipeline as EnginePipelinePayload)
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setAutoValidatedSessionId(liveSession.id)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [pipeline, isComplete, liveSession?.id, autoValidatedSessionId, setPipeline]);

  const handleSelectTask = (task: Task) => {
    setSelectedTaskId(task.id);
  };

  const handleClearSelection = () => {
    setSelectedTaskId(null);
  };

  const handleSelectSession = (sessionId: string) => {
    setActiveView(sessionId);
    setShowHistory(false);
    setSelectedTaskId(null);
  };

  const handleGoLive = () => {
    setActiveView('live');
    setShowHistory(false);
    setSelectedTaskId(null);
  };

  // Add a listener to warn users before closing the tab during an active run.
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isOrchestrating) {
        event.preventDefault();
        event.returnValue = ''; // Required for Chrome
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isOrchestrating]);

  return (
    <div className="bg-gray-900 text-gray-200 font-sans flex min-h-0 flex-col h-[calc(100dvh-2rem)] md:h-[calc(100dvh-3rem)]">
      {isApiKeyMissing && <ApiKeyModal />}
      <Header
        onShowHistory={() => setShowHistory(true)}
        onShowDefinitions={() => setShowDefinitions(true)}
        onShowExport={() => setShowExport(true)}
        onShowFeedback={() => setShowFeedback(true)}
        onShowSettings={() => setShowSettings(true)}
        isOrchestrationComplete={isExportAvailable}
        totalCost={totalCost}
        waterUsage={displayedSession?.waterUsage || null}
        elapsedTime={isOrchestrating ? elapsedTime : null}
        jobTypeLabel={jobTypeConfig?.label || jobType}
      />
      <main className="flex-1 min-h-0 flex flex-col overflow-y-auto overflow-x-hidden">
        {isJobTypesHydrating ? (
          <section className="px-4 py-6 border-b border-gray-700 bg-gray-900/30">
            <div className="max-w-6xl mx-auto">
              <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-4 text-sm text-gray-300">
                Loading App Factory configuration...
              </div>
            </div>
          </section>
        ) : (
          <>
            {draftProposalId && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-800/60 bg-blue-950/40 px-4 py-3 text-sm text-blue-200">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 shrink-0 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span>
                    Prefilled from Concierge proposal.{' '}
                    <a href={`/concierge?proposal=${draftProposalId}`} className="underline hover:text-blue-100">
                      View proposal →
                    </a>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDraftProposalId(null)}
                  className="shrink-0 text-blue-400 hover:text-blue-200"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            )}
            {recipeName && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-violet-800/60 bg-violet-950/30 px-4 py-3 text-sm text-violet-200">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 shrink-0 text-violet-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h7m-7 4h10M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
                  </svg>
                  <span>Prefilled from recipe <span className="font-semibold">{recipeName}</span>.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setRecipeName(null)}
                  className="shrink-0 text-violet-300 hover:text-violet-100"
                  aria-label="Dismiss recipe prefill"
                >
                  ✕
                </button>
              </div>
            )}
            <GoalInput
              onGoalSubmit={handleGoalSubmit}
              isOrchestrating={isGithubRepo ? githubRunning : isMaintenance ? maintenanceRunning : isOrchestrating}
              onCancelOrchestration={isGithubRepo ? (githubCancelFn ?? (() => { })) : isMaintenance ? cancelMaintenanceRun : cancelOrchestration}
              jobType={jobType}
              jobTypeConfig={jobTypeConfig}
              jobTypeOptions={jobTypeOptions}
              onJobTypeChange={setJobType}
              seedGoal={draftGoal}
            />
            <JobTypeOverviewPanel jobType={jobType} config={jobTypeConfig} />
            {isMaintenance && (
              <LocalRepoPathPicker
                path={localRepoPath}
                onChange={setLocalRepoPath}
                disabled={maintenanceRunning}
              />
            )}
            {isGithubRepo ? (
              <GitHubRepoPanel
                envReady={githubEnvReady}
                envStatusMessage={githubEnvStatusMessage}
                repos={githubRepos}
                reposLoading={githubReposLoading}
                selectedRepo={selectedGithubRepo}
                onSelectRepo={setSelectedGithubRepo}
                branch={githubBranch}
                onBranchChange={setGithubBranch}
                integrationBranch={githubIntegrationBranch}
                onIntegrationBranchChange={setGithubIntegrationBranch}
                events={githubEvents}
                running={githubRunning}
                result={githubResult}
                reportMd={githubReportMd}
                cancelFn={githubCancelFn}
                error={githubError}
                runId={githubRunId}
                runDir={githubRunDir}
                logsDir={githubLogsDir}
              />
            ) : isMaintenance ? (
              <MaintenanceRunPanel
                runId={maintenanceRunId}
                status={maintenanceStatus}
                loading={maintenanceStatusLoading}
                error={maintenanceError}
                onOpenArtifact={(relPath) => {
                  if (!maintenanceRunId) return
                  setViewFile({ runId: maintenanceRunId, relPath, scope: 'run' })
                }}
                onCancel={cancelMaintenanceRun}
                onClearRun={clearMaintenanceRun}
              />
            ) : (
              <>
                <PipelineStepper pipeline={pipeline} />
                <ExpectedOutputsPanel
                  onLearnMore={() => setShowDefinitions(true)}
                  pipeline={pipeline}
                  onViewFile={(relPath) => {
                    if (!pipeline?.runId) return
                    setViewFile({ runId: pipeline.runId, relPath, scope: 'repo' })
                  }}
                />
              </>
            )}
            {!isGithubRepo && (
              <div
                className={viewMode === 'graph'
                  ? 'relative overflow-hidden'
                  : 'flex min-h-[28rem] h-auto overflow-visible'
                }
                style={viewMode === 'graph'
                  ? { height: 'max(800px, calc(100vh - 320px))' }
                  : { height: `${graphPaneHeightPx}px` }
                }
              >
                {/* Inner content wrapper — fills full area in graph mode, flex child in clusters mode */}
                <div className={viewMode === 'graph' ? 'absolute inset-0 flex flex-col' : 'flex-1 min-h-0 flex flex-col min-w-0'}>
                  <RunMonitorPanel
                    tasks={tasks}
                    isOrchestrating={isMaintenance ? maintenanceRunning : isOrchestrating}
                    viewMode={viewMode}
                    onChangeViewMode={(mode) => {
                      setViewMode(mode);
                      if (mode !== 'graph') setSidePanelMinimized(false);
                    }}
                  />
                  <div className={viewMode === 'graph' ? 'flex-1 min-h-0' : 'min-h-[16rem]'}>
                    {viewMode === 'graph' ? (
                      <TaskGraph
                        tasks={tasks}
                        onSelectTask={handleSelectTask}
                        selectedTaskId={selectedTaskId}
                      />
                    ) : (
                      <TaskClustersView
                        tasks={tasks}
                        onSelectTask={handleSelectTask}
                        selectedTaskId={selectedTaskId}
                      />
                    )}
                  </div>
                </div>
                {/* SidePanel: floating overlay in graph mode, flex sibling in clusters mode */}
                <SidePanel
                  task={selectedTask}
                  clearSelection={handleClearSelection}
                  onShowDefinitions={() => setShowDefinitions(true)}
                  isOverlay={viewMode === 'graph'}
                  minimized={sidePanelMinimized}
                  onToggleMinimize={() => setSidePanelMinimized(v => !v)}
                />
              </div>
            )}
          </>
        )}
      </main>

      {/* Modals and Panels */}
      <DefinitionsPanel isOpen={showDefinitions} onClose={() => setShowDefinitions(false)} />
      <SessionHistoryPanel
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        sessions={history}
        onSelectSession={handleSelectSession}
        onGoLive={handleGoLive}
        onClearHistory={clearHistory}
        currentSessionId={activeView}
      />

      <ExportModal
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        tasks={displayedSession?.tasks ?? []}
        sessionId={displayedSession?.id ?? null}
        runMode={displayedSession?.runMode ?? 'build'}
        pipeline={pipeline}
        setPipeline={setPipeline}
        runId={isMaintenance ? maintenanceRunId : pipeline.runId}
        runArtifacts={isMaintenance ? maintenanceStatus?.artifacts ?? [] : undefined}
        useRunArtifactsExport={isMaintenance}
      />

      <FeedbackModal
        isOpen={showFeedback}
        onClose={() => setShowFeedback(false)}
        session={displayedSession}
        onRunFeedback={runFeedback}
      />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        isApiKeyConfigured={!isApiKeyMissing}
      />

      {viewFile && (
        <RunFileModal
          isOpen={true}
          onClose={() => setViewFile(null)}
          runId={viewFile.runId}
          relPath={viewFile.relPath}
          scope={viewFile.scope}
        />
      )}
      {runtimeRunId && (
        <RuntimeActivityDrawer
          runId={runtimeRunId}
          status={runtimeStatus}
          events={runtimeActivity.events}
          mode={runtimeActivity.mode}
          error={runtimeActivity.error}
          loading={runtimeActivity.loading}
        />
      )}
    </div>
  );
};

export default App;
