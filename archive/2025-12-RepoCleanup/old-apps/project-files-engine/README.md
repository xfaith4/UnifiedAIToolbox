# Engine — DAG Builder Stubs

This folder contains the first pass of the Agentic DAG interfaces and a PS module to bridge your current linear flow to a DAG without breaking existing runs.

## Files
- `DagBuilder.psm1` — PowerShell 5.1/7+ module with:
  - `New-AOPlan` — create a plan
  - `Convert-AOPlanToDag` — linear → DAG (trivial branch)
  - `Start-AODag` — validates and emits Manifest v2 shape (no execution yet)
- `Schema/manifest.v2.schema.json` — minimal JSON schema
- `types/dag.ts` — dashboard-side TypeScript contracts

## Try it (PowerShell)
```powershell
Import-Module "$PSScriptRoot/DagBuilder.psm1" -Force
$plan = New-AOPlan -Name 'Demo' -Inputs @{ prompt = 'Hello' }
$dag  = Convert-AOPlanToDag -Plan $plan -Concurrency 3
$manifest = Start-AODag -Dag $dag
$manifest | ConvertTo-Json -Depth 10
```
