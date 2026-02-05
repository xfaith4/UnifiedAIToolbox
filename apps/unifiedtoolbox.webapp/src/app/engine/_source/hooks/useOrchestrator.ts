import { useSyncExternalStore } from 'react'
import { getOrchestratorRuntime } from './orchestratorRuntime'

const runtime = getOrchestratorRuntime()

const useOrchestrator = () => {
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot)
  return {
    ...snapshot,
    startOrchestration: runtime.startOrchestration,
    runFeedback: runtime.runFeedback,
    cancelOrchestration: runtime.cancelOrchestration,
    clearHistory: runtime.clearHistory,
    setPipeline: runtime.setPipeline,
  }
}

export default useOrchestrator
