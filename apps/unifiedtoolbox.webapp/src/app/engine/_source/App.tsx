// Fix: Import 'useEffect' from 'react'.
import React, { useState, useMemo, useEffect } from 'react';

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

import useOrchestrator from './hooks/useOrchestrator';
import { useJobTypes } from './hooks/useJobTypes';
import { useRunStatus } from './hooks/useRunStatus';
import { getBrowserApiKeyFromEnv } from './utils/apiKey';
import type { Task, Artifact, RunMode } from './types';
import type { EnginePipelinePayload } from '@/lib/app-factory/pipeline/pipelineStatus';
import { getGithubStatus, listAccessibleRepos } from '@/lib/services/github';
import { startRepoOrchestration, ORCHESTRATOR_API_BASE } from '@/lib/services/orchestratorApi';
import type { GitHubRepo } from '@/lib/types/github';
import type { RepoOrchestrationEvent, RepoOrchestrationResult } from '@/lib/types/orchestrator';
import GitHubRepoPanel from './components/GitHubRepoPanel';

const App: React.FC = () => {
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
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [maintenanceRunId, setMaintenanceRunId] = useState<string | null>(null)
  const [maintenanceStartError, setMaintenanceStartError] = useState<string | null>(null)
  const [maintenanceRunning, setMaintenanceRunning] = useState(false)
  const [maintenanceCanceling, setMaintenanceCanceling] = useState(false)
  const { status: maintenanceStatus, error: maintenanceStatusError, loading: maintenanceStatusLoading } = useRunStatus(maintenanceRunId, { enabled: isMaintenance })
  const maintenanceError = maintenanceStartError || maintenanceStatusError

  // GitHub Repo Orchestration state
  const [githubEnvReady, setGithubEnvReady] = useState(false)
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
    void Promise.all([
      getGithubStatus().then((s) => { if (!cancelled) setGithubEnvReady(Boolean(s?.authenticated)) }).catch(() => {}),
      listAccessibleRepos(undefined, { includeAppfactory: true })
        .then((repos) => {
          if (!cancelled)
            setGithubRepos(
              [...repos].sort((a, b) => Number(Boolean(b.appfactory?.known)) - Number(Boolean(a.appfactory?.known)))
            )
        })
        .catch(() => {}),
    ]).finally(() => { if (!cancelled) setGithubReposLoading(false) })
    return () => { cancelled = true }
  }, [isGithubRepo])

  const displayedSession = useMemo(() => {
    if (activeView === 'live') return liveSession;
    return history.find(s => s.id === activeView) || null;
  }, [activeView, liveSession, history]);

  // Fix: The "Export" button is now enabled for any completed session,
  // including historical ones, not just the "live" completed session.
  const isExportAvailable = useMemo(() => {
    if (isMaintenance) {
      return Boolean(maintenanceRunId)
    }
    if (activeView !== 'live') {
      // Any historical session is considered complete and is exportable.
      return !!history.find(s => s.id === activeView);
    }
    // For the live view, it's exportable only when the orchestration is complete.
    return isComplete;
  }, [activeView, history, isComplete, isMaintenance, maintenanceRunId]);

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
    // Let graph runs breathe as task count grows while keeping a sane upper bound.
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
        async (event) => {
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
      void startMaintenanceRun({ ...(requestPayload || {}), job_type: jobType, goal })
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
            <GoalInput
              onGoalSubmit={handleGoalSubmit}
              isOrchestrating={isGithubRepo ? githubRunning : isMaintenance ? maintenanceRunning : isOrchestrating}
              onCancelOrchestration={isGithubRepo ? (githubCancelFn ?? (() => {})) : isMaintenance ? cancelMaintenanceRun : cancelOrchestration}
              jobType={jobType}
              jobTypeConfig={jobTypeConfig}
              jobTypeOptions={jobTypeOptions}
              onJobTypeChange={setJobType}
            />
            <JobTypeOverviewPanel jobType={jobType} config={jobTypeConfig} />
            {isGithubRepo ? (
              <GitHubRepoPanel
                envReady={githubEnvReady}
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
              className={`flex min-h-[28rem] ${
                viewMode === 'graph'
                  ? 'overflow-hidden'
                  : 'h-auto overflow-visible'
              }`}
              style={viewMode === 'graph' ? { height: `${graphPaneHeightPx}px` } : undefined}
            >
              <div className="flex-1 min-h-0 flex flex-col min-w-0">
                <RunMonitorPanel
                  tasks={tasks}
                  isOrchestrating={isMaintenance ? maintenanceRunning : isOrchestrating}
                  viewMode={viewMode}
                  onChangeViewMode={setViewMode}
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
              <SidePanel
                task={selectedTask}
                clearSelection={handleClearSelection}
                onShowDefinitions={() => setShowDefinitions(true)}
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
    </div>
  );
};

export default App;
