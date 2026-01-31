// Fix: Import 'useEffect' from 'react'.
import React, { useState, useMemo, useEffect } from 'react';

import Header from './components/Header';
import GoalInput from './components/GoalInput';
import ExpectedOutputsPanel from './components/ExpectedOutputsPanel';
import TaskGraph from './components/TaskGraph';
import SidePanel from './components/SidePanel';
import ExportModal from './components/ExportModal';
import DefinitionsPanel from './components/DefinitionsPanel';
import SessionHistoryPanel from './components/SessionHistoryPanel';
import FeedbackModal from './components/FeedbackModal';
import SettingsModal from './components/SettingsModal';
import ApiKeyModal from './components/ApiKeyModal';

import useOrchestrator from './hooks/useOrchestrator';
import type { Task } from './types';

const App: React.FC = () => {
  const {
    session: liveSession,
    history,
    isOrchestrating,
    isComplete,
    startOrchestration,
    runFeedback,
    cancelOrchestration,
    clearHistory
  } = useOrchestrator();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'live' | string>('live');

  // Modal and Panel States
  const [showExport, setShowExport] = useState(false);
  const [showDefinitions, setShowDefinitions] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isApiKeyMissing, setIsApiKeyMissing] = useState(false);

  useEffect(() => {
    // Check if the client-side API key is available.
    // In Next.js, only NEXT_PUBLIC_* vars are accessible in the browser bundle.
    const browserApiKey = process.env.NEXT_PUBLIC_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    if (!browserApiKey) {
      setIsApiKeyMissing(true);
    }
  }, []);

  const displayedSession = useMemo(() => {
    if (activeView === 'live') return liveSession;
    return history.find(s => s.id === activeView) || null;
  }, [activeView, liveSession, history]);

  // Fix: The "Export" button is now enabled for any completed session,
  // including historical ones, not just the "live" completed session.
  const isExportAvailable = useMemo(() => {
    if (activeView !== 'live') {
      // Any historical session is considered complete and is exportable.
      return !!history.find(s => s.id === activeView);
    }
    // For the live view, it's exportable only when the orchestration is complete.
    return isComplete;
  }, [activeView, history, isComplete]);

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

  const handleGoalSubmit = (goal: string, fileContent: string | null) => {
    if (activeView !== 'live') {
      setActiveView('live');
    }
    startOrchestration(goal, fileContent);
    setSelectedTaskId(null);
  };

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
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        <GoalInput
          onGoalSubmit={handleGoalSubmit}
          isOrchestrating={isOrchestrating}
          onCancelOrchestration={cancelOrchestration}
        />
        <ExpectedOutputsPanel onLearnMore={() => setShowDefinitions(true)} />
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0">
            <TaskGraph
              tasks={tasks}
              onSelectTask={handleSelectTask}
              selectedTaskId={selectedTaskId}
            />
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
    </div>
  );
};

export default App;
