# Modernization Pass — Acceptance Checklist

This is the gate for the 2026-05 modernization pass. Each item below names a verifiable
artifact, the command (or location) that produces the evidence, and what counts as pass
or fail. Run the checks in order; later items depend on earlier ones.

> Source-of-truth contracts live in [docs/contracts/](contracts/) — A2A envelope, run
> lifecycle, event taxonomy, and decision-lock severities. Treat those documents as
> the spec; this checklist verifies the implementation matches.

---

## 1. Backend starts successfully

**What to check.** The Python FastAPI service (prompt-api) starts and answers
`GET /health`.

```bash
# From repo root
./launch.sh            # Linux/Mac/WSL
# or:
.\Start-Toolbox.ps1    # Windows PowerShell
```

**Expected.** Process logs `Uvicorn running on http://127.0.0.1:8000` and
<http://localhost:8000/health> returns HTTP 200.

**Pass / fail.** Pass if `/health` returns 200 within 30 s. Fail if the launcher exits
non-zero or `/health` never responds.

---

## 2. Frontend starts successfully

**What to check.** The Next.js webapp builds and serves on port 3000.

```bash
cd apps/unifiedtoolbox.webapp
npm install
npm run dev
```

**Expected.** `Local: http://localhost:3000` in the logs; the home route renders.

**Pass / fail.** Pass if the home route returns 200 and renders without console
exceptions. Fail if the dev server crashes or the page errors.

---

## 3. New run can be created

**What to check.** A run can be queued through the orchestration API.

```bash
curl -X POST http://localhost:8000/orchestrate/run \
  -H "Content-Type: application/json" \
  -d '{"job_type":"build_new_app","objective":"smoke test","model":"gpt-4o-mini"}'
```

(Or use the Web Portal Concierge → Proposal → Start Run flow.)

**Expected.** Response contains a `run_id`; the run shows up in `GET /orchestrate/runs`.

**Pass / fail.** Pass if a `run_id` is returned and persisted. Fail on 4xx/5xx.

---

## 4. Run emits canonical events

**What to check.** The run produces `events.jsonl` and `/api/runs/{runId}/events/canonical`
returns at least the lifecycle bookends.

```bash
# After the run starts:
curl http://localhost:3000/api/runs/<runId>/events/canonical
```

**Expected.** JSON snapshot with `events[]` containing at minimum `run_created`,
`run_queued`, `run_started`. See [contracts/EVENT_TAXONOMY.md](contracts/EVENT_TAXONOMY.md)
for the canonical 13 types.

**Pass / fail.** Pass if at least three lifecycle events are present and use the
canonical type strings. **Currently expected to fail on legacy runs** — see
[TROUBLESHOOTING.md](TROUBLESHOOTING.md#empty-manifest-or-no-canonical-events) and the
post-modernization roadmap item "wire producers" in [ROADMAP.md](ROADMAP.md). Once
producers call `appendEvent`, this gate passes for new runs.

---

## 5. Agent states display in UI

**What to check.** The Run Console (Run Detail page) shows per-agent cards with the
canonical status mapping from [contracts/RUN_LIFECYCLE.md](contracts/RUN_LIFECYCLE.md).

**Where to look.** `/runs/<runId>` in the webapp. Look for a panel showing each agent
(Researcher / Engineer / Critic / Synthesizer / Commissioner / Supervisor /
Historian) with a badge.

**Pass / fail.** Pass if each agent that has emitted an `agent_started` event renders
with a badge whose label matches the canonical status table. Fail if badges show
legacy labels or do not appear.

---

## 6. Blockers display clearly

**What to check.** A blocker payload renders with severity, code, summary, and
`needed_from`. The severity matches [contracts/DECISION_LOCK.md](contracts/DECISION_LOCK.md)
(`hard_blocker`, `soft_blocker`, `clarification_needed`, `non_blocking_gap`).

**Where to look.** Run Detail "Blockers" panel (or "What failed" panel for terminal
runs). Backend evidence is `agent_blocked` events in `events.jsonl` and the
`blocker` field on the A2A envelope.

**Pass / fail.** Pass if a `hard_blocker` puts the run in `blocked`, a
`clarification_needed` puts it in `waiting_on_input`, and the UI labels match.
Fail if severity classification is missing or wrong.

---

## 7. Final summary displays clearly

**What to check.** `final_summary.json` is written on disk for terminal runs and
the UI shows the final answer panel.

**Where to look.**
- Disk: `<runs_dir>/<runId>/final_summary.json`
- API: `GET /api/runs/<runId>/summary`
- UI: Final Result panel on Run Detail.

**Pass / fail.** Pass if the file exists on terminal status, the summary endpoint
returns its content, and the UI renders the final answer + next steps. Fail if
the file is missing on a completed run.

---

## 8. Artifacts are indexed

**What to check.** `artifacts.index.jsonl` is appended to for every produced file,
and `/api/runs/{runId}/artifacts` lists them.

**Where to look.**
- Disk: `<runs_dir>/<runId>/artifacts.index.jsonl` (one JSON object per line)
- API: `GET /api/runs/<runId>/artifacts`
- UI: Artifacts panel on Run Detail.

**Pass / fail.** Pass if every file produced by the run has a corresponding
`artifact_created` event AND a line in `artifacts.index.jsonl`. Fail if files
exist but aren't indexed.

---

## 9. Tests pass

**What to check.** The TypeScript test suite is green.

```bash
cd apps/unifiedtoolbox.webapp
npx vitest run
```

**Expected.** Modernization-pass tests:
- Agent 1 (contracts): **26 tests** in `src/lib/contracts/__tests__/`
- Agent 3 (run reliability / eventing): **61 tests** in `src/lib/app-factory/runs/__tests__/` and route tests
- Agent 2 (WebUI): additional component/hook tests

Plus typecheck:

```bash
cd apps/unifiedtoolbox.webapp
npx tsc --noEmit
```

**Expected.** Exit code 0.

**Pass / fail.** Pass if the suite is green and `tsc --noEmit` exits 0. Fail on any
red test or type error. (Known environment fix: install
`@rollup/rollup-win32-x64-msvc` on Windows — see
[TROUBLESHOOTING.md](TROUBLESHOOTING.md#tests-fail-with-rollup-native-binary-missing).)

---

## 10. Documentation updated

**What to check.** The following docs exist, are linked from [README.md](../README.md)
and [docs/README.md](README.md), and describe the modernization pass:

- [docs/contracts/A2A_CONTRACT.md](contracts/A2A_CONTRACT.md)
- [docs/contracts/RUN_LIFECYCLE.md](contracts/RUN_LIFECYCLE.md)
- [docs/contracts/EVENT_TAXONOMY.md](contracts/EVENT_TAXONOMY.md)
- [docs/contracts/DECISION_LOCK.md](contracts/DECISION_LOCK.md)
- [docs/ACCEPTANCE_CHECKLIST.md](ACCEPTANCE_CHECKLIST.md) (this file)
- [docs/EVALUATING_A_RUN.md](EVALUATING_A_RUN.md)
- [docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- [CHANGELOG.md](../CHANGELOG.md)

**Pass / fail.** Pass if every file above exists and is linked from at least one
index. Fail on a missing or orphaned doc.

---

## Summary

This checklist is intentionally short. Items 1-3 and 9-10 should pass today on a
freshly built repo. Items 4-8 will partially pass for new runs once the
orchestrator producer migration lands (see [ROADMAP.md](ROADMAP.md) →
"Post-Modernization → Now"); legacy runs created before this pass will show empty
manifests, which is expected.
