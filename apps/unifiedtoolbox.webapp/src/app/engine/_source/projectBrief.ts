import { ArtifactType, type Artifact } from './types'

export type BriefUserGroup = 'me' | 'team' | 'customers' | 'public'
export type BriefRunLocation = 'my_computer' | 'company_network' | 'cloud_hosted' | 'not_sure'
export type BriefTriState = 'yes' | 'no' | 'not_sure'
export type BriefInputs = 'manual_entry' | 'upload_files' | 'connect_system' | 'public_data'
export type BriefOutputs = 'dashboard' | 'report' | 'alerts' | 'export' | 'other'
export type BriefDataSource = 'manual' | 'files' | 'existing_system' | 'public'
export type BriefExports = 'none' | 'csv' | 'excel' | 'pdf'
export type BriefPerformance = 'no_preference' | 'feels_fast' | 'loads_under_3s'

export type ProjectBrief = {
  schemaVersion: 1
  createdAt: string

  goal: string
  users: BriefUserGroup
  coreWorkflow: string[]

  inputs: BriefInputs[]
  outputs: BriefOutputs[]

  mustHave: string[]
  niceToHave: string[]

  runLocation: BriefRunLocation
  offline: BriefTriState

  dataSource: BriefDataSource
  hasCredentials: BriefTriState

  sensitivity: BriefTriState

  successCriteria: string[]

  demo_mode_required: boolean

  nonFunctional: {
    mobileFriendly: boolean
    exports: BriefExports
    performance: BriefPerformance
  }
}

const uniq = (values: string[]) => Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)))

export function buildProjectBrief(input: {
  goal: string
  users: BriefUserGroup
  coreWorkflow: string[]
  inputs: BriefInputs[]
  outputs: BriefOutputs[]
  mustHave: string[]
  niceToHave: string[]
  runLocation: BriefRunLocation
  offline: BriefTriState
  dataSource: BriefDataSource
  hasCredentials: BriefTriState
  sensitivity: BriefTriState
  successCriteria: string[]
  demo_mode_required: boolean
  nonFunctional: { mobileFriendly: boolean; exports: BriefExports; performance: BriefPerformance }
}): ProjectBrief {
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    goal: input.goal.trim(),
    users: input.users,
    coreWorkflow: uniq(input.coreWorkflow).slice(0, 5),
    inputs: Array.from(new Set(input.inputs)),
    outputs: Array.from(new Set(input.outputs)),
    mustHave: uniq(input.mustHave).slice(0, 12),
    niceToHave: uniq(input.niceToHave).slice(0, 12),
    runLocation: input.runLocation,
    offline: input.offline,
    dataSource: input.dataSource,
    hasCredentials: input.hasCredentials,
    sensitivity: input.sensitivity,
    successCriteria: uniq(input.successCriteria).slice(0, 8),
    demo_mode_required: Boolean(input.demo_mode_required),
    nonFunctional: input.nonFunctional,
  }
}

function labelUsers(u: BriefUserGroup) {
  switch (u) {
    case 'me':
      return 'Me'
    case 'team':
      return 'My team'
    case 'customers':
      return 'Customers'
    case 'public':
      return 'The public'
  }
}

function labelRunLocation(loc: BriefRunLocation) {
  switch (loc) {
    case 'my_computer':
      return 'My computer'
    case 'company_network':
      return 'Company network'
    case 'cloud_hosted':
      return 'Cloud-hosted'
    case 'not_sure':
      return 'Not sure'
  }
}

function labelTri(value: BriefTriState) {
  if (value === 'yes') return 'Yes'
  if (value === 'no') return 'No'
  return 'Not sure'
}

function labelInputs(values: BriefInputs[]) {
  const map: Record<BriefInputs, string> = {
    manual_entry: 'Manual entry',
    upload_files: 'Upload files',
    connect_system: 'Connect to a system',
    public_data: 'Public data',
  }
  return values.map((v) => map[v]).join(', ') || 'Not specified'
}

function labelOutputs(values: BriefOutputs[]) {
  const map: Record<BriefOutputs, string> = {
    dashboard: 'Dashboard',
    report: 'Report',
    alerts: 'Alerts',
    export: 'Export',
    other: 'Other',
  }
  return values.map((v) => map[v]).join(', ') || 'Not specified'
}

function labelDataSource(v: BriefDataSource) {
  switch (v) {
    case 'manual':
      return 'Manual entry'
    case 'files':
      return 'Files'
    case 'existing_system':
      return 'Existing system'
    case 'public':
      return 'Public data'
  }
}

function labelPerformance(v: BriefPerformance) {
  switch (v) {
    case 'no_preference':
      return 'No preference'
    case 'feels_fast':
      return 'Feels fast'
    case 'loads_under_3s':
      return 'Loads under about 3 seconds'
  }
}

function labelExports(v: BriefExports) {
  switch (v) {
    case 'none':
      return 'None'
    case 'csv':
      return 'CSV'
    case 'excel':
      return 'Excel'
    case 'pdf':
      return 'PDF'
  }
}

export function synthesizeOrchestratorPrompt(brief: ProjectBrief): string {
  const workflow = brief.coreWorkflow.length
    ? brief.coreWorkflow.map((s, i) => `${i + 1}) ${s}`).join('\n')
    : '(not specified)'

  const acceptance = renderAcceptance(brief).split('\n').filter((l) => l.startsWith('- ')).join('\n')

  const json = JSON.stringify(brief, null, 2)

  return [
    `Build a runnable MVP tool.`,
    ``,
    `What it should help with: ${brief.goal}`,
    `Who will use it: ${labelUsers(brief.users)}`,
    ``,
    `Most common workflow:`,
    workflow,
    ``,
    `Inputs: ${labelInputs(brief.inputs)}`,
    `Outputs: ${labelOutputs(brief.outputs)}`,
    ``,
    `Where it runs: ${labelRunLocation(brief.runLocation)}`,
    `Works offline: ${labelTri(brief.offline)}`,
    ``,
    `Where the data comes from: ${labelDataSource(brief.dataSource)}`,
    `Credentials available now: ${labelTri(brief.hasCredentials)}`,
    `Handles sensitive info: ${labelTri(brief.sensitivity)}`,
    ``,
    `Mobile friendly: ${brief.nonFunctional.mobileFriendly ? 'Yes' : 'No preference'}`,
    `Exports: ${labelExports(brief.nonFunctional.exports)}`,
    `Performance: ${labelPerformance(brief.nonFunctional.performance)}`,
    ``,
    `Demo mode required: ${brief.demo_mode_required ? 'Yes' : 'No'}`,
    ``,
    `Acceptance checks (human terms):`,
    acceptance || '- (not specified)',
    ``,
    `Canonical input (project_brief.json):`,
    json,
  ].join('\n')
}

export function renderPRD(brief: ProjectBrief): string {
  const lines: string[] = []
  lines.push('# Product Brief (Plain Language)')
  lines.push('')
  lines.push(`## Goal`)
  lines.push('')
  lines.push(brief.goal || '(not specified)')
  lines.push('')
  lines.push('## Who it is for')
  lines.push('')
  lines.push(`- ${labelUsers(brief.users)}`)
  lines.push('')
  lines.push('## Core workflow')
  lines.push('')
  if (brief.coreWorkflow.length) {
    for (const step of brief.coreWorkflow) lines.push(`- ${step}`)
  } else {
    lines.push('- (not specified)')
  }
  lines.push('')
  lines.push('## Inputs and outputs')
  lines.push('')
  lines.push(`- Inputs: ${labelInputs(brief.inputs)}`)
  lines.push(`- Outputs: ${labelOutputs(brief.outputs)}`)
  lines.push('')
  lines.push('## Must-have')
  lines.push('')
  if (brief.mustHave.length) for (const m of brief.mustHave) lines.push(`- ${m}`)
  else lines.push('- (none specified)')
  lines.push('')
  lines.push('## Nice-to-have')
  lines.push('')
  if (brief.niceToHave.length) for (const m of brief.niceToHave) lines.push(`- ${m}`)
  else lines.push('- (none specified)')
  lines.push('')
  lines.push('## Where it runs')
  lines.push('')
  lines.push(`- ${labelRunLocation(brief.runLocation)}`)
  lines.push(`- Offline: ${labelTri(brief.offline)}`)
  lines.push('')
  lines.push('## Data and access')
  lines.push('')
  lines.push(`- Data source: ${labelDataSource(brief.dataSource)}`)
  lines.push(`- Credentials available now: ${labelTri(brief.hasCredentials)}`)
  lines.push('')
  lines.push('## Sensitivity')
  lines.push('')
  lines.push(`- Handles sensitive info: ${labelTri(brief.sensitivity)}`)
  lines.push('')
  lines.push('## Success criteria')
  lines.push('')
  if (brief.successCriteria.length) for (const s of brief.successCriteria) lines.push(`- ${s}`)
  else lines.push('- (not specified)')
  lines.push('')
  lines.push('## Non-functional preferences')
  lines.push('')
  lines.push(`- Mobile friendly: ${brief.nonFunctional.mobileFriendly ? 'Yes' : 'No preference'}`)
  lines.push(`- Exports: ${labelExports(brief.nonFunctional.exports)}`)
  lines.push(`- Performance: ${labelPerformance(brief.nonFunctional.performance)}`)
  lines.push('')
  lines.push('## Demo mode')
  lines.push('')
  lines.push(brief.demo_mode_required ? '- Must run without any keys, with realistic sample data.' : '- Demo mode not required.')
  lines.push('')
  return lines.join('\n')
}

export function renderAcceptance(brief: ProjectBrief): string {
  const lines: string[] = []
  lines.push('# Acceptance Checks')
  lines.push('')

  const checks = [...brief.successCriteria]
  if (brief.demo_mode_required) {
    checks.unshift('The primary workflow is usable end-to-end in demo mode.')
    checks.unshift('The app runs without any API keys and shows realistic sample data.')
  }

  const uniqChecks = uniq(checks).slice(0, 10)
  if (uniqChecks.length) {
    for (const c of uniqChecks) lines.push(`- ${c}`)
  } else {
    lines.push('- (not specified)')
  }
  lines.push('')
  return lines.join('\n')
}

export function renderMvpPromise(brief: ProjectBrief): string {
  const lines: string[] = []
  lines.push('# MVP Promise')
  lines.push('')
  lines.push('## What you get')
  lines.push('')
  lines.push('- A runnable MVP you can open and use.')
  lines.push('- A simple main workflow that matches the steps you described.')
  lines.push('- Clear acceptance checks and a demo mode (unless you opted out).')
  lines.push('')
  lines.push('## How to run locally (simple steps)')
  lines.push('')
  lines.push('1. Open the project folder.')
  lines.push('2. Follow the README to start it.')
  lines.push('3. If the README includes commands, run them exactly as written.')
  lines.push('')
  lines.push('## Demo mode behavior')
  lines.push('')
  if (brief.demo_mode_required) {
    lines.push('- Runs without any API keys.')
    lines.push('- Uses realistic sample data so the main workflow works end-to-end.')
  } else {
    lines.push('- Demo mode is not required for this MVP.')
  }
  lines.push('')
  lines.push('## What is stubbed or mocked vs real')
  lines.push('')
  if (brief.demo_mode_required) {
    lines.push('- Any external connections can be mocked with sample data in demo mode.')
    lines.push('- When you add real credentials later, the app can switch from sample data to real data.')
  } else {
    lines.push('- External connections may be required to see real data.')
  }
  lines.push('')
  lines.push('## Next steps after MVP')
  lines.push('')
  lines.push('- Add real connections (if needed) and keep the demo mode as a fallback.')
  lines.push('- Improve visuals and speed based on real usage.')
  lines.push('- Add the nice-to-have items in small, testable steps.')
  lines.push('')
  return lines.join('\n')
}

export function buildBriefArtifacts(brief: ProjectBrief): Artifact[] {
  const projectBriefJson = JSON.stringify(brief, null, 2) + '\n'
  return [
    { id: `brief_${brief.createdAt}`, name: 'project_brief.json', type: ArtifactType.CODE, content: projectBriefJson },
    { id: `prd_${brief.createdAt}`, name: 'PRD.md', type: ArtifactType.REPORT, content: renderPRD(brief) },
    { id: `acc_${brief.createdAt}`, name: 'ACCEPTANCE.md', type: ArtifactType.REPORT, content: renderAcceptance(brief) },
    { id: `mvp_${brief.createdAt}`, name: 'MVP_PROMISE.md', type: ArtifactType.REPORT, content: renderMvpPromise(brief) },
  ]
}

