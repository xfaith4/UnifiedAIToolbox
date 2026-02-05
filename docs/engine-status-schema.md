# Engine Status Schema (UI)

This document describes the **engine run-status payload** consumed by the App Factory “Engine” UI (`apps/unifiedtoolbox.webapp/src/app/engine/_source/`).

It extends the existing snapshot with a `pipeline` object that reflects real repo hardening outcomes **when `HARDENING_PIPELINE=true`**.

## Top-level snapshot

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

## Where statuses come from

- `agents`: driven by the in-browser orchestration runtime.
- `assemble/normalize/contract/gates/repair`: produced by `/api/app-factory/validate` when hardening is enabled.
- `runId`: the App Factory run id under `.uaitoolbox/app-factory/runs/<runId>/`.
- `logPath/reportPath`: repo-relative paths resolved via `/api/app-factory/file`.

## UI behavior

- The pipeline stepper and “Acceptance Checks” bind to `snapshot.pipeline`.
- When `hardeningEnabled=true`, the export flow runs `/api/app-factory/validate` and only enables “Download .zip” after `normalize+contract+gates` are `passed`.

