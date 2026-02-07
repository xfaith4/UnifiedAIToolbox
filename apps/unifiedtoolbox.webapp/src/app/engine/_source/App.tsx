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
import type { Task, Artifact, RunMode } from './types';
import type { EnginePipelinePayload } from '@/lib/app-factory/pipeline/pipelineStatus';

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

  const { data: jobTypesData } = useJobTypes()
  const [jobType, setJobType] = useState<string>('build_new_app')
  const jobTypeConfig = jobTypesData?.job_types?.[jobType] ?? null
  const isMaintenance = jobType === 'maintain_existing_app'
  const jobTypeOptions = useMemo(
    () =>
      jobTypesData
        ? Object.values(jobTypesData.job_types).map((entry) => ({ id: entry.id, label: entry.label || entry.id }))
        : [
            { id: 'build_new_app', label: 'Create New' },
            { id: 'maintain_existing_app', label: 'Maintain Existing' },
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
  const { status: maintenanceStatus, error: maintenanceStatusError, loading: maintenanceStatusLoading } = useRunStatus(maintenanceRunId, { enabled: isMaintenance })
  const maintenanceError = maintenanceStartError || maintenanceStatusError

  // Modal and Panel States
  const [showExport, setShowExport] = useState(false);
  const [showDefinitions, setShowDefinitions] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isApiKeyMissing, setIsApiKeyMissing] = useState(false);
  const [viewFile, setViewFile] = useState<{ runId: string; relPath: string } | null>(null);
  const [autoValidatedSessionId, setAutoValidatedSessionId] = useState<string | null>(null);

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
    // Check if the client-side API key is available.
    // In Next.js, only NEXT_PUBLIC_* vars are accessible in the browser bundle.
    const browserApiKey = process.env.NEXT_PUBLIC_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
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
    const state = maintenanceStatus?.state
    if (!state) return
    setMaintenanceRunning(state === 'queued' || state === 'running')
  }, [isMaintenance, maintenanceStatus?.state])

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

  useEffect(() => {
    // Auto-default to clusters when task count gets large (graph becomes noisy).
    if (tasks.length > 18 && viewMode !== 'clusters') {
      setViewMode('clusters');
    }
  }, [tasks.length, viewMode]);

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
        const apiKey = process.env.NEXT_PUBLIC_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY || ''
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
    <div className="bg-gray-900 text-gray-200 font-sans h-screen flex flex-col">
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
      <main className="flex-1 flex flex-col overflow-hidden">
        <GoalInput
          onGoalSubmit={handleGoalSubmit}
          isOrchestrating={isMaintenance ? maintenanceRunning : isOrchestrating}
          onCancelOrchestration={cancelOrchestration}
          jobType={jobType}
          jobTypeConfig={jobTypeConfig}
          jobTypeOptions={jobTypeOptions}
          onJobTypeChange={setJobType}
        />
        <JobTypeOverviewPanel jobType={jobType} config={jobTypeConfig} />
        {isMaintenance ? (
          <MaintenanceRunPanel
            runId={maintenanceRunId}
            status={maintenanceStatus}
            loading={maintenanceStatusLoading}
            error={maintenanceError}
          />
        ) : (
          <>
            <PipelineStepper pipeline={pipeline} />
            <ExpectedOutputsPanel
              onLearnMore={() => setShowDefinitions(true)}
              pipeline={pipeline}
              onViewFile={(relPath) => {
                if (!pipeline?.runId) return
                setViewFile({ runId: pipeline.runId, relPath })
              }}
            />
          </>
        )}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0">
            <RunMonitorPanel
              tasks={tasks}
              isOrchestrating={isMaintenance ? maintenanceRunning : isOrchestrating}
              viewMode={viewMode}
              onChangeViewMode={setViewMode}
            />
            <div className="flex-1 min-h-0">
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
        />
      )}
    </div>
  );
};

export default App;
