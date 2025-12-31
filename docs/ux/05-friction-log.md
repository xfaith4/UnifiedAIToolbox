# Friction Log

This log is ranked by severity (0–5) and frequency (% of runs).

| ID | Journey | Symptom | Root cause hypothesis | Evidence | Sev | Freq | Fix strategy | Confidence | Status |
|---:|:--|:--|:--|:--|:--:|:--:|:--|:--:|:--|
| 1 | J5 Orchestrator | API disconnected isn’t clearly actionable | Connection banner lacks a single “do this now” recovery path | (pending simulation run IDs) | 4 | ? | Add explicit start instructions + retry + fallback mode | Med | Planned |
| 2 | J4 Agents | Import errors use `alert()` | Non-accessible modal blocks flow, no copyable error | (pending) | 3 | ? | Replace with inline error callout | High | Planned |
| 3 | J1 Navigation | Sidebar state unclear on mobile | Menu toggle doesn’t announce expanded state (a11y) | (pending) | 2 | ? | Improve toggle semantics + focus management | Med | Planned |
| 4 | J3 Prompts | Large editor lacks clear save feedback | Users unsure if edits persisted | (pending) | 3 | ? | Add non-intrusive save status + last saved time | Med | Planned |
| 5 | Cross-cutting | No instrumentation for confusion | Can’t tell where users rage-click/dead-click | Introduced UX telemetry + overlay | 5 | 100 | Keep telemetry + add simulation harness | High | Done |
