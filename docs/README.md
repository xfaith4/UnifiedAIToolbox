# Documentation Hub

This folder is the canonical documentation entry point for Unified AI Toolbox.

## Source of truth

Use these files first:

- `ROADMAP.md` - main feature roadmap and roadmap IDs (`RM-###`)
- `IMPLEMENTATION_SUMMARY.md` - concise delivery history, side tracks (`ST-###`), and decisions (`DEC-###`)
- `UnifiedAIToolbox-Repo-Guide.md` - onboarding and operating guide
- `mcp/README.md` - MCP-specific documentation map

## Deep-dive references

These remain valuable, but they are supporting detail, not roadmap truth:

- `../WORKFLOW_AUDIT_SUMMARY.md` - CI/workflow hardening details
- `MCP_IMPLEMENTATION_SUMMARY.md` - detailed MCP implementation narrative
- `MCP_LIBRARY_STATUS.md` - MCP completion checklist
- `MCP_REMAINING_TASKS.md` - MCP enhancement backlog
- `archive/` - historical plans, reports, and deprecated flows

## Documentation workflow (best practice)

1. Update `ROADMAP.md` when priorities or feature sequencing changes.
2. Log every shipped item in `IMPLEMENTATION_SUMMARY.md` with a roadmap ID.
3. If a bug/task interrupts roadmap delivery, add a side-track entry (`ST-###`) and link it to the impacted roadmap ID.
4. Add/update a decision entry (`DEC-###`) whenever tradeoffs affect roadmap direction.

## Minimum traceability rule

Every significant change should be linkable as:

`Roadmap item (RM) -> Implementation entry -> Side track (if any) -> Decision`
