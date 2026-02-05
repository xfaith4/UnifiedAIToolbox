# Engine Status Schema

Purpose: Define the engine run-status snapshot consumed by the App Factory UI.

This snapshot is produced by `useOrchestrator()` and extended with a `pipeline` object when `HARDENING_PIPELINE=true`.

## Snapshot

```ts
type OrchestratorSnapshot = {
  session: Session | null
  history: Session[]
  isOrchestrating: boolean
  isComplete: boolean
  pipeline: EnginePipelinePayload
}
```

## Pipeline payload

```ts
type PipelineStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped'

type PipelineStage = {
  id: 'agents' | 'assemble' | 'normalize' | 'contract' | 'gates' | 'repair' | 'export'
  label: string
  status: PipelineStatus
  startedAt?: string
  endedAt?: string
  reportPath?: string
}

type PipelineGateCheck = {
  id: 'install' | 'typecheck' | 'lint' | 'build' | 'test' | 'boot' | 'env-docs'
  label: string
  status: PipelineStatus
  logPath?: string
  reportPath?: string
}

type PipelineRepair = {
  status: PipelineStatus
  cycle: number
  maxCycles: number
}

type EnginePipelinePayload = {
  hardeningEnabled: boolean
  runId: string | null
  repoDir: string | null
  stages: PipelineStage[]
  gates: { checks: PipelineGateCheck[] }
  repair: PipelineRepair
}
```

## Session, task, and artifact

`Session` is the persisted unit of work shown in history and used for App Factory export-by-`sessionId`.

Key `Session` fields used by the UI and export path:
- `id: string`
- `goal: string`
- `date?: string`
- `tasks: Task[]`

Each `Task` represents one planned step in the DAG:
- `id: string`
- `name: string`
- `status: PENDING | RUNNING | COMPLETED | FAILED`
- `dependencies: string[]`
- `agent: { role: string; specialization?: string; log: string[] }`
- `artifacts: Artifact[]`

Artifacts are the primary task outputs:
- `id: string`
- `name: string` (often treated as a relative path during export)
- `type: CODE | REPORT | IMAGE`
- `content: string` (base64 for images)

## Where statuses come from

- `agents`: driven by the in-browser orchestration runtime.
- `assemble/normalize/contract/gates/repair`: produced by `/api/app-factory/validate` when hardening is enabled.
- `runId`: the App Factory run id under `.uaitoolbox/app-factory/runs/<runId>/`.
- `logPath/reportPath`: repo-relative paths resolved via `/api/app-factory/file`.

## UI behavior

- The pipeline stepper and “Acceptance Checks” bind to `snapshot.pipeline`.
- When `hardeningEnabled=true`, the export flow runs `/api/app-factory/validate` and only enables “Download .zip” after `normalize+contract+gates` are `passed`.

## Related docs
- [Orchestration](orchestration.md)
- [Hardening](hardening.md)
