# job_types.json (SSOT)

`job_types.json` is the single source of truth for job-type routing, contract defaults, and policy enforcement.

## Top-Level Shape

```json
{
  "schema_version": "1.1",
  "job_types": {
    "<job_type>": {
      "label": "Human-friendly name",
      "request_schema": "contracts/<request_schema>.json",
      "contract_schema": "contracts/<contract_schema>.json",
      "pipeline_template": "pipelines/<pipeline>.json",
      "default_agents": ["Researcher", "..."],
      "defaults": {
        "schema_version": "1.0",
        "budget": { "max_time_minutes": 60 },
        "logging": { "level": "info" }
      },
      "gate_policy": { "...": "..." },
      "artifact_policy": { "...": "..." },
      "command_policy": { "...": "..." },
      "supervisor_policy": { "...": "..." },
      "contract_defaults": { "...": "..." },
      "stage_policy": { "...": "..." }
    }
  }
}
```

## Field Notes

- `request_schema`: JSON schema for the minimal request payload (UI/submitter side).
- `contract_schema`: JSON schema for the expanded contract after compilation.
- `pipeline_template`: Pipeline stage definitions for the job type.
- `default_agents`: Default agent roster used when request omits `agent_roster`.
- `defaults`: Common contract defaults (schema_version, budget, logging).
- `contract_defaults`: Job-specific defaults merged into the expanded contract.
- `gate_policy`: Default gate expectations (baseline/change/diff + waiver rules).
- `artifact_policy`: Required/optional artifacts and ownership (`origin` = engine/agent).
- `command_policy`: Repo context command enforcement (sources + thresholds).
- `supervisor_policy`: Rubric ID + required compliance checks.
- `stage_policy`: Required/optional/forbidden stages.
- `contract_defaults.pr_policy`: PR creation defaults (branch prefix, templates, draft-on-risk).
- `contract_defaults.conflict_policy`: PR conflict guard defaults (max open PRs, base-branch strategy).

## Compiler Rules (Summary)

- Request payload is validated against `request_schema`.
- Expanded contract is compiled by applying `defaults`, `gate_policy`, `artifact_policy`, `command_policy`,
  and `contract_defaults` when the request omits them.
- Expanded contract is validated against `contract_schema`.
- `resolved_contract.json` is emitted at run start.

## UI Usage

The App Lifecycle UI reads `job_types.json` (via API) to:

- Render required input fields.
- Show gate expectations and artifact outputs.
- Display pipeline stages and default agent roster.
