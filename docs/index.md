# Documentation Index

This index is the canonical map of documentation in the Unified AI Toolbox repository.

## Canonical documents

- **Roadmap (single source of truth):** [ROADMAP.md](ROADMAP.md)
- **Information architecture:** [information-architecture.md](information-architecture.md)
- **Architecture overview:** [Unified-AI-Toolbox-Architecture.md](Unified-AI-Toolbox-Architecture.md)
- **Orchestration experience roadmap:** [orchestration-experience-roadmap.md](orchestration-experience-roadmap.md)
- **Application production path:** [application-production-path.md](application-production-path.md)
- **Future agent handoff (app production):** [future-agent-handoff-app-production.md](future-agent-handoff-app-production.md)
- **Frontier software factory strategy:** [frontier-software-factory-strategy.md](frontier-software-factory-strategy.md)

## Orchestration contracts (2026-05, source of truth)

- **A2A envelope:** [contracts/A2A_CONTRACT.md](contracts/A2A_CONTRACT.md)
- **Run lifecycle (8 canonical statuses):** [contracts/RUN_LIFECYCLE.md](contracts/RUN_LIFECYCLE.md)
- **Event taxonomy (13 canonical event types):** [contracts/EVENT_TAXONOMY.md](contracts/EVENT_TAXONOMY.md)
- **Decision Lock (blocker severity):** [contracts/DECISION_LOCK.md](contracts/DECISION_LOCK.md)
- **Failure treatment policy (planner-first routing):** [contracts/FAILURE_TREATMENT_POLICY.md](contracts/FAILURE_TREATMENT_POLICY.md)

## Operating a run

- **Acceptance checklist (modernization gate):** [ACCEPTANCE_CHECKLIST.md](ACCEPTANCE_CHECKLIST.md)
- **How to evaluate a run:** [EVALUATING_A_RUN.md](EVALUATING_A_RUN.md)
- **Troubleshooting:** [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **Changelog:** [../CHANGELOG.md](../CHANGELOG.md)

## Apps and services

> Each app/service should keep a short README near its code. This index links to them so nothing goes undiscovered.

- **Orchestration Bridge:** `apps/orchestration-bridge/README.md`
- **UnifiedToolbox Web App:** `apps/unifiedtoolbox.webapp/README.md`
- **UnifiedPromptApp:** `UnifiedPromptApp/README.md` (if present)

## Runbooks

- **Task Executor Runbook:** `apps/orchestration-bridge/TASK_EXECUTOR_RUNBOOK.md`
- **Merge Coordinator Runbook:** `apps/orchestration-bridge/MERGE_COORDINATOR_RUNBOOK.md`
- Add additional operational procedures here as they appear.

## Tooling

- **Repo sweep / inventory script:** `Sweep-RepoManifests.ps1`
- Other tooling docs: link here

## Generated index (optional)

If enabled, the repo sweep can generate a machine-built Markdown index:

- `docs/index.generated.md`

Use it as a discovery helper, but keep *this* file as the curated top-level map.
