"""Arena: canonical multi-lane candidate manifest and adjudication.

This module implements Phase 1 + Phase 2 of the Frontier Software Factory
strategy described in `docs/frontier-software-factory-strategy.md`.

Responsibilities:
- Define the canonical lane evidence record shape.
- Build an "internal" lane record from the existing run manifest fields
  (`app_production`, `app_production_repairs`, `verification_status`,
  `sandbox_report`, `events`, `checkpoints`, `generated_app_files`) so the
  current orchestration appears as one candidate without rewriting it.
- Score each lane on a `[0, 1]` total with explainable component breakdown.
- Adjudicate across lanes (whole-candidate, no patch splicing) and produce
  a verdict with reasons, confidence, and suggested follow-up.
- Persist `arena.json` (machine-readable) and `arena.md` (operator-readable)
  artifacts and return the dict that should be merged into the run manifest
  under the top-level `arena` field.

The module is intentionally pure (no FastAPI / network imports) so it can be
exercised by unit tests against fixture manifests.
"""
from __future__ import annotations

import datetime as _dt
import json
import pathlib
from typing import Any, Dict, Iterable, List, Optional, Tuple

ARENA_SCHEMA_VERSION = "1"
INTERNAL_LANE_ID = "internal-default"
INTERNAL_LANE_PROVIDER = "internal"
INTERNAL_LANE_LABEL = "Internal Orchestration"

DEFAULT_MUST_HAVE_GATES = ("build", "dev_server")
DEFAULT_NICE_TO_HAVE_GATES = ("unit_tests", "smoke_tests", "lint")


def _now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _clip(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    if value < lo:
        return lo
    if value > hi:
        return hi
    return value


def _gate_verdicts(app_production: Optional[Dict[str, Any]]) -> List[Dict[str, str]]:
    if not isinstance(app_production, dict):
        return []
    checks = app_production.get("checks")
    if not isinstance(checks, list):
        return []
    out: List[Dict[str, str]] = []
    for check in checks:
        if not isinstance(check, dict):
            continue
        out.append(
            {
                "name": str(check.get("name") or "check"),
                "status": str(check.get("status") or "unknown"),
            }
        )
    return out


def _delivery_readiness(app_production: Optional[Dict[str, Any]]) -> str:
    if not isinstance(app_production, dict):
        return "insufficient_evidence"
    return str(
        app_production.get("delivery_readiness")
        or app_production.get("status")
        or "insufficient_evidence"
    )


def _lane_status_from_evidence(
    app_production: Optional[Dict[str, Any]],
    verification_status: str,
) -> str:
    """Derive a coarse lane status string from existing evidence.

    Mapping mirrors the readiness states used in the application-production
    path so that the lane summary aligns with familiar operator vocabulary.
    """
    readiness = _delivery_readiness(app_production)
    verification = (verification_status or "").strip().lower()
    if readiness == "verified":
        return "verified"
    if readiness == "ready_for_delivery":
        return "ready_for_delivery"
    if readiness == "repair_needed" or verification == "failed":
        return "repair_needed"
    if verification in {"needs_requirements", "blocked_requirements"}:
        return "blocked_requirements"
    if verification == "passed":
        return "verified"
    if readiness == "insufficient_evidence":
        return "insufficient_evidence"
    return "insufficient_evidence"


def _score_lane(
    *,
    app_production: Optional[Dict[str, Any]],
    repair_plan: Optional[Dict[str, Any]],
    files_changed_count: int,
    checkpoints_count: int,
    verification_status: str,
) -> Dict[str, Any]:
    """Compute a `[0, 1]` total score with explainable components.

    The score is intentionally simple and debuggable. It is not a benchmark:
    it is a comparable signal across lanes that produced evidence in the
    same run. Tweaking weights is cheap; preserving explanations is not.
    """
    components: Dict[str, float] = {}

    passed = _safe_int((app_production or {}).get("passed_count"))
    failed = _safe_int((app_production or {}).get("failed_count"))
    skipped = _safe_int((app_production or {}).get("skipped_count"))
    total_gates = passed + failed + skipped

    if total_gates > 0:
        gate_pass_rate = passed / total_gates
    else:
        gate_pass_rate = 0.0
    components["gate_pass_rate"] = round(gate_pass_rate, 4)

    readiness = _delivery_readiness(app_production)
    if readiness == "verified" or readiness == "ready_for_delivery":
        delivery_score = 1.0
    elif readiness == "repair_needed":
        delivery_score = 0.3
    else:
        delivery_score = 0.0
    components["delivery_readiness"] = delivery_score

    repair_attempts = []
    repair_status = ""
    if isinstance(repair_plan, dict):
        repair_status = str(repair_plan.get("execution_status") or "").lower()
        attempts_raw = repair_plan.get("attempts")
        if isinstance(attempts_raw, list):
            repair_attempts = [a for a in attempts_raw if isinstance(a, dict)]
    if repair_status == "verified":
        repair_score = 1.0
    elif not repair_attempts:
        repair_score = 1.0  # no repair needed implies efficient
    else:
        # Each additional attempt past the first costs 0.2; floor at 0.
        repair_score = max(0.0, 1.0 - 0.2 * (len(repair_attempts) - 1))
        if repair_status in {"failed", "retry_exhausted", "blocked_missing_api_key"}:
            repair_score *= 0.5
    components["repair_efficiency"] = round(repair_score, 4)

    # Patch size penalty: very large change sets are riskier; use a soft penalty.
    if files_changed_count <= 0:
        patch_penalty = 0.0
    elif files_changed_count <= 10:
        patch_penalty = -0.02
    elif files_changed_count <= 30:
        patch_penalty = -0.05
    elif files_changed_count <= 80:
        patch_penalty = -0.10
    else:
        patch_penalty = -0.15
    components["patch_size_penalty"] = patch_penalty

    # Checkpoints aren't bad in themselves (they imply human-in-the-loop
    # caught something), but a high count signals friction.
    if checkpoints_count <= 0:
        checkpoint_penalty = 0.0
    elif checkpoints_count == 1:
        checkpoint_penalty = -0.02
    elif checkpoints_count <= 3:
        checkpoint_penalty = -0.05
    else:
        checkpoint_penalty = -0.10
    components["checkpoint_penalty"] = checkpoint_penalty

    # Verification status nudge.
    if (verification_status or "").lower() == "passed":
        components["verification_bonus"] = 0.05
    elif (verification_status or "").lower() == "failed":
        components["verification_bonus"] = -0.10
    else:
        components["verification_bonus"] = 0.0

    weighted = (
        0.45 * components["gate_pass_rate"]
        + 0.35 * components["delivery_readiness"]
        + 0.20 * components["repair_efficiency"]
        + components["patch_size_penalty"]
        + components["checkpoint_penalty"]
        + components["verification_bonus"]
    )
    total = round(_clip(weighted), 4)

    return {
        "total": total,
        "components": components,
    }


def build_internal_lane_record(
    manifest: Dict[str, Any],
    *,
    started_at: Optional[str] = None,
    completed_at: Optional[str] = None,
) -> Dict[str, Any]:
    """Translate the existing run manifest into a canonical lane record.

    This is the wrapper that lets the current orchestration appear as one
    candidate in the arena without changing its underlying execution model.
    """
    if not isinstance(manifest, dict):
        manifest = {}

    app_production = manifest.get("app_production") if isinstance(manifest.get("app_production"), dict) else None
    repair_plan = manifest.get("app_production_repairs") if isinstance(manifest.get("app_production_repairs"), dict) else None
    verification_status = str(manifest.get("verification_status") or "").lower()

    files_changed = manifest.get("generated_app_files") if isinstance(manifest.get("generated_app_files"), list) else []
    files_changed = [str(f) for f in files_changed]

    events = manifest.get("events") if isinstance(manifest.get("events"), list) else []
    events_recorded = len(events)

    checkpoints = manifest.get("checkpoints") if isinstance(manifest.get("checkpoints"), list) else []
    checkpoints_count = len(checkpoints)

    repair_attempts = []
    repair_status = ""
    if isinstance(repair_plan, dict):
        repair_status = str(repair_plan.get("execution_status") or "").lower()
        attempts_raw = repair_plan.get("attempts")
        if isinstance(attempts_raw, list):
            repair_attempts = [a for a in attempts_raw if isinstance(a, dict)]

    repair_targets = 0
    if isinstance(repair_plan, dict):
        items = repair_plan.get("items")
        if isinstance(items, list):
            repair_targets = len([i for i in items if isinstance(i, dict)])

    # Best-effort commands_run: count gate checks plus attempt commands.
    gate_count = len(_gate_verdicts(app_production))
    commands_run_count = gate_count + len(repair_attempts)

    evidence: Dict[str, Any] = {
        "files_changed_count": len(files_changed),
        "files_changed": files_changed[:50],  # bound
        "commands_run_count": commands_run_count,
        "checkpoints_triggered": checkpoints_count,
        "events_recorded": events_recorded,
        "gates": {
            "passed": _safe_int((app_production or {}).get("passed_count")),
            "failed": _safe_int((app_production or {}).get("failed_count")),
            "skipped": _safe_int((app_production or {}).get("skipped_count")),
            "verdicts": _gate_verdicts(app_production),
        },
        "repair": {
            "targets": repair_targets,
            "attempts": len(repair_attempts),
            "status": repair_status or ("not_needed" if repair_targets == 0 else "pending"),
        },
        "verification_status": verification_status or "pending",
        "delivery_readiness": _delivery_readiness(app_production),
    }

    score = _score_lane(
        app_production=app_production,
        repair_plan=repair_plan,
        files_changed_count=len(files_changed),
        checkpoints_count=checkpoints_count,
        verification_status=verification_status,
    )

    lane_status = _lane_status_from_evidence(app_production, verification_status)

    return {
        "lane_id": INTERNAL_LANE_ID,
        "provider": INTERNAL_LANE_PROVIDER,
        "label": INTERNAL_LANE_LABEL,
        "status": lane_status,
        "started_at": started_at or manifest.get("started_at") or manifest.get("requested_at") or _now_iso(),
        "completed_at": completed_at or manifest.get("completed_at") or _now_iso(),
        "evidence": evidence,
        "score": score,
        "artifacts": {
            "app_production_report": (app_production or {}).get("report_artifact"),
            "app_production_summary": (app_production or {}).get("summary_artifact"),
            "repair_report": (repair_plan or {}).get("report_artifact") if isinstance(repair_plan, dict) else None,
            "repair_execution_report": (repair_plan or {}).get("execution_report_artifact") if isinstance(repair_plan, dict) else None,
        },
    }


def _confidence_from_lanes(lanes: List[Dict[str, Any]]) -> str:
    """Confidence is mostly a function of how many *distinct* lanes ran.

    A single-lane arena cannot meaningfully discriminate; the verdict is
    therefore low-confidence by construction even if the score is high.
    """
    if len(lanes) <= 1:
        return "low"
    scores = sorted(
        (float(l.get("score", {}).get("total", 0.0)) for l in lanes),
        reverse=True,
    )
    if len(scores) >= 2 and (scores[0] - scores[1]) >= 0.15:
        return "high"
    if len(scores) >= 2 and (scores[0] - scores[1]) >= 0.05:
        return "medium"
    return "low"


def _format_pct(value: float) -> str:
    return f"{round(value * 100)}%"


def _winner_reasons(winner: Dict[str, Any], others: List[Dict[str, Any]]) -> List[str]:
    reasons: List[str] = []
    score = float(winner.get("score", {}).get("total", 0.0))
    components = winner.get("score", {}).get("components", {}) if isinstance(winner.get("score"), dict) else {}
    evidence = winner.get("evidence", {}) if isinstance(winner.get("evidence"), dict) else {}
    gates = evidence.get("gates", {}) if isinstance(evidence.get("gates"), dict) else {}
    repair = evidence.get("repair", {}) if isinstance(evidence.get("repair"), dict) else {}

    reasons.append(
        f"Winning lane '{winner.get('label') or winner.get('lane_id')}' scored {score:.2f}."
    )
    pass_rate = components.get("gate_pass_rate")
    if isinstance(pass_rate, (int, float)) and (gates.get("passed") or gates.get("failed") or gates.get("skipped")):
        reasons.append(
            f"Gate pass rate {_format_pct(float(pass_rate))} "
            f"({gates.get('passed', 0)} passed, {gates.get('failed', 0)} failed, {gates.get('skipped', 0)} skipped)."
        )
    readiness = evidence.get("delivery_readiness")
    if readiness:
        reasons.append(f"Delivery readiness: {readiness}.")
    repair_attempts = _safe_int(repair.get("attempts"))
    if repair_attempts > 0:
        reasons.append(
            f"Reached current state after {repair_attempts} repair attempt(s) "
            f"(status: {repair.get('status') or 'unknown'})."
        )
    if not others:
        reasons.append("Only one candidate lane was executed for this run.")
    else:
        reasons.append(
            f"Beat {len(others)} other candidate lane(s) on the combined evidence score."
        )
    return reasons


def _loser_reasons(losers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for lane in losers:
        components = lane.get("score", {}).get("components", {}) if isinstance(lane.get("score"), dict) else {}
        evidence = lane.get("evidence", {}) if isinstance(lane.get("evidence"), dict) else {}
        gates = evidence.get("gates", {}) if isinstance(evidence.get("gates"), dict) else {}
        delivery = evidence.get("delivery_readiness")
        rationale_parts = []
        if (gates.get("failed") or 0) > 0:
            rationale_parts.append(f"{gates.get('failed')} failed gate(s)")
        if delivery and delivery not in {"verified", "ready_for_delivery"}:
            rationale_parts.append(f"delivery={delivery}")
        gate_pass = components.get("gate_pass_rate")
        if isinstance(gate_pass, (int, float)):
            rationale_parts.append(f"pass rate {_format_pct(float(gate_pass))}")
        out.append(
            {
                "lane_id": lane.get("lane_id"),
                "score": float(lane.get("score", {}).get("total", 0.0)),
                "rationale": "; ".join(rationale_parts) or "Lower combined score.",
            }
        )
    return out


def _follow_up(lanes: List[Dict[str, Any]], winner: Dict[str, Any]) -> List[str]:
    suggestions: List[str] = []
    if len(lanes) <= 1:
        suggestions.append("Add a second candidate lane to enable comparative judgement.")
    evidence = winner.get("evidence", {}) if isinstance(winner.get("evidence"), dict) else {}
    if evidence.get("delivery_readiness") not in {"verified", "ready_for_delivery"}:
        suggestions.append("Promote the winning lane through another repair round before promotion.")
    gates = evidence.get("gates", {}) if isinstance(evidence.get("gates"), dict) else {}
    if (gates.get("skipped") or 0) > 0:
        suggestions.append("Resolve skipped gates so adjudication has full executable proof.")
    return suggestions


def adjudicate_lanes(
    lanes: List[Dict[str, Any]],
    *,
    intent: Optional[str] = None,
    must_have: Optional[Iterable[str]] = None,
    nice_to_have: Optional[Iterable[str]] = None,
) -> Dict[str, Any]:
    """Whole-candidate adjudication across lane records.

    Selects the highest scoring lane, then attaches reasons, confidence, and
    follow-up. Ties are broken by lane order to keep the result deterministic.
    """
    if not lanes:
        raise ValueError("At least one lane record is required to adjudicate.")

    ordered = sorted(
        enumerate(lanes),
        key=lambda pair: (
            -float(pair[1].get("score", {}).get("total", 0.0)),
            pair[0],
        ),
    )
    winner = ordered[0][1]
    losers = [pair[1] for pair in ordered[1:]]

    confidence = _confidence_from_lanes(lanes)
    reasons = _winner_reasons(winner, losers)
    loser_reasons = _loser_reasons(losers)
    follow_up = _follow_up(lanes, winner)

    must = list(must_have) if must_have is not None else list(DEFAULT_MUST_HAVE_GATES)
    nice = list(nice_to_have) if nice_to_have is not None else list(DEFAULT_NICE_TO_HAVE_GATES)

    return {
        "winner_lane_id": winner.get("lane_id"),
        "winner_score": float(winner.get("score", {}).get("total", 0.0)),
        "confidence": confidence,
        "reasons": reasons,
        "loser_reasons": loser_reasons,
        "follow_up": follow_up,
        "criteria": {
            "must_have": must,
            "nice_to_have": nice,
            "intent": (intent or "").strip() or None,
        },
    }


def _format_score_components(components: Dict[str, Any]) -> str:
    parts = []
    for key, value in components.items():
        if isinstance(value, (int, float)):
            parts.append(f"{key}={value:+.2f}" if value < 0 else f"{key}={value:.2f}")
    return ", ".join(parts)


def _arena_markdown(arena: Dict[str, Any]) -> str:
    lines: List[str] = ["# Arena Adjudication", ""]
    verdict = arena.get("verdict", {}) if isinstance(arena.get("verdict"), dict) else {}
    lines.append(f"- Schema version: `{arena.get('schema_version')}`")
    lines.append(f"- Run: `{arena.get('run_id') or 'unknown'}`")
    lines.append(f"- Winner lane: `{verdict.get('winner_lane_id') or 'n/a'}`")
    lines.append(f"- Winner score: {verdict.get('winner_score', 0.0):.2f}")
    lines.append(f"- Confidence: `{verdict.get('confidence') or 'unknown'}`")
    intent = arena.get("intent") or (verdict.get("criteria", {}) or {}).get("intent")
    if intent:
        lines.append(f"- Intent: {intent}")
    lines.append("")

    lines.append("## Reasons")
    for r in verdict.get("reasons") or []:
        lines.append(f"- {r}")
    if not verdict.get("reasons"):
        lines.append("- (none)")
    lines.append("")

    losers = verdict.get("loser_reasons") or []
    if losers:
        lines.append("## Loser reasons")
        for entry in losers:
            if not isinstance(entry, dict):
                continue
            lines.append(
                f"- `{entry.get('lane_id') or 'lane'}` (score {entry.get('score', 0.0):.2f}): {entry.get('rationale') or ''}"
            )
        lines.append("")

    follow_up = verdict.get("follow_up") or []
    if follow_up:
        lines.append("## Follow-up")
        for item in follow_up:
            lines.append(f"- {item}")
        lines.append("")

    lanes = arena.get("lanes") or []
    lines.append("## Lanes")
    for lane in lanes:
        if not isinstance(lane, dict):
            continue
        score = lane.get("score", {}) if isinstance(lane.get("score"), dict) else {}
        evidence = lane.get("evidence", {}) if isinstance(lane.get("evidence"), dict) else {}
        gates = evidence.get("gates", {}) if isinstance(evidence.get("gates"), dict) else {}
        repair = evidence.get("repair", {}) if isinstance(evidence.get("repair"), dict) else {}
        lines.append(f"### `{lane.get('lane_id')}` — {lane.get('label') or lane.get('provider') or 'lane'}")
        lines.append(f"- Status: `{lane.get('status') or 'unknown'}`")
        lines.append(f"- Provider: `{lane.get('provider') or 'unknown'}`")
        lines.append(f"- Score: {float(score.get('total', 0.0)):.2f}")
        comp_text = _format_score_components(score.get("components", {}) if isinstance(score.get("components"), dict) else {})
        if comp_text:
            lines.append(f"- Score components: {comp_text}")
        lines.append(
            f"- Gates: passed={gates.get('passed', 0)}, failed={gates.get('failed', 0)}, skipped={gates.get('skipped', 0)}"
        )
        lines.append(
            f"- Repair: targets={repair.get('targets', 0)}, attempts={repair.get('attempts', 0)}, status=`{repair.get('status') or 'n/a'}`"
        )
        lines.append(
            f"- Files changed: {evidence.get('files_changed_count', 0)}; events: {evidence.get('events_recorded', 0)}; checkpoints: {evidence.get('checkpoints_triggered', 0)}"
        )
        lines.append(f"- Delivery readiness: `{evidence.get('delivery_readiness') or 'unknown'}`")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def write_arena_artifacts(
    out_dir: pathlib.Path,
    arena: Dict[str, Any],
) -> Tuple[pathlib.Path, pathlib.Path]:
    """Persist `arena.json` and `arena.md` next to the run manifest."""
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "arena.json"
    md_path = out_dir / "arena.md"
    json_path.write_text(json.dumps(arena, indent=2), encoding="utf-8")
    md_path.write_text(_arena_markdown(arena), encoding="utf-8")
    return json_path, md_path


def build_arena_record(
    manifest: Dict[str, Any],
    *,
    extra_lanes: Optional[List[Dict[str, Any]]] = None,
    intent: Optional[str] = None,
    must_have: Optional[Iterable[str]] = None,
    nice_to_have: Optional[Iterable[str]] = None,
) -> Dict[str, Any]:
    """Build the canonical arena record for a run.

    The internal lane is derived from the existing manifest. Additional lanes
    (frontier provider lanes, browser-evidence lanes) can be added later by
    passing them through `extra_lanes`; they must already conform to the
    canonical lane shape.
    """
    internal_lane = build_internal_lane_record(manifest)
    lanes: List[Dict[str, Any]] = [internal_lane]
    if extra_lanes:
        for lane in extra_lanes:
            if isinstance(lane, dict):
                lanes.append(lane)

    verdict = adjudicate_lanes(
        lanes,
        intent=intent or manifest.get("goal"),
        must_have=must_have,
        nice_to_have=nice_to_have,
    )

    return {
        "schema_version": ARENA_SCHEMA_VERSION,
        "run_id": manifest.get("run_id") or manifest.get("id"),
        "intent": (intent or manifest.get("goal") or "").strip() or None,
        "lanes": lanes,
        "verdict": verdict,
        "generated_at": _now_iso(),
    }


def attach_arena_to_manifest(
    manifest: Dict[str, Any],
    out_dir: pathlib.Path,
    *,
    extra_lanes: Optional[List[Dict[str, Any]]] = None,
    intent: Optional[str] = None,
) -> Dict[str, Any]:
    """Build the arena, persist artifacts, and return the arena dict.

    The caller is responsible for merging the returned dict into the run
    manifest under the top-level `arena` key (typically inside an
    `_update_manifest` callback).
    """
    arena = build_arena_record(manifest, extra_lanes=extra_lanes, intent=intent)
    json_path, md_path = write_arena_artifacts(out_dir, arena)
    arena["report_artifact"] = json_path.name
    arena["summary_artifact"] = md_path.name
    return arena


__all__ = [
    "ARENA_SCHEMA_VERSION",
    "INTERNAL_LANE_ID",
    "INTERNAL_LANE_PROVIDER",
    "INTERNAL_LANE_LABEL",
    "build_internal_lane_record",
    "adjudicate_lanes",
    "build_arena_record",
    "write_arena_artifacts",
    "attach_arena_to_manifest",
]
