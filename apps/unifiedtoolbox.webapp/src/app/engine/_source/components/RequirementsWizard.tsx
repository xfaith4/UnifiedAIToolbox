import React, { useMemo, useRef, useState } from 'react'
import { LoadingIcon, StopIcon, UploadIcon, CloseIcon, RunIcon } from './icons'
import type { Artifact } from '../types'
import {
  buildBriefArtifacts,
  buildProjectBrief,
  synthesizeOrchestratorPrompt,
  type BriefDataSource,
  type BriefExports,
  type BriefInputs,
  type BriefOutputs,
  type BriefPerformance,
  type BriefRunLocation,
  type BriefTriState,
  type BriefUserGroup,
} from '../projectBrief'

type Props = {
  isOrchestrating: boolean
  onCancelOrchestration: () => void
  onStart: (goal: string, fileContent: string | null, seedArtifacts: Artifact[]) => void
}

const steps = [
  { id: 'goal', title: 'Goal' },
  { id: 'users', title: 'Users' },
  { id: 'workflow', title: 'Core workflow' },
  { id: 'io', title: 'Inputs & outputs' },
  { id: 'context', title: 'Data & access' },
  { id: 'success', title: 'Success' },
] as const

const splitLines = (value: string) =>
  value
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean)

const RequirementsWizard: React.FC<Props> = ({ isOrchestrating, onCancelOrchestration, onStart }) => {
  const [stepIndex, setStepIndex] = useState(0)
  const [goal, setGoal] = useState('')
  const [users, setUsers] = useState<BriefUserGroup>('me')
  const [coreWorkflow, setCoreWorkflow] = useState<string[]>(['', '', ''])
  const [inputs, setInputs] = useState<BriefInputs[]>(['manual_entry'])
  const [outputs, setOutputs] = useState<BriefOutputs[]>(['dashboard'])
  const [mustHave, setMustHave] = useState('')
  const [niceToHave, setNiceToHave] = useState('')
  const [runLocation, setRunLocation] = useState<BriefRunLocation>('my_computer')
  const [offline, setOffline] = useState<BriefTriState>('not_sure')
  const [dataSource, setDataSource] = useState<BriefDataSource>('manual')
  const [hasCredentials, setHasCredentials] = useState<BriefTriState>('not_sure')
  const [sensitivity, setSensitivity] = useState<BriefTriState>('not_sure')
  const [demoModeRequired, setDemoModeRequired] = useState(true)
  const [mobileFriendly, setMobileFriendly] = useState(true)
  const [exportsPref, setExportsPref] = useState<BriefExports>('none')
  const [performance, setPerformance] = useState<BriefPerformance>('feels_fast')
  const [successCriteria, setSuccessCriteria] = useState<string[]>(['', ''])

  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const current = steps[stepIndex]
  const canGoNext = useMemo(() => {
    if (isOrchestrating) return false
    if (!current) return false
    if (current.id === 'goal') return goal.trim().length > 3
    if (current.id === 'workflow') return splitLines(coreWorkflow.join('\n')).length >= 3
    return true
  }, [current, goal, coreWorkflow, isOrchestrating])

  const toggleSet = <T,>(values: T[], value: T) => (values.includes(value) ? values.filter((v) => v !== value) : [...values, value])

  const updateWorkflow = (idx: number, value: string) => {
    const next = [...coreWorkflow]
    next[idx] = value
    setCoreWorkflow(next)
  }

  const updateSuccess = (idx: number, value: string) => {
    const next = [...successCriteria]
    next[idx] = value
    setSuccessCriteria(next)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) setFile(e.target.files[0])
  }

  const clearFile = () => {
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleStart = async () => {
    if (isOrchestrating) return
    const brief = buildProjectBrief({
      goal,
      users,
      coreWorkflow,
      inputs,
      outputs,
      mustHave: splitLines(mustHave),
      niceToHave: splitLines(niceToHave),
      runLocation,
      offline,
      dataSource,
      hasCredentials,
      sensitivity,
      successCriteria,
      demo_mode_required: demoModeRequired,
      nonFunctional: { mobileFriendly, exports: exportsPref, performance },
    })

    const seedArtifacts = buildBriefArtifacts(brief)
    const prompt = synthesizeOrchestratorPrompt(brief)

    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const content = event.target?.result as string
        onStart(prompt, content || null, seedArtifacts)
      }
      reader.onerror = () => alert('Error reading file.')
      reader.readAsText(file)
      return
    }

    onStart(prompt, null, seedArtifacts)
  }

  return (
    <div className="p-4 border-b border-gray-700 bg-gray-900/50">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-200">Quick Requirements Wizard</div>
            <div className="text-xs text-gray-400 mt-1">Answer a few questions. This should take under 3 minutes.</div>
          </div>

          {isOrchestrating ? (
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="px-4 py-2 bg-gray-700 text-white font-semibold rounded-lg flex items-center cursor-default">
                <LoadingIcon className="w-5 h-5 mr-2 animate-spin" />
                Running...
              </div>
              <button
                type="button"
                onClick={onCancelOrchestration}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg flex items-center transition-colors"
              >
                <StopIcon className="w-5 h-5 mr-2" />
                Cancel
              </button>
            </div>
          ) : (
            <div className="text-xs text-gray-500">
              Step {stepIndex + 1} of {steps.length}: {current?.title}
            </div>
          )}
        </div>

        <div className="mt-3 h-2 w-full rounded-full bg-gray-900/40 overflow-hidden">
          <div className="h-full bg-indigo-500/70" style={{ width: `${Math.round(((stepIndex + 1) / steps.length) * 100)}%` }} />
        </div>

        <div className="mt-4 rounded-lg border border-gray-700 bg-gray-800/40 p-4">
          {current?.id === 'goal' && (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-gray-200">What should this tool help you accomplish?</div>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Example: Help me track projects and send reminders so nothing slips."
                className="w-full min-h-[90px] px-3 py-2 bg-gray-900/40 border border-gray-700 rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm"
                disabled={isOrchestrating}
              />
              <div className="text-[11px] text-gray-500">Keep it simple. One or two sentences is enough.</div>
            </div>
          )}

          {current?.id === 'users' && (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-gray-200">Who will use it?</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {(
                  [
                    ['me', 'Me'],
                    ['team', 'My team'],
                    ['customers', 'Customers'],
                    ['public', 'Public'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={isOrchestrating}
                    onClick={() => setUsers(value)}
                    className={`px-3 py-2 rounded border text-sm transition-colors ${
                      users === value ? 'bg-indigo-600/30 border-indigo-500 text-indigo-100' : 'bg-gray-900/40 border-gray-700 text-gray-200 hover:bg-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {current?.id === 'workflow' && (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-gray-200">What are the 3–5 steps a user takes most often?</div>
              <div className="space-y-2">
                {coreWorkflow.map((value, idx) => (
                  <input
                    key={idx}
                    value={value}
                    onChange={(e) => updateWorkflow(idx, e.target.value)}
                    placeholder={`Step ${idx + 1}`}
                    className="w-full px-3 py-2 bg-gray-900/40 border border-gray-700 rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm"
                    disabled={isOrchestrating}
                  />
                ))}
                {coreWorkflow.length < 5 && (
                  <button
                    type="button"
                    disabled={isOrchestrating}
                    onClick={() => setCoreWorkflow([...coreWorkflow, ''])}
                    className="text-xs px-3 py-2 rounded border border-gray-700 hover:bg-gray-700 text-gray-300"
                  >
                    + Add another step
                  </button>
                )}
              </div>
              <div className="text-[11px] text-gray-500">Example: “Sign in → Choose a project → Add a task → Get reminders”.</div>
            </div>
          )}

          {current?.id === 'io' && (
            <div className="space-y-4">
              <div>
                <div className="text-sm font-semibold text-gray-200">What information does it need?</div>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  {(
                    [
                      ['manual_entry', 'Manual entry'],
                      ['upload_files', 'Upload files'],
                      ['connect_system', 'Connect to a system'],
                      ['public_data', 'Public data'],
                    ] as const
                  ).map(([id, label]) => (
                    <label key={id} className="flex items-center gap-2 bg-gray-900/40 border border-gray-700 rounded px-3 py-2">
                      <input
                        type="checkbox"
                        disabled={isOrchestrating}
                        checked={inputs.includes(id)}
                        onChange={() => setInputs((cur) => toggleSet(cur, id))}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-gray-200">What should it produce?</div>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  {(
                    [
                      ['dashboard', 'Dashboard'],
                      ['report', 'Report'],
                      ['alerts', 'Alerts'],
                      ['export', 'Export'],
                      ['other', 'Other'],
                    ] as const
                  ).map(([id, label]) => (
                    <label key={id} className="flex items-center gap-2 bg-gray-900/40 border border-gray-700 rounded px-3 py-2">
                      <input
                        type="checkbox"
                        disabled={isOrchestrating}
                        checked={outputs.includes(id)}
                        onChange={() => setOutputs((cur) => toggleSet(cur, id))}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {current?.id === 'context' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-200">Where do you want it to run?</div>
                  <select
                    value={runLocation}
                    onChange={(e) => setRunLocation(e.target.value as BriefRunLocation)}
                    disabled={isOrchestrating}
                    className="mt-2 w-full px-3 py-2 bg-gray-900/40 border border-gray-700 rounded text-sm"
                  >
                    <option value="my_computer">My computer</option>
                    <option value="company_network">Company network</option>
                    <option value="cloud_hosted">Cloud-hosted</option>
                    <option value="not_sure">Not sure</option>
                  </select>

                  <div className="mt-3 text-sm font-semibold text-gray-200">Does it need to work offline?</div>
                  <select
                    value={offline}
                    onChange={(e) => setOffline(e.target.value as BriefTriState)}
                    disabled={isOrchestrating}
                    className="mt-2 w-full px-3 py-2 bg-gray-900/40 border border-gray-700 rounded text-sm"
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                    <option value="not_sure">Not sure</option>
                  </select>
                </div>

                <div>
                  <div className="text-sm font-semibold text-gray-200">Where does the data come from?</div>
                  <select
                    value={dataSource}
                    onChange={(e) => setDataSource(e.target.value as BriefDataSource)}
                    disabled={isOrchestrating}
                    className="mt-2 w-full px-3 py-2 bg-gray-900/40 border border-gray-700 rounded text-sm"
                  >
                    <option value="manual">Manual entry</option>
                    <option value="files">Files</option>
                    <option value="existing_system">Existing system</option>
                    <option value="public">Public data</option>
                  </select>

                  <div className="mt-3 text-sm font-semibold text-gray-200">Do you already have API keys or credentials?</div>
                  <select
                    value={hasCredentials}
                    onChange={(e) => setHasCredentials(e.target.value as BriefTriState)}
                    disabled={isOrchestrating}
                    className="mt-2 w-full px-3 py-2 bg-gray-900/40 border border-gray-700 rounded text-sm"
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                    <option value="not_sure">Not sure</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-200">Does it handle personal / financial / health info?</div>
                  <select
                    value={sensitivity}
                    onChange={(e) => setSensitivity(e.target.value as BriefTriState)}
                    disabled={isOrchestrating}
                    className="mt-2 w-full px-3 py-2 bg-gray-900/40 border border-gray-700 rounded text-sm"
                  >
                    <option value="not_sure">Not sure</option>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>

                <div className="rounded border border-gray-700 bg-gray-900/30 p-3">
                  <div className="text-sm font-semibold text-gray-200">Demo mode (recommended)</div>
                  <label className="mt-2 flex items-center gap-2 text-sm text-gray-200">
                    <input
                      type="checkbox"
                      checked={demoModeRequired}
                      onChange={(e) => setDemoModeRequired(e.target.checked)}
                      disabled={isOrchestrating}
                    />
                    Make it run with realistic sample data, even with no keys
                  </label>
                  <div className="text-[11px] text-gray-500 mt-1">
                    This makes the MVP runnable in demos and first-time setup.
                  </div>
                </div>
              </div>
            </div>
          )}

          {current?.id === 'success' && (
            <div className="space-y-4">
              <div>
                <div className="text-sm font-semibold text-gray-200">Must-have vs nice-to-have</div>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-semibold text-gray-400">Must-have (one per line)</div>
                    <textarea
                      value={mustHave}
                      onChange={(e) => setMustHave(e.target.value)}
                      placeholder="Example:\nSign in\nCreate and edit items\nSearch"
                      className="mt-2 w-full min-h-[110px] px-3 py-2 bg-gray-900/40 border border-gray-700 rounded text-sm"
                      disabled={isOrchestrating}
                    />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-400">Nice-to-have (one per line)</div>
                    <textarea
                      value={niceToHave}
                      onChange={(e) => setNiceToHave(e.target.value)}
                      placeholder="Example:\nEmail reminders\nExport\nDark mode"
                      className="mt-2 w-full min-h-[110px] px-3 py-2 bg-gray-900/40 border border-gray-700 rounded text-sm"
                      disabled={isOrchestrating}
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-gray-200">How will you know it’s working? (2–8 bullets)</div>
                <div className="mt-2 space-y-2">
                  {successCriteria.map((value, idx) => (
                    <input
                      key={idx}
                      value={value}
                      onChange={(e) => updateSuccess(idx, e.target.value)}
                      placeholder={`Success check ${idx + 1}`}
                      className="w-full px-3 py-2 bg-gray-900/40 border border-gray-700 rounded text-sm"
                      disabled={isOrchestrating}
                    />
                  ))}
                  {successCriteria.length < 8 && (
                    <button
                      type="button"
                      disabled={isOrchestrating}
                      onClick={() => setSuccessCriteria([...successCriteria, ''])}
                      className="text-xs px-3 py-2 rounded border border-gray-700 hover:bg-gray-700 text-gray-300"
                    >
                      + Add another success check
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="flex items-center gap-2 bg-gray-900/40 border border-gray-700 rounded px-3 py-2 text-sm">
                  <input type="checkbox" checked={mobileFriendly} onChange={(e) => setMobileFriendly(e.target.checked)} disabled={isOrchestrating} />
                  Should it work well on mobile?
                </label>

                <div className="bg-gray-900/40 border border-gray-700 rounded px-3 py-2 text-sm">
                  <div className="text-xs font-semibold text-gray-400">Do you need exports?</div>
                  <select value={exportsPref} onChange={(e) => setExportsPref(e.target.value as BriefExports)} disabled={isOrchestrating} className="mt-1 w-full bg-transparent">
                    <option value="none">None</option>
                    <option value="csv">CSV</option>
                    <option value="excel">Excel</option>
                    <option value="pdf">PDF</option>
                  </select>
                </div>

                <div className="bg-gray-900/40 border border-gray-700 rounded px-3 py-2 text-sm">
                  <div className="text-xs font-semibold text-gray-400">Performance expectations</div>
                  <select value={performance} onChange={(e) => setPerformance(e.target.value as BriefPerformance)} disabled={isOrchestrating} className="mt-1 w-full bg-transparent">
                    <option value="no_preference">No preference</option>
                    <option value="feels_fast">Feels fast</option>
                    <option value="loads_under_3s">Loads under ~3s</option>
                  </select>
                </div>
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
                    {file ? 'Change File' : 'Add a File'}
                  </button>
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".txt,.js,.py,.json,.md,.csv,.html,.css" />
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
            </div>
          )}
        </div>

        {!isOrchestrating && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              disabled={stepIndex === 0}
              className="px-4 py-2 rounded border border-gray-700 bg-gray-900/40 hover:bg-gray-700 text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Back
            </button>

            <div className="flex items-center gap-2">
              {stepIndex < steps.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
                  disabled={!canGoNext}
                  className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:bg-indigo-400 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={!goal.trim() || splitLines(coreWorkflow.join('\n')).length < 3}
                  className="px-5 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center disabled:bg-indigo-400 disabled:cursor-not-allowed"
                >
                  <RunIcon className="w-5 h-5 mr-2" />
                  Start App Factory
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default RequirementsWizard

