# Project Brief (Wizard Output)

The requirements wizard (behind `REQUIREMENT_WIZARD=true`) produces a structured `project_brief.json` that becomes the **canonical input** for orchestration.

It also emits plain-language artifacts:
- `PRD.md`
- `ACCEPTANCE.md`
- `MVP_PROMISE.md`

## Schema (project_brief.json)

```json
{
  "schemaVersion": 1,
  "createdAt": "2026-02-05T12:00:00.000Z",
  "goal": "What the tool helps accomplish",
  "users": "me | team | customers | public",
  "coreWorkflow": ["3 to 5 steps"],
  "inputs": ["manual_entry | upload_files | connect_system | public_data"],
  "outputs": ["dashboard | report | alerts | export | other"],
  "mustHave": ["short items"],
  "niceToHave": ["short items"],
  "runLocation": "my_computer | company_network | cloud_hosted | not_sure",
  "offline": "yes | no | not_sure",
  "dataSource": "manual | files | existing_system | public",
  "hasCredentials": "yes | no | not_sure",
  "sensitivity": "yes | no | not_sure",
  "successCriteria": ["2 to 8 bullets"],
  "demo_mode_required": true,
  "nonFunctional": {
    "mobileFriendly": true,
    "exports": "none | csv | excel | pdf",
    "performance": "no_preference | feels_fast | loads_under_3s"
  }
}
```

## Demo mode (default)

`demo_mode_required` defaults to `true` unless the user explicitly opts out.

When demo mode is enabled, `ACCEPTANCE.md` automatically includes:
- The app runs without any API keys and shows realistic sample data.
- The primary workflow is usable end-to-end in demo mode.

## Orchestrator integration

When the wizard is enabled:
- The orchestration “goal prompt” becomes a short synthesized brief derived from the project brief.
- The canonical JSON is included (verbatim) and also saved as `project_brief.json` as an artifact.

See `docs/examples/project_brief_example.json` for a sample.

