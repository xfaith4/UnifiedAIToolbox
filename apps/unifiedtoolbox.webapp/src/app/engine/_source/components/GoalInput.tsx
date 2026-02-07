



import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RunIcon, LoadingIcon, UploadIcon, CloseIcon, StopIcon } from './icons';
import RequirementsWizard from './RequirementsWizard';
import type { Artifact, RunMode } from '../types';
import type { JobTypeSummary, JobTypeField } from '../hooks/useJobTypes'

interface GoalInputProps {
  onGoalSubmit: (goal: string, fileContent: string | null, seedArtifacts: Artifact[] | undefined, runMode: RunMode, requestPayload?: Record<string, any>) => void;
  isOrchestrating: boolean;
  onCancelOrchestration: () => void;
  jobType: string;
  jobTypeConfig?: JobTypeSummary | null;
  jobTypeOptions: Array<{ id: string; label: string }>;
  onJobTypeChange: (jobType: string) => void;
}

const GoalInput: React.FC<GoalInputProps> = ({ onGoalSubmit, isOrchestrating, onCancelOrchestration, jobType, jobTypeConfig, jobTypeOptions, onJobTypeChange }) => {
  const [wizardEnabled, setWizardEnabled] = useState(false)
  const [runMode, setRunMode] = useState<RunMode>('build')
  const [goal, setGoal] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [requestValues, setRequestValues] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null);

  const requiredFields = useMemo<JobTypeField[]>(() => {
    if (!jobTypeConfig?.request_fields) return []
    return jobTypeConfig.request_fields.filter((field) => field.path !== 'goal' && field.path !== 'job_type')
  }, [jobTypeConfig])

  const requiredFilled = useMemo(() => {
    if (requiredFields.length === 0) return true
    return requiredFields.every((field) => Boolean(requestValues[field.path]))
  }, [requiredFields, requestValues])

  const setRequestValue = (path: string, value: string) => {
    setRequestValues((prev) => ({ ...prev, [path]: value }))
  }

  const buildRequestPayload = (goalText: string) => {
    const payload: Record<string, any> = { job_type: jobType, goal: goalText }
    for (const field of requiredFields) {
      const value = requestValues[field.path]
      if (!value) continue
      const parts = field.path.split('.')
      let cursor: any = payload
      for (let i = 0; i < parts.length; i++) {
        const key = parts[i]
        if (i === parts.length - 1) {
          cursor[key] = value
        } else {
          if (!cursor[key]) cursor[key] = {}
          cursor = cursor[key]
        }
      }
    }
    return payload
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/app-factory/flags', { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { REQUIREMENT_WIZARD?: boolean }
        if (!cancelled) setWizardEnabled(Boolean(json?.REQUIREMENT_WIZARD))
      } catch {
        // ignore
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setRequestValues({})
  }, [jobType])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (goal.trim() && requiredFilled && !isOrchestrating) {
      const requestPayload = buildRequestPayload(goal)
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          onGoalSubmit(goal, content, undefined, runMode, requestPayload);
        };
        reader.onerror = () => {
          alert("Error reading file.");
        }
        reader.readAsText(file);
      } else {
        onGoalSubmit(goal, null, undefined, runMode, requestPayload);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const clearFile = () => {
    setFile(null);
    if(fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };

  const useWizard = wizardEnabled && jobType === 'build_new_app'

  if (useWizard) {
    return (
      <div className="p-4 border-b border-gray-700 bg-gray-900/50">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center justify-between gap-3 text-xs">
            <div className="text-gray-400">Job type:</div>
            <div className="flex items-center gap-2">
              {jobTypeOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onJobTypeChange(option.id)}
                  disabled={isOrchestrating}
                  className={`px-3 py-1.5 rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    jobType === option.id
                      ? 'bg-indigo-600/30 border-indigo-500 text-indigo-100'
                      : 'bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {requiredFields.length > 0 && (
            <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3">
              <div className="text-xs font-semibold text-gray-300">Required inputs</div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                {requiredFields.map((field) => (
                  <label key={field.path} className="flex flex-col gap-1 text-gray-300">
                    <span className="text-xs text-gray-400">{field.label}</span>
                    {field.enum && field.enum.length ? (
                      <select
                        value={requestValues[field.path] || ''}
                        onChange={(e) => setRequestValue(field.path, e.target.value)}
                        disabled={isOrchestrating}
                        className="px-3 py-2 bg-gray-900/40 border border-gray-700 rounded text-sm"
                      >
                        <option value="">Select...</option>
                        {field.enum.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={requestValues[field.path] || ''}
                        onChange={(e) => setRequestValue(field.path, e.target.value)}
                        disabled={isOrchestrating}
                        className="px-3 py-2 bg-gray-900/40 border border-gray-700 rounded text-sm"
                        placeholder={`Enter ${field.label.toLowerCase()}`}
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          <RequirementsWizard
            isOrchestrating={isOrchestrating}
            onCancelOrchestration={onCancelOrchestration}
            runMode={runMode}
            onRunModeChange={setRunMode}
            onStart={(goalText, fileContent, seedArtifacts) => {
              if (!requiredFilled) {
                alert('Please complete the required inputs before starting.')
                return
              }
              onGoalSubmit(goalText, fileContent, seedArtifacts, runMode, buildRequestPayload(goalText))
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 border-b border-gray-700 bg-gray-900/50">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="text-gray-400">Job type:</div>
          <div className="flex items-center gap-2">
            {jobTypeOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onJobTypeChange(option.id)}
                disabled={isOrchestrating}
                className={`px-3 py-1.5 rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  jobType === option.id
                    ? 'bg-indigo-600/30 border-indigo-500 text-indigo-100'
                    : 'bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="text-gray-400">Run type:</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRunMode('design')}
              disabled={isOrchestrating}
              className={`px-3 py-1.5 rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                runMode === 'design'
                  ? 'bg-indigo-600/30 border-indigo-500 text-indigo-100'
                  : 'bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700'
              }`}
              title="Design Run: docs/specs only (no runnable repo checks)"
            >
              Design Run
            </button>
            <button
              type="button"
              onClick={() => setRunMode('build')}
              disabled={isOrchestrating}
              className={`px-3 py-1.5 rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                runMode === 'build'
                  ? 'bg-indigo-600/30 border-indigo-500 text-indigo-100'
                  : 'bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700'
              }`}
              title="Build Run: generate runnable repo + acceptance checks"
            >
              Build Run
            </button>
          </div>
        </div>
        {requiredFields.length > 0 && (
          <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3">
            <div className="text-xs font-semibold text-gray-300">Required inputs</div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {requiredFields.map((field) => (
                <label key={field.path} className="flex flex-col gap-1 text-gray-300">
                  <span className="text-xs text-gray-400">{field.label}</span>
                  {field.enum && field.enum.length ? (
                    <select
                      value={requestValues[field.path] || ''}
                      onChange={(e) => setRequestValue(field.path, e.target.value)}
                      disabled={isOrchestrating}
                      className="px-3 py-2 bg-gray-900/40 border border-gray-700 rounded text-sm"
                    >
                      <option value="">Select...</option>
                      {field.enum.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={requestValues[field.path] || ''}
                      onChange={(e) => setRequestValue(field.path, e.target.value)}
                      disabled={isOrchestrating}
                      className="px-3 py-2 bg-gray-900/40 border border-gray-700 rounded text-sm"
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                    />
                  )}
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-3">
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Enter your high-level goal, e.g., 'Summarize the provided document'"
              className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              disabled={isOrchestrating}
            />
            {isOrchestrating ? (
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="px-4 py-3 bg-gray-700 text-white font-semibold rounded-lg flex items-center cursor-default">
                  <LoadingIcon className="w-5 h-5 mr-2 animate-spin" />
                  Running...
                </div>
                <button
                  type="button"
                  onClick={onCancelOrchestration}
                  className="px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg flex items-center transition-colors"
                  aria-label="Cancel orchestration run"
                >
                  <StopIcon className="w-5 h-5 mr-2" />
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="submit"
                disabled={!goal.trim() || !requiredFilled || isOrchestrating}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg flex items-center transition-colors disabled:bg-indigo-400 disabled:cursor-not-allowed"
              >
                <RunIcon className="w-5 h-5 mr-2" />
                Start App Lifecycle
              </button>
            )}
        </div>
        <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-400">Optional:</span>
            <div className="flex items-center gap-2">
                <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()} 
                    className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-gray-700 hover:bg-gray-600 transition-colors disabled:opacity-50"
                    disabled={isOrchestrating}
                >
                    <UploadIcon className="w-4 h-4" />
                    {file ? 'Change File' : 'Upload File'}
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".txt,.js,.py,.json,.md,.csv,.html,.css"/>
                {file && (
                    <div className="flex items-center gap-2 bg-gray-800 px-2 py-1 rounded">
                        <span className="font-mono text-xs">{file.name}</span>
                        <button onClick={clearFile} disabled={isOrchestrating} className="p-0.5 rounded-full hover:bg-gray-600">
                           <CloseIcon className="w-3 h-3" />
                        </button>
                    </div>
                )}
            </div>
        </div>
      </form>
    </div>
  );
};

export default GoalInput;
