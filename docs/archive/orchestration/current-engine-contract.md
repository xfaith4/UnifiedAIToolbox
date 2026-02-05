# Current Engine Contract (UI)

This document describes the **current** orchestration “engine status payload” shape that the Next.js UI consumes.

## Snapshot shape

The UI reads a snapshot from `useOrchestrator()` (backed by `orchestratorRuntime.ts`):

```ts
type OrchestratorSnapshot = {
  session: Session | null
  history: Session[]
  isOrchestrating: boolean
  isComplete: boolean
  pipeline: EnginePipelinePayload
}
```

For the pipeline schema, see `docs/engine-status-schema.md`.

## Session

`Session` is the persisted unit of work shown in the UI history and used for App Factory export-by-`sessionId`.

Key fields used by the UI and export path:
- `id: string`
- `goal: string`
- `date?: string`
- `tasks: Task[]`

## Task

Each `Task` represents one planned step in the DAG.

Key fields:
- `id: string`
- `name: string` (planner may embed a filename in parentheses)
- `status: PENDING | RUNNING | COMPLETED | FAILED`
- `dependencies: string[]` (task ids)
- `agent: { role: string; specialization?: string; log: string[] }`
- `artifacts: Artifact[]`

## Artifact

Artifacts are the primary “outputs” of tasks.

Key fields:
- `id: string`
- `name: string` (often treated as a relative path during export)
- `type: CODE | REPORT | IMAGE`
- `content: string` (base64 for images)

## Notes

- The `/api/engine/history` endpoint persists sessions to `data/orchestrator-history/sessions.json`.
- The App Factory export endpoint can accept a `sessionId` and load artifacts from that history file.
