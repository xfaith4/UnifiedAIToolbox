### BEGIN FILE: app.py
import os, json, hashlib, hmac, sqlite3, datetime, textwrap, pathlib, sys, subprocess, re, uuid, time, threading, shutil, logging, asyncio, io, zipfile
from typing import cast
import openai
from dataclasses import dataclass
from contextlib import asynccontextmanager
from concurrent.futures import Future, ThreadPoolExecutor
from typing import List, Optional, Dict, Any, Tuple, Callable
from functools import wraps

from fastapi import FastAPI, HTTPException, Path, Query, Header, Depends, status, Request # pyright: ignore[reportMissingImports]
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, RootModel, field_validator # pyright: ignore[reportMissingImports]
from pydantic_settings import BaseSettings, SettingsConfigDict
import uvicorn # pyright: ignore[reportMissingImports]
import yaml # pyright: ignore[reportMissingModuleSource]
import requests # pyright: ignore[reportMissingModuleSource]
from urllib.parse import urlparse
from html.parser import HTMLParser

from auth_github import ensure_github_token

try:
    from mcp_governance import storage as mcp_storage
    from mcp_governance.models import Allowlist, AllowlistScope
    from orchestration_mcp_middleware import OrchestrationMCPMiddleware
    MCP_ENFORCEMENT_IMPORTS_AVAILABLE = True
except ImportError:
    mcp_storage = None  # type: ignore
    Allowlist = None  # type: ignore
    AllowlistScope = None  # type: ignore
    OrchestrationMCPMiddleware = None  # type: ignore
    MCP_ENFORCEMENT_IMPORTS_AVAILABLE = False

# Configure logging at module level
logger = logging.getLogger(__name__)

# Import orchestrator logging utilities
try:
    from orchestrator_logger import OrchestratorLogger, compute_prompt_hash, detect_stacks, compute_file_hash
    from orchestrator_verifier import OrchestratorVerifier
    ORCHESTRATOR_LOGGING_AVAILABLE = True
except ImportError:
    ORCHESTRATOR_LOGGING_AVAILABLE = False
    logger.warning("Orchestrator logging modules not available")

# Import migrations module
try:
    from migrations import apply_migrations
except ImportError:
    apply_migrations = None  # Migrations module not available

# ----------------------------
# Simple In-Memory Cache
# ----------------------------
_cache: Dict[str, Tuple[Any, float]] = {}
CACHE_TTL = 60  # seconds

def simple_cache(ttl: int = CACHE_TTL):
    """Simple in-memory cache decorator for read-only endpoints."""
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Create cache key from function name and arguments
            cache_key = f"{func.__name__}:{str(args)}:{str(sorted(kwargs.items()))}"
            
            # Check if cached value exists and is still valid
            if cache_key in _cache:
                cached_value, cached_time = _cache[cache_key]
                if time.time() - cached_time < ttl:
                    return cached_value
            
            # Call function and cache result
            result = func(*args, **kwargs)
            _cache[cache_key] = (result, time.time())
            
            # Simple cache size management - keep last 100 entries
            if len(_cache) > 100:
                oldest_key = min(_cache.items(), key=lambda x: x[1][1])[0]
                del _cache[oldest_key]
            
            return result
        return wrapper
    return decorator

# ----------------------------
# Safe JSON Loading Utilities
# ----------------------------
def safe_json_load(file_path: pathlib.Path, default: Any = None, context: str = "") -> Any:
    """
    Safely load JSON from a file with enhanced error reporting.
    
    Args:
        file_path: Path to the JSON file
        default: Default value to return on error (None by default)
        context: Context string for error messages (e.g., "agent_status", "run_manifest")
    
    Returns:
        Parsed JSON data or default value on error
    
    Raises:
        ValueError: If file is empty or contains invalid JSON (with detailed error message)
    """
    content = None
    file_size = None
    
    try:
        if not file_path.exists():
            raise FileNotFoundError(f"JSON file not found: {file_path}")
        
        file_size = file_path.stat().st_size
        if file_size == 0:
            error_msg = f"Empty JSON file (0 bytes): {file_path}"
            if context:
                error_msg = f"[{context}] {error_msg}"
            raise ValueError(error_msg)
        
        content = file_path.read_text(encoding="utf-8")
        if not content.strip():
            error_msg = f"JSON file contains only whitespace: {file_path}"
            if context:
                error_msg = f"[{context}] {error_msg}"
            raise ValueError(error_msg)
        
        return json.loads(content)
    
    except json.JSONDecodeError as e:
        # Enhanced error message with file details and content preview
        content_preview = content[:200] if content else "<unable to read>"
        error_msg = (
            f"Invalid JSON in file: {file_path}\n"
            f"  Size: {file_size if file_size is not None else 'unknown'} bytes\n"
            f"  Error: {e.msg} at line {e.lineno}, column {e.colno}\n"
            f"  Content preview: {content_preview}..."
        )
        if context:
            error_msg = f"[{context}] {error_msg}"
        
        if default is not None:
            print(f"WARNING: {error_msg}\nReturning default value.", file=sys.stderr)
            return default
        raise ValueError(error_msg)
    
    except Exception as e:
        error_msg = f"Failed to load JSON from {file_path}: {type(e).__name__}: {e}"
        if context:
            error_msg = f"[{context}] {error_msg}"
        
        if default is not None:
            print(f"WARNING: {error_msg}\nReturning default value.", file=sys.stderr)
            return default
        raise ValueError(error_msg)


def _extract_first_json_object(text: str) -> Optional[str]:
    """Return the first balanced JSON object found in text."""
    if not text:
        return None

    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape = False

    for i in range(start, len(text)):
        ch = text[i]

        if escape:
            escape = False
            continue

        if ch == "\\" and in_string:
            escape = True
            continue

        if ch == '"':
            in_string = not in_string
            continue

        if in_string:
            continue

        if ch == "{":
            depth += 1
            continue

        if ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]

    return None


def _payload_contains_markdown_fences(value: Any) -> bool:
    """Reject markdown/code fences in any string field inside JSON payloads."""
    if isinstance(value, str):
        return "```" in value
    if isinstance(value, list):
        return any(_payload_contains_markdown_fences(item) for item in value)
    if isinstance(value, dict):
        return any(_payload_contains_markdown_fences(item) for item in value.values())
    return False


def _coerce_agent_json_payload(payload: Any, depth: int = 0) -> Optional[Dict[str, Any]]:
    """Normalize agent output from envelope/text/transcript into a strict JSON object."""
    if depth > 4 or payload is None:
        return None

    if isinstance(payload, dict):
        choices = payload.get("choices")
        if isinstance(choices, list) and choices:
            first = choices[0]
            if isinstance(first, dict):
                message = first.get("message", {})
                if isinstance(message, dict):
                    content = message.get("content")
                    if isinstance(content, str):
                        return _coerce_agent_json_payload(content, depth + 1)
        return payload

    if isinstance(payload, str):
        text = payload.strip()
        if not text:
            return None

        # Try parsing as JSON first (before checking for markdown fences, since
        # the string may be a JSON envelope whose content contains backticks)
        try:
            parsed = json.loads(text)
            return _coerce_agent_json_payload(parsed, depth + 1)
        except Exception:
            pass

        # If JSON parse failed, try stripping markdown code fences and re-parsing
        if "```" in text:
            match = re.search(r'^```[^\n]*\n(.*?)\n?```$', text, flags=re.DOTALL | re.MULTILINE)
            inner = match.group(1).strip() if match else None
            if inner:
                try:
                    parsed = json.loads(inner)
                    return _coerce_agent_json_payload(parsed, depth + 1)
                except Exception:
                    pass

        return None

    if _payload_contains_markdown_fences(payload):
        return None

    return None


def _parse_agent_json_from_run_dir(out_dir: pathlib.Path, agent_name: str) -> Optional[Dict[str, Any]]:
    """Load canonical JSON for an agent from raw response/artifact/transcript files."""
    aliases = {
        "ReviewGate": ["review_gate.json"],
        "RepoContextBuilder": ["repo_context.json", "repo_context.discovery.json"],
        "PRPublisher": ["pr.json"],
        "ConceptualModelContract": ["conceptual_model_contract.json"],
    }

    candidates: List[pathlib.Path] = [out_dir / f"{agent_name}_raw_response.json"]
    for rel in aliases.get(agent_name, []):
        candidates.append(out_dir / rel)
    candidates.extend(
        [
            out_dir / f"{agent_name}.json",
            out_dir / f"{agent_name}.txt",
        ]
    )

    seen: set[pathlib.Path] = set()
    for path in candidates:
        if path in seen:
            continue
        seen.add(path)

        if not path.exists():
            continue

        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue

        parsed = _coerce_agent_json_payload(text)
        if isinstance(parsed, dict):
            return parsed

    return None


def _validate_conceptual_model_contract(contract: Any) -> List[str]:
    """
    Validate Conceptual Model Contract schema and enforce grounded/falsifiable probes.
    Returns a list of validation errors; empty list means valid.
    """
    errors: List[str] = []
    if not isinstance(contract, dict):
        return ["contract is not a JSON object"]

    def _non_empty_string(value: Any) -> bool:
        return isinstance(value, str) and bool(value.strip())

    def _contains_vague_probe_text(value: str) -> bool:
        lower = value.lower()
        vague_markers = (
            "looks",
            "appears",
            "should feel",
            "user can see",
            "visually pleasing",
            "seems",
        )
        return any(marker in lower for marker in vague_markers)

    required_top_level = [
        "interpretation",
        "representation",
        "objects",
        "interactions",
        "dynamics",
        "data",
        "non_goals",
        "acceptance_tests",
    ]
    for key in required_top_level:
        if key not in contract:
            errors.append(f"missing required field: {key}")

    representation = contract.get("representation")
    if representation not in {"canvas", "svg", "dom-graphics", "chart", "simulation"}:
        errors.append("representation must be one of: canvas|svg|dom-graphics|chart|simulation")

    if not _non_empty_string(contract.get("interpretation")):
        errors.append("interpretation must be a non-empty string")

    objects = contract.get("objects")
    if not isinstance(objects, list):
        errors.append("objects must be an array")
    else:
        for idx, obj in enumerate(objects):
            if not isinstance(obj, dict):
                errors.append(f"objects[{idx}] must be an object")
                continue
            if not _non_empty_string(obj.get("id")):
                errors.append(f"objects[{idx}].id must be a non-empty string")
            if not _non_empty_string(obj.get("description")):
                errors.append(f"objects[{idx}].description must be a non-empty string")
            if obj.get("mustBeVisible") is not True:
                errors.append(f"objects[{idx}].mustBeVisible must be true")
            evidence = obj.get("observableEvidence")
            if not isinstance(evidence, dict):
                errors.append(f"objects[{idx}].observableEvidence must be an object")
            else:
                if evidence.get("type") not in {"dom", "svg", "canvas", "state"}:
                    errors.append(f"objects[{idx}].observableEvidence.type must be dom|svg|canvas|state")
                probe = evidence.get("probe")
                if not _non_empty_string(probe):
                    errors.append(f"objects[{idx}].observableEvidence.probe must be a non-empty string")
                elif _contains_vague_probe_text(str(probe)):
                    errors.append(f"objects[{idx}].observableEvidence.probe is not machine-falsifiable")

    interactions = contract.get("interactions")
    if not isinstance(interactions, list):
        errors.append("interactions must be an array")
    else:
        for idx, item in enumerate(interactions):
            if not isinstance(item, dict):
                errors.append(f"interactions[{idx}] must be an object")
                continue
            for key in ("id", "trigger", "userAction", "expectedVisibleEffect"):
                if not _non_empty_string(item.get(key)):
                    errors.append(f"interactions[{idx}].{key} must be a non-empty string")
            verification = item.get("verification")
            if not isinstance(verification, dict):
                errors.append(f"interactions[{idx}].verification must be an object")
            else:
                action_probe = verification.get("actionProbe")
                change_probe = verification.get("expectedChangeProbe")
                if not _non_empty_string(action_probe):
                    errors.append(f"interactions[{idx}].verification.actionProbe must be a non-empty string")
                if not _non_empty_string(change_probe):
                    errors.append(f"interactions[{idx}].verification.expectedChangeProbe must be a non-empty string")
                if _non_empty_string(action_probe) and _non_empty_string(change_probe) and action_probe == change_probe:
                    errors.append(f"interactions[{idx}] verification probes must measure distinct values")
                if _non_empty_string(change_probe) and _contains_vague_probe_text(str(change_probe)):
                    errors.append(f"interactions[{idx}].verification.expectedChangeProbe is not machine-falsifiable")

    dynamics = contract.get("dynamics")
    if not isinstance(dynamics, list):
        errors.append("dynamics must be an array")
    else:
        for idx, item in enumerate(dynamics):
            if not isinstance(item, dict):
                errors.append(f"dynamics[{idx}] must be an object")
                continue
            for key in ("id", "name", "whatChangesOverTime", "observableSignal"):
                if not _non_empty_string(item.get(key)):
                    errors.append(f"dynamics[{idx}].{key} must be a non-empty string")
            temporal = item.get("temporalEvidence")
            if not isinstance(temporal, dict):
                errors.append(f"dynamics[{idx}].temporalEvidence must be an object")
            else:
                duration_ms = temporal.get("durationMs")
                if not isinstance(duration_ms, int) or duration_ms <= 0:
                    errors.append(f"dynamics[{idx}].temporalEvidence.durationMs must be a positive integer")
                probe = temporal.get("probe")
                delta = temporal.get("expectedDelta")
                if not _non_empty_string(probe):
                    errors.append(f"dynamics[{idx}].temporalEvidence.probe must be a non-empty string")
                if not _non_empty_string(delta):
                    errors.append(f"dynamics[{idx}].temporalEvidence.expectedDelta must be a non-empty string")
                if _non_empty_string(probe) and _contains_vague_probe_text(str(probe)):
                    errors.append(f"dynamics[{idx}].temporalEvidence.probe is not machine-falsifiable")

    data_entries = contract.get("data")
    if not isinstance(data_entries, list):
        errors.append("data must be an array")
    else:
        for idx, item in enumerate(data_entries):
            if not isinstance(item, dict):
                errors.append(f"data[{idx}] must be an object")
                continue
            for key in ("name", "source", "usedFor"):
                if not _non_empty_string(item.get(key)):
                    errors.append(f"data[{idx}].{key} must be a non-empty string")

    non_goals = contract.get("non_goals")
    if not isinstance(non_goals, list) or not all(_non_empty_string(v) for v in non_goals):
        errors.append("non_goals must be an array of non-empty strings")

    acceptance_tests = contract.get("acceptance_tests")
    if not isinstance(acceptance_tests, list) or len(acceptance_tests) == 0:
        errors.append("acceptance_tests must be a non-empty array")
    else:
        for idx, test in enumerate(acceptance_tests):
            if not isinstance(test, dict):
                errors.append(f"acceptance_tests[{idx}] must be an object")
                continue
            if not _non_empty_string(test.get("testName")):
                errors.append(f"acceptance_tests[{idx}].testName must be a non-empty string")
            steps = test.get("steps")
            assertions = test.get("assertions")
            if not isinstance(steps, list) or len(steps) == 0 or not all(_non_empty_string(v) for v in steps):
                errors.append(f"acceptance_tests[{idx}].steps must be a non-empty array of strings")
            if not isinstance(assertions, list) or len(assertions) == 0 or not all(_non_empty_string(v) for v in assertions):
                errors.append(f"acceptance_tests[{idx}].assertions must be a non-empty array of strings")
            else:
                for assertion in assertions:
                    if _contains_vague_probe_text(str(assertion)):
                        errors.append(f"acceptance_tests[{idx}] assertion is not machine-falsifiable")
            if not _non_empty_string(test.get("failureCondition")):
                errors.append(f"acceptance_tests[{idx}].failureCondition must be a non-empty string")

    return errors


def _validate_engineer_contract_traceability(engineer_payload: Any, contract_payload: Any) -> List[str]:
    """
    Ensure Engineer output contains complete Contract Traceability coverage.
    """
    errors: List[str] = []
    if not isinstance(engineer_payload, dict):
        return ["Engineer payload is not a JSON object"]
    if not isinstance(contract_payload, dict):
        return ["ConceptualModelContract payload is not a JSON object"]

    required_ids: List[str] = []
    for key in ("objects", "interactions", "dynamics"):
        items = contract_payload.get(key)
        if isinstance(items, list):
            for item in items:
                if isinstance(item, dict):
                    contract_id = item.get("id")
                    if isinstance(contract_id, str) and contract_id.strip():
                        required_ids.append(contract_id.strip())

    traced_ids: Dict[str, str] = {}
    traceability_entries = engineer_payload.get("contract_traceability")
    if traceability_entries is not None:
        if not isinstance(traceability_entries, list) or len(traceability_entries) == 0:
            errors.append("Engineer.contract_traceability must be a non-empty array")
        else:
            for idx, entry in enumerate(traceability_entries):
                if not isinstance(entry, dict):
                    errors.append(f"Engineer.contract_traceability[{idx}] must be an object")
                    continue
                contract_id = (
                    entry.get("contract_id")
                    or entry.get("contractId")
                    or entry.get("requirement_id")
                    or entry.get("requirementId")
                    or entry.get("id")
                )
                if not isinstance(contract_id, str) or not contract_id.strip():
                    errors.append(f"Engineer.contract_traceability[{idx}] missing contract_id/requirement_id")
                    continue
                probe = (
                    entry.get("runtime_probe_explanation")
                    or entry.get("runtimeProbeExplanation")
                    or entry.get("probe")
                    or entry.get("notes")
                )
                if not isinstance(probe, str) or not probe.strip():
                    errors.append(
                        f"Engineer.contract_traceability[{idx}] missing runtimeProbeExplanation/probe"
                    )
                    continue
                traced_ids[contract_id.strip()] = probe.strip()
    else:
        implementation = engineer_payload.get("implementation")
        if not isinstance(implementation, str) or not implementation.strip():
            return ["Engineer output missing required JSON field: contract_traceability[]"]

        marker = "### Contract Traceability"
        idx = implementation.find(marker)
        if idx == -1:
            return ["Engineer output missing required JSON field: contract_traceability[]"]

        section = implementation[idx + len(marker):]
        trace_lines = []
        for raw_line in section.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            if line.startswith("### "):
                break
            trace_lines.append(line)

        if not trace_lines:
            return ["Engineer.contract_traceability is empty"]

        line_pattern = re.compile(
            r"^(?P<cid>[A-Za-z0-9_.:-]+)\s*->\s*(?P<path>[^:]+?)\s*:\s*(?P<symbol>[^:]+?)\s*:\s*(?P<probe>.+)$"
        )
        for line in trace_lines:
            m = line_pattern.match(line)
            if not m:
                errors.append(f"Invalid traceability line format: {line}")
                continue
            contract_id = m.group("cid").strip()
            probe = m.group("probe").strip()
            traced_ids[contract_id] = line
            if not probe:
                errors.append(f"Traceability line has empty runtimeProbeExplanation: {line}")

    missing = [cid for cid in required_ids if cid not in traced_ids]
    if missing:
        errors.append(f"Missing traceability coverage for contract IDs: {', '.join(missing)}")

    return errors


def _normalize_requirements_blocker(raw: Any, idx: int) -> Dict[str, Any]:
    question = ""
    why = ""
    defaults: List[str] = []
    blocker_id = f"req_{idx + 1}"

    if isinstance(raw, str):
        question = raw.strip()
    elif isinstance(raw, dict):
        question = str(
            raw.get("question")
            or raw.get("prompt")
            or raw.get("missing")
            or raw.get("requirement")
            or ""
        ).strip()
        why = str(raw.get("why") or raw.get("reason") or raw.get("impact") or "").strip()
        blocker_id = str(
            raw.get("id")
            or raw.get("requirement_id")
            or raw.get("requirementId")
            or blocker_id
        ).strip() or blocker_id
        defaults_raw = raw.get("defaults")
        if defaults_raw is None:
            defaults_raw = raw.get("default")
        if defaults_raw is None:
            defaults_raw = raw.get("options")
        if isinstance(defaults_raw, list):
            defaults = [str(v).strip() for v in defaults_raw if str(v).strip()]
        elif isinstance(defaults_raw, str) and defaults_raw.strip():
            defaults = [defaults_raw.strip()]

    if not question:
        fallback_questions = [
            "Define 4 interactions and the measurable state each interaction must change.",
            "Set performance target hardware and visual complexity budget.",
            "Choose verification scope (unit only vs unit + UI interaction tests).",
            "Choose delivery mode (demo-only vs maintainable project expectations).",
        ]
        question = fallback_questions[idx] if idx < len(fallback_questions) else f"Provide requirement detail #{idx + 1}."

    if not why:
        why = "Required to convert intent into machine-verifiable acceptance criteria."

    return {
        "id": blocker_id,
        "question": question,
        "why": why,
        "defaults": defaults,
    }


def _build_requirements_request_packet(commissioner_payload: Dict[str, Any]) -> Dict[str, Any]:
    missing_sources: List[Any] = []
    for key in ("missing_requirements", "requirements_gaps", "open_questions", "blockers"):
        value = commissioner_payload.get(key)
        if isinstance(value, list):
            missing_sources.extend(value)

    normalized_blockers = [
        _normalize_requirements_blocker(raw, idx)
        for idx, raw in enumerate(missing_sources)
    ]

    if not normalized_blockers:
        normalized_blockers = [
            _normalize_requirements_blocker(None, 0),
            _normalize_requirements_blocker(None, 1),
            _normalize_requirements_blocker(None, 2),
        ]

    proposed_tests_raw = commissioner_payload.get("proposed_acceptance_tests")
    if not isinstance(proposed_tests_raw, list):
        proposed_tests_raw = commissioner_payload.get("acceptance_tests")
    proposed_acceptance_tests: List[str] = []
    if isinstance(proposed_tests_raw, list):
        for item in proposed_tests_raw:
            if isinstance(item, str) and item.strip():
                proposed_acceptance_tests.append(item.strip())
            elif isinstance(item, dict):
                test_name = str(item.get("testName") or item.get("name") or "").strip()
                if test_name:
                    proposed_acceptance_tests.append(test_name)

    summary = str(
        commissioner_payload.get("requirements_summary")
        or commissioner_payload.get("summary")
        or commissioner_payload.get("recommendation")
        or "Commissioner identified missing requirements needed to continue implementation."
    ).strip()

    return {
        "summary": summary,
        "blockers": normalized_blockers,
        "proposed_acceptance_tests": proposed_acceptance_tests,
        "performance_budget": commissioner_payload.get("performance_budget") or commissioner_payload.get("performanceTarget"),
        "maintenance_scope": commissioner_payload.get("maintenance_scope") or commissioner_payload.get("maintenanceScope"),
    }


def _evaluate_commissioner_decision(payload: Dict[str, Any]) -> Tuple[str, str, Dict[str, Any]]:
    score_raw = payload.get("value_score")
    recommendation = str(payload.get("recommendation") or "").strip()
    confidence = payload.get("confidence")

    score_value: Optional[float]
    try:
        score_value = float(score_raw) if score_raw is not None else None
    except (TypeError, ValueError):
        score_value = None

    decision_hint = str(payload.get("commissioner_decision") or payload.get("decision") or "").strip().lower()
    hard_fail_reason = str(
        payload.get("hard_fail_reason")
        or payload.get("failure_reason")
        or payload.get("policy_reason")
        or ""
    ).strip()
    hard_fail_flag = bool(
        payload.get("hard_fail")
        or payload.get("policy_violation")
        or payload.get("non_viable")
        or decision_hint in {"hard_fail", "fail", "rejected", "reject"}
    )

    if hard_fail_flag:
        reason = hard_fail_reason or recommendation or "Commissioner marked this run as non-viable."
        return (
            "failed",
            f"Commissioner hard fail: {reason}",
            {
                "value_score": score_raw,
                "recommendation": recommendation,
                "commissioner_decision": "hard_fail",
                "hard_fail_reason": reason,
            },
        )

    packet = _build_requirements_request_packet(payload)
    blockers = packet.get("blockers") if isinstance(packet, dict) else []
    has_blockers = isinstance(blockers, list) and len(blockers) > 0

    if decision_hint in {"needs_requirements", "blocked_requirements", "needs_info"}:
        return (
            "needs_requirements",
            f"Requirements needed: {len(blockers)} blocker(s) must be answered before implementation can continue.",
            {
                "value_score": score_raw,
                "recommendation": recommendation,
                "commissioner_decision": "needs_requirements",
                "confidence": confidence,
                "requirements_request": packet,
            },
        )

    if score_value is not None and score_value >= 7 and not has_blockers:
        return (
            "passed",
            f"Commissioner score: {score_raw}/10, recommendation: {recommendation or 'proceed'}",
            {"value_score": score_raw, "recommendation": recommendation, "commissioner_decision": "success"},
        )

    return (
        "needs_requirements",
        f"Requirements needed: Commissioner score {score_raw if score_raw is not None else 'n/a'}/10 indicates more input is required.",
        {
            "value_score": score_raw,
            "recommendation": recommendation,
            "commissioner_decision": "needs_requirements",
            "confidence": confidence,
            "requirements_request": packet,
        },
    )


def _derive_final_status(
    manifest_status: str,
    agent_completions: Dict[str, str],
    all_agents_complete: bool,
    synthesis_present: bool,
) -> str:
    """Derive run final status from manifest + observed completion state."""
    status = (manifest_status or "").strip()

    if status.startswith("error:CalledProcessError") and all_agents_complete and synthesis_present:
        return "completed_with_errors"

    any_agent_error = any(
        str(v).lower().startswith("error") or str(v).lower() == "failed"
        for v in agent_completions.values()
    )
    if any_agent_error:
        return "failed"
    if all_agents_complete:
        return "completed"
    if status in ("", "queued", "running", "starting"):
        return "running"
    return status

# ----------------------------
# Configuration
# ----------------------------
BASE_DIR = pathlib.Path(__file__).parent.resolve()
# Project root (repo root), not the service folder
ROOT_DIR = BASE_DIR.parents[3]

# On Windows, avoid noisy Proactor connection_lost stack traces
if sys.platform.startswith("win"):
    import asyncio
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


class ServiceSettings(BaseSettings):
    """Runtime configuration loaded from .env / environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="PROMPT_API_",
        # Load repo root .env first, then service-local .env (local overrides root).
        # ROOT_DIR/.env is the canonical credentials file; BASE_DIR/.env may not exist.
        env_file=(ROOT_DIR / ".env", BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    db_path: pathlib.Path = BASE_DIR / "workbench.db"
    template_dir: pathlib.Path = BASE_DIR / "templates"
    data_dir: pathlib.Path = BASE_DIR / "data"
    openai_model: str = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")  # fallback for legacy env var
    openai_api_key: Optional[str] = Field(default_factory=lambda: os.environ.get("OPENAI_API_KEY"))
    openai_api_base: str = os.environ.get("OPENAI_API_BASE", "https://api.openai.com/v1")
    provider: str = Field(
        default_factory=lambda: os.environ.get("PROMPT_API_PROVIDER") or os.environ.get("AI_PROVIDER") or "openai"
    )
    bridge_dir: pathlib.Path = ROOT_DIR / "apps" / "orchestration-bridge"
    admin_token: Optional[str] = Field(default_factory=lambda: os.environ.get("PROMPT_API_ADMIN_TOKEN"))
    # GITHUB_TOKEN has no PROMPT_API_ prefix — use validation_alias to map it directly.
    github_token: Optional[str] = Field(default=None, validation_alias="GITHUB_TOKEN")


settings = ServiceSettings()
# Inject GITHUB_TOKEN into the process environment so os.environ.get("GITHUB_TOKEN")
# works throughout the app (including ensure_github_token and all github_api endpoints).
if settings.github_token and not os.environ.get("GITHUB_TOKEN"):
    os.environ["GITHUB_TOKEN"] = settings.github_token
settings.template_dir.mkdir(parents=True, exist_ok=True)
settings.data_dir.mkdir(parents=True, exist_ok=True)

DB_PATH = settings.db_path
TEMPLATE_DIR = settings.template_dir
DATA_DIR = settings.data_dir
DEFAULT_MODEL = settings.openai_model
OPENAI_API_KEY = settings.openai_api_key or ""
OPENAI_API_BASE = settings.openai_api_base.rstrip("/")
if OPENAI_API_BASE in ("https://api.openai.com", "http://api.openai.com"):
    # OpenAI public API expects `/v1` (e.g. `/v1/responses`). Avoid 404s like `/responses`.
    OPENAI_API_BASE = f"{OPENAI_API_BASE}/v1"
PROVIDER = (settings.provider or "openai").lower()
PROMPT_SYNC_FILE = DATA_DIR / "prompt-library.json"
AGENT_SYNC_FILE = DATA_DIR / "agent-library.json"


def _normalized_runtime_env() -> str:
    """Normalize environment name across legacy and new env vars."""
    return (
        os.environ.get("PROMPT_API_ENV")
        or os.environ.get("ENVIRONMENT")
        or "development"
    ).strip().lower()


def _is_development_environment() -> bool:
    return _normalized_runtime_env() in {"dev", "development", "local", "test", "testing"}


def _is_truthy(value: Optional[str]) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _allow_insecure_local() -> bool:
    """
    Whether insecure/no-token access is allowed.

    Backwards-compatible default:
    - dev/test/local: allowed unless explicitly disabled
    - non-dev: denied unless explicitly enabled
    """
    raw = os.environ.get("ALLOW_INSECURE_LOCAL")
    if raw is None:
        return _is_development_environment()
    return _is_truthy(raw)


def _constant_time_equals(left: Optional[str], right: Optional[str]) -> bool:
    if not left or not right:
        return False
    return hmac.compare_digest(left, right)


def _get_execution_token() -> Optional[str]:
    """
    Resolve token used for process-executing orchestration routes.

    Priority:
    1. PROMPT_API_EXECUTION_TOKEN
    2. PROMPT_API_ADMIN_TOKEN (settings.admin_token)
    """
    return os.environ.get("PROMPT_API_EXECUTION_TOKEN") or settings.admin_token

BRIDGE_DIR = settings.bridge_dir
BRIDGE_RUN_DIR = BRIDGE_DIR / "runs"
BRIDGE_RUN_DIR.mkdir(parents=True, exist_ok=True)
KNOWLEDGE_DB_PATH = BRIDGE_DIR / "knowledge_base.json"  # Phase 2: Agent Knowledge Base
PS_REFINER = BRIDGE_DIR / "OpenAI_Refiner.ps1"
# Prefer in-repo orchestrator; fallback to external path or env override
def _resolve_env_path(env_key: str, default_path: pathlib.Path) -> pathlib.Path:
    value = os.environ.get(env_key)
    if value:
        return pathlib.Path(value).expanduser().resolve()
    return default_path

DEFAULT_UNIFIED_ORCHESTRATOR = (
    ROOT_DIR / "Orchestration" / "scripts" / "Unified-Orchestration.ps1"
).resolve()
DEFAULT_POF = (ROOT_DIR / "Orchestration" / "scripts" / "POF.ps1").resolve()
POF_PS1 = _resolve_env_path("POF_PS1", DEFAULT_POF)
ORCH_PS1 = _resolve_env_path("ORCHESTRATOR_PS1", DEFAULT_UNIFIED_ORCHESTRATOR)
CODEX_SWARM_PS1 = os.environ.get("CODEX_SWARM_PS1") or str(
    (ROOT_DIR / "Orchestration" / "engine" / "codex-multiagent-swarm" / "Orchestrate-Codex.ps1").resolve()
)
REPO_ROOT_DEFAULT = str((ROOT_DIR.parent).resolve())


def _positive_int_env(var_name: str, default: int) -> int:
    raw = os.environ.get(var_name)
    if raw is None:
        return default
    try:
        parsed = int(raw)
    except ValueError:
        logger.warning("Invalid %s=%r; using default %s", var_name, raw, default)
        return default
    if parsed < 1:
        logger.warning("Non-positive %s=%r; using default %s", var_name, raw, default)
        return default
    return parsed


ORCH_RUN_MAX_CONCURRENT = _positive_int_env("PROMPT_API_ORCH_MAX_CONCURRENT", 2)
ORCH_RUN_MAX_QUEUED = _positive_int_env("PROMPT_API_ORCH_MAX_QUEUED", 100)
ORCH_LEASE_TTL_SECONDS = _positive_int_env("PROMPT_API_ORCH_LEASE_TTL_SECONDS", 45)
ORCH_HEARTBEAT_INTERVAL_SECONDS = _positive_int_env("PROMPT_API_ORCH_HEARTBEAT_INTERVAL_SECONDS", 10)
ORCH_QUEUE_STATUSES = {"queued", "pending"}
ORCH_DISPATCHING_STATUSES = {"dispatching"}
ORCH_RUNNING_STATUSES = {
    "running",
    "starting",
    "in_progress",
    "awaiting_input",
    "gating",
    "awaiting_gate",
    *ORCH_DISPATCHING_STATUSES,
}
ORCH_TERMINAL_STATUSES = {
    "completed",
    "completed_with_errors",
    "success",
    "succeeded",
    "blocked_requirements",
    "needs_requirements",
    "failed",
    "error",
    "cancelled",
    "canceled",
}

# Bounded execution pool prevents sudden queue drains from exhausting tokens.
_orch_run_executor = ThreadPoolExecutor(
    max_workers=ORCH_RUN_MAX_CONCURRENT,
    thread_name_prefix="orch-run",
)
_orch_run_state_lock = threading.Lock()
_orch_run_state: Dict[str, Dict[str, Any]] = {}
_orch_manifest_lock = threading.Lock()

REGISTRY_SRC = ROOT_DIR / "packages" / "prompt-registry" / "src"
if REGISTRY_SRC.exists():
    sys.path.insert(0, str(REGISTRY_SRC))
try:
    from prompt_registry import (
        PromptSpec,
        list_prompts as registry_list_prompts,
        find_prompt_by_id as registry_find_prompt,
    )  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    PromptSpec = Any  # type: ignore
    registry_list_prompts = None  # type: ignore
    registry_find_prompt = None  # type: ignore


@dataclass
class SyncedPromptSpec:
    id: str
    version: str
    raw: Dict[str, Any]
    payload: Dict[str, Any]
    path: Optional[pathlib.Path] = None

    def to_ui_payload(self) -> Dict[str, Any]:
        return self.payload

# ----------------------------
# Data Models
# ----------------------------
class InputData(BaseModel):
    # Free-form bag for your scenario inputs
    log_snippet: Optional[str] = None
    timestamp: Optional[str] = None
    # Add more keys as your use cases expand (metrics, regions, etc.)
    # Example:
    # metrics: Optional[Dict[str, Any]] = None

class RequestPayload(BaseModel):
    template_id: str = Field(
        ...,
        description=(
            "Execution resource identifier used by `/api/generate` and `/api/generate/dry-run`. "
            "The runtime first attempts to resolve this value as a canonical prompt id from `/prompts`, "
            "then falls back to a legacy YAML template under `/api/templates/{template_id}`."
        ),
    )
    role: str = Field(..., description="e.g., Genesys Cloud Monitoring Assistant")
    task: str = Field(..., description="e.g., Explain likely causes and mitigations for WebRTC disconnects")
    context: Dict[str, Any] = Field(..., description="e.g., {'environment':'Prod','audience':['Executives','NOC Engineers'],'scale':'100k agents, 12 BPO partners'}")
    input_data: InputData = Field(default_factory=InputData)
    desired_output: List[str] = Field(default_factory=lambda: ["executive_summary","technical_json","chart_recommendations"])
    modes: List[str] = Field(default_factory=lambda: ["exec","engineer","viz"])  # Presentation modes
    model: Optional[str] = None

    @field_validator("desired_output")
    @classmethod
    def at_least_one_output(cls, value):
        if not value:
            raise ValueError("desired_output must have at least one item")
        return value

class GenerateResponse(BaseModel):
    cached: bool
    cache_key: str
    template_id: str = Field(
        ...,
        description=(
            "Identifier used for generation. This may be a canonical prompt id from `/prompts` "
            "or a legacy YAML template id from `/api/templates`."
        ),
    )
    model: str
    output: Dict[str, Any]
    audit_id: int = Field(..., description="Audit record id that can be retrieved from `/api/audit`.")

class PromptSyncRequest(BaseModel):
    prompts: List[Dict[str, Any]] = Field(default_factory=list)


class PromptSyncResponse(BaseModel):
    status: str
    count: int


class RenderRequest(BaseModel):
    prompt_id: str = Field(..., description="Canonical prompt id from `/prompts` used by render and refiner workflows.")
    variables: Dict[str, Any] = Field(default_factory=dict)

class RenderResponse(BaseModel):
    prompt: Dict[str, Any]
    rendered_blocks: Dict[str, Any]


class HealthResponse(BaseModel):
    ok: bool
    time: str = Field(..., description="UTC timestamp when the health check was generated.")


class MetricsResponse(BaseModel):
    renders_total: int
    render_errors: int
    refiner_runs: int
    refiner_errors: int
    review_records: int
    refiner_queue_depth: int


class PromptVariableDefinition(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: Optional[str] = None
    required: Optional[bool] = None
    description: Optional[str] = None
    default: Optional[Any] = None


class PromptVariableItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    name: str
    label: Optional[str] = None
    type: Optional[str] = None
    default: Optional[Any] = None
    required: Optional[bool] = None
    description: Optional[str] = None


class PromptOutputContract(BaseModel):
    model_config = ConfigDict(extra="allow")

    format: Optional[str] = None


class PromptModelPreferences(BaseModel):
    model_config = ConfigDict(extra="allow")

    recommended: List[str] = Field(default_factory=list)
    temperature: Optional[float] = None
    top_p: Optional[float] = None


class PromptPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    version: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    owner: Optional[str] = None
    context: Optional[str] = None
    role: Optional[str] = None
    style: Optional[str] = None
    template: Optional[str] = None
    prompt: Optional[Dict[str, Any]] = None
    variables: Optional[List[PromptVariableItem] | Dict[str, PromptVariableDefinition]] = None
    tags: List[str] = Field(default_factory=list)
    integrations: Optional[Dict[str, Any]] = None
    telemetry: Optional[Dict[str, Any]] = None
    outputs: Optional[PromptOutputContract] = None
    models: Optional[PromptModelPreferences] = None
    fewShot: Optional[List[Dict[str, Any]]] = None
    outputFormat: Optional[str] = None
    stop: Optional[List[str]] = None
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    updatedAt: Optional[str] = None
    createdAt: Optional[str] = None


class PromptListResponse(RootModel[List[PromptPayload]]):
    pass


class TemplateExample(BaseModel):
    model_config = ConfigDict(extra="allow")

    input: Optional[str] = None
    output: Optional[str] = None


class TemplateDocument(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    system: Optional[str] = None
    instructions: Optional[str] = None
    constraints: Optional[str] = None
    style: Optional[str] = None
    few_shot: List[TemplateExample] = Field(default_factory=list)


class TemplateListResponse(BaseModel):
    templates: List[str]


class InstallDefaultTemplatesResponse(BaseModel):
    created: List[str]
    skipped: List[str]
    dir: str


class ReloadTemplatesResponse(BaseModel):
    count: int
    ids: List[str]


class AuditEntryResponse(BaseModel):
    id: int
    template_id: str = Field(
        ...,
        description=(
            "Generation resource identifier recorded in the audit trail. "
            "This corresponds to `GenerateResponse.audit_id` and may reference a canonical prompt id or legacy template id."
        ),
    )
    model: str
    created_at: str
    status: str
    cached: bool


class AuditListResponse(BaseModel):
    items: List[AuditEntryResponse]


class DryRunMessage(BaseModel):
    role: str
    content: str


class DryRunResponse(BaseModel):
    model: str
    messages: List[DryRunMessage]

class RefinerRunRequest(BaseModel):
    prompt_id: str
    invoke_refiner: bool = True
    dry_run: bool = False
    reviewers: List[str] = Field(default_factory=list)
    notes: Optional[str] = None

class RefinerRunResponse(BaseModel):
    prompt_id: str
    manifest: Optional[str]
    refiner_invoked: bool
    dry_run: bool
    reviewers: List[str]
    notes: Optional[str]


class ReviewRecordRequest(BaseModel):
    status: str
    reviewers: List[str] = Field(default_factory=list)
    notes: Optional[str] = None
    manifest: Optional[str] = None
    timestamp: Optional[str] = None
    runbook: Optional[Dict[str, Any]] = None


class AgentSyncRequest(BaseModel):
    agents: List[Dict[str, Any]] = Field(default_factory=list)


class PromptSearchResult(BaseModel):
    id: str
    title: str
    version: str
    category: Optional[str] = None
    owner: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    description: Optional[str] = None
    updated: str
    relevance: Optional[float] = None


class SearchPromptsResponse(BaseModel):
    results: List[PromptSearchResult]
    total: int
    query: Optional[str] = None
    filters: Dict[str, Any] = Field(default_factory=dict)


class OrchestratorTask(BaseModel):
    supervisor: Dict[str, Any]
    agents: List[Dict[str, Any]] = Field(default_factory=list)
    prompts: List[Dict[str, Any]] = Field(default_factory=list)

# ----------------------------
# DB helpers (cache + audit)
# ----------------------------
def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("""
        CREATE TABLE IF NOT EXISTS cache (
            cache_key TEXT PRIMARY KEY,
            template_id TEXT,
            model TEXT,
            input_json TEXT,
            output_json TEXT,
            created_at TEXT
        )
        """)
        c.execute("""
        CREATE TABLE IF NOT EXISTS audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id TEXT,
            model TEXT,
            input_json TEXT,
            output_json TEXT,
            cached INTEGER,
            status TEXT,
            created_at TEXT,
            token_prompt INTEGER,
            token_completion INTEGER
        )
        """)
        c.execute("""
        CREATE TABLE IF NOT EXISTS orchestrator_tasks (
            id TEXT PRIMARY KEY,
            payload TEXT NOT NULL
        )
        """)
        conn.commit()
    _migrate_legacy_task_queue()
    
    # Apply database migrations for new features
    if apply_migrations:
        try:
            apply_migrations(DB_PATH)
        except Exception as e:
            print(f"Warning: Could not apply migrations: {e}")

def now_iso():
    return (
        datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )

def normalize(obj: Any) -> str:
    """Deterministic JSON for hashing & storage."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))

def sanitize_run_id(raw: str, max_length: int = 120) -> str:
    """
    Sanitize a run ID/goal string to be safe for Windows filesystem paths.
    
    Windows filesystem has strict constraints on valid path characters, and certain
    characters like newlines, colons, and other control characters cause errors when
    creating directories (e.g., WinError 123).
    
    This function:
    - Treats None as empty string
    - Strips leading/trailing whitespace including \\r and \\n
    - Replaces any whitespace (spaces, tabs, newlines) with a single underscore
    - Replaces invalid Windows path characters (<>:"/\\|?*) with underscores
    - Collapses multiple consecutive underscores into a single underscore
    - Strips trailing dots and spaces (Windows doesn't allow these at the end of names)
    - Defaults to "run" if the result is empty
    - Enforces a maximum length to avoid excessively long path segments
    
    Args:
        raw: The raw string to sanitize (e.g., a goal or prompt ID)
        max_length: Maximum length for the sanitized result (default: 120)
    
    Returns:
        A filesystem-safe string suitable for use as a single path component
    """
    if raw is None:
        raw = ""
    
    # Strip leading/trailing whitespace including carriage returns and newlines
    result = raw.strip()
    
    # Replace any whitespace character (space, tab, newline, carriage return) with underscore
    result = re.sub(r'\s+', '_', result)
    
    # Define invalid Windows path characters
    INVALID_PATH_CHARS = '<>:"/\\|?*'
    
    # Replace each invalid character with underscore
    for char in INVALID_PATH_CHARS:
        result = result.replace(char, '_')

    # Replace any remaining unsafe characters (including [] and commas) with underscores
    # Keep Unicode letters/digits, dot, dash, and underscore to avoid shell/glob issues.
    result = re.sub(r'[^\w._-]+', '_', result, flags=re.UNICODE)
    
    # Collapse multiple consecutive underscores into a single underscore
    result = re.sub(r'_+', '_', result)
    
    # Strip trailing dots, spaces, and underscores (Windows doesn't allow dots/spaces at end)
    result = result.rstrip('_. ')
    
    # If the result is empty, default to "run"
    if not result:
        result = "run"
    
    # Enforce maximum length
    if len(result) > max_length:
        result = result[:max_length].rstrip('_. ')
    
    return result

def hash_payload(template_id: str, model: str, payload: Dict[str, Any]) -> str:
    h = hashlib.sha256()
    h.update(template_id.encode("utf-8"))
    h.update(model.encode("utf-8"))
    h.update(normalize(payload).encode("utf-8"))
    return h.hexdigest()

def cache_get(cache_key: str) -> Optional[Dict[str, Any]]:
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("SELECT output_json FROM cache WHERE cache_key = ?", (cache_key,))
        row = c.fetchone()
        if row:
            return json.loads(row[0])
    return None

def cache_put(cache_key: str, template_id: str, model: str, input_json: str, output: Dict[str, Any]):
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("INSERT OR REPLACE INTO cache(cache_key, template_id, model, input_json, output_json, created_at) VALUES (?,?,?,?,?,?)",
        (cache_key, template_id, model, input_json, json.dumps(output), now_iso()))
        conn.commit()

def audit_log(
    template_id: str, 
    model: str, 
    input_json: str, 
    output: Optional[Dict[str, Any]], 
    cached: bool, 
    status: str, 
    token_prompt: Optional[int], 
    token_completion: Optional[int],
    run_id: Optional[str] = None,
    agent_name: Optional[str] = None
) -> int:
    """
    Log API call to audit table and optionally record environmental metrics.
    
    Args:
        template_id: Template/prompt ID
        model: Model name
        input_json: JSON serialized input
        output: Output dictionary
        cached: Whether result was cached
        status: Status string
        token_prompt: Input/prompt tokens
        token_completion: Output/completion tokens
        run_id: Optional orchestration run ID
        agent_name: Optional agent name
        
    Returns:
        Audit log entry ID
    """
    timestamp = now_iso()
    
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("""
        INSERT INTO audit(template_id, model, input_json, output_json, cached, status, created_at, token_prompt, token_completion)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (template_id, model, input_json, json.dumps(output) if output else None, 1 if cached else 0, status, timestamp, token_prompt, token_completion))
        audit_id = c.lastrowid
        conn.commit()
    
    # Record environmental metrics if tokens available and not cached (to avoid double-counting)
    if token_prompt is not None and token_completion is not None and not cached:
        try:
            # Import is at module level at top of file
            import cost_metrics
            cost_metrics.record_call_metrics(
                db_path=DB_PATH,
                model=model,
                tokens_input=token_prompt,
                tokens_output=token_completion,
                run_id=run_id,
                agent_name=agent_name,
                timestamp=timestamp
            )
        except Exception as e:
            # Don't fail the audit log if metrics recording fails
            print(f"Warning: Failed to record cost metrics: {e}")
    
    return audit_id

def read_templates() -> Dict[str, Dict[str, Any]]:
    templates = {}
    for p in TEMPLATE_DIR.glob("*.yaml"):
        with open(p, "r", encoding="utf-8") as f:
            y = yaml.safe_load(f)
            templates[y["id"]] = y
    return templates

def load_registry_payloads() -> List[Dict[str, Any]]:
    if registry_list_prompts is None:
        return []
    try:
        return [spec.to_ui_payload() for spec in registry_list_prompts()]
    except Exception as exc:  # pragma: no cover
        print(f"[prompt-api] Failed to load registry prompts: {exc}")
        return []

def load_synced_payloads() -> List[Dict[str, Any]]:
    if not PROMPT_SYNC_FILE.exists():
        return []
    try:
        with open(PROMPT_SYNC_FILE, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, list) else []
    except Exception as exc:  # pragma: no cover
        print(f"[prompt-api] Failed to read synced prompts: {exc}")
        return []

def save_synced_payloads(payload: List[Dict[str, Any]]) -> None:
    with open(PROMPT_SYNC_FILE, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)


def _migrate_legacy_task_queue() -> None:
    queue_file = DATA_DIR / "orchestrator-tasks.json"
    if not queue_file.exists():
        return
    try:
        legacy_data = json.loads(queue_file.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover
        print(f"[prompt-api] Failed to migrate legacy task queue ({exc})")
        return
    if not isinstance(legacy_data, list):
        legacy_data = []
    with sqlite3.connect(DB_PATH) as conn:
        for entry in legacy_data:
            if not isinstance(entry, dict):
                continue
            task_id = entry.get("id")
            if not task_id:
                continue
            conn.execute(
                "INSERT OR IGNORE INTO orchestrator_tasks(id, payload) VALUES (?, ?)",
                (task_id, json.dumps(entry)),
            )
        conn.commit()
    try:
        queue_file.rename(queue_file.with_suffix(".legacy.json"))
    except FileNotFoundError:
        pass


def _build_blocks_from_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    blocks = payload.get("blocks")
    if isinstance(blocks, dict):
        return blocks
    template = payload.get("template") or payload.get("description") or ""
    style = payload.get("style") or ""
    system_role = payload.get("role")
    system_msg = style if system_role == "system" and style else f"You are {system_role or 'a helpful assistant'}."
    constructed = {
        "system": system_msg,
        "instructions": template,
    }
    if style and system_role != "system":
        constructed["style"] = style
    few_shot = payload.get("fewShot")
    if isinstance(few_shot, list) and few_shot:
        examples = []
        current_input: Optional[str] = None
        for message in few_shot:
            if not isinstance(message, dict):
                continue
            role = message.get("role")
            content = message.get("content")
            if role == "user":
                current_input = content
            elif role == "assistant":
                entry = {"output": content}
                if current_input:
                    entry["input"] = {"raw": current_input}
                examples.append(entry)
                current_input = None
        constructed["examples"] = [ex for ex in examples if ex.get("output")]
    return constructed


def _build_variables_from_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    variables: Dict[str, Any] = {}
    raw_vars = payload.get("variables")
    if isinstance(raw_vars, list):
        for idx, entry in enumerate(raw_vars):
            if not isinstance(entry, dict):
                continue
            name = entry.get("name") or f"var{idx+1}"
            variables[name] = {
                "type": entry.get("type") or "string",
                "label": entry.get("label"),
                "description": entry.get("description"),
                "required": bool(entry.get("required")),
                "default": entry.get("default"),
            }
    return variables


def _synced_prompt_spec(prompt_id: str) -> Optional[SyncedPromptSpec]:
    for payload in load_synced_payloads():
        if payload.get("id") != prompt_id:
            continue
        version = str(payload.get("version") or "0.0.0")
        raw = {
            "id": prompt_id,
            "version": version,
            "blocks": _build_blocks_from_payload(payload),
            "variables": _build_variables_from_payload(payload),
        }
        return SyncedPromptSpec(id=prompt_id, version=version, raw=raw, payload=payload)
    return None


def load_synced_agents() -> List[Dict[str, Any]]:
    if not AGENT_SYNC_FILE.exists():
        return []
    try:
        with open(AGENT_SYNC_FILE, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, list) else []
    except Exception as exc:  # pragma: no cover
        print(f"[prompt-api] Failed to read agent library: {exc}")
        return []


def save_synced_agents(payload: List[Dict[str, Any]]) -> None:
    with open(AGENT_SYNC_FILE, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)


def _require_admin_access(header_token: Optional[str]) -> None:
    expected = settings.admin_token
    if not expected:
        if _allow_insecure_local():
            return
        raise HTTPException(
            status_code=401,
            detail=(
                "Admin token is not configured. Set PROMPT_API_ADMIN_TOKEN or "
                "explicitly set ALLOW_INSECURE_LOCAL=true for local-only development."
            ),
        )
    if not _constant_time_equals(header_token, expected):
        raise HTTPException(status_code=401, detail="Admin token missing or invalid.")


def _require_execution_access(header_token: Optional[str]) -> None:
    expected = _get_execution_token()
    if not expected:
        if _allow_insecure_local():
            return
        raise HTTPException(
            status_code=401,
            detail=(
                "Execution token is not configured. Set PROMPT_API_EXECUTION_TOKEN "
                "(or PROMPT_API_ADMIN_TOKEN), or explicitly set ALLOW_INSECURE_LOCAL=true."
            ),
        )
    if not _constant_time_equals(header_token, expected):
        raise HTTPException(status_code=401, detail="Execution token missing or invalid.")


def _validate_prompt_sync_payload(prompts: List[Dict[str, Any]]) -> None:
    if len(prompts) > 1000:
        raise HTTPException(status_code=400, detail="Prompt sync limit exceeded (max 1000 records).")
    for idx, prompt in enumerate(prompts):
        if not isinstance(prompt, dict):
            raise HTTPException(status_code=400, detail=f"Prompt at index {idx} is not an object.")
        prompt_id = prompt.get("id")
        if not isinstance(prompt_id, str) or not prompt_id.strip():
            raise HTTPException(status_code=400, detail=f"Prompt at index {idx} is missing a valid 'id'.")
        has_template = any(
            isinstance(prompt.get(key), (str, dict))
            for key in ("template", "prompt", "blocks")
        )
        if not has_template:
            raise HTTPException(status_code=400, detail=f"Prompt '{prompt_id}' must include template content.")


def _validate_agent_payload(agents: List[Dict[str, Any]]) -> None:
    if len(agents) > 500:
        raise HTTPException(status_code=400, detail="Agent sync limit exceeded (max 500 records).")
    for idx, agent in enumerate(agents):
        if not isinstance(agent, dict):
            raise HTTPException(status_code=400, detail=f"Agent at index {idx} is not an object.")
        agent_id = agent.get("id")
        if not isinstance(agent_id, str) or not agent_id.strip():
            raise HTTPException(status_code=400, detail=f"Agent at index {idx} is missing a valid 'id'.")


def load_task_queue() -> List[Dict[str, Any]]:
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute("SELECT payload FROM orchestrator_tasks ORDER BY rowid").fetchall()
    tasks: List[Dict[str, Any]] = []
    for (payload_json,) in rows:
        try:
            tasks.append(json.loads(payload_json))
        except json.JSONDecodeError:  # pragma: no cover
            continue
    return tasks


def append_task_queue(task: Dict[str, Any]) -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO orchestrator_tasks(id, payload) VALUES (?, ?)",
            (task["id"], json.dumps(task)),
        )
        conn.commit()


def update_task_queue(task_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute("SELECT payload FROM orchestrator_tasks WHERE id = ?", (task_id,)).fetchone()
        if not row:
            return None
        payload = json.loads(row[0])
        payload.update(updates)
        conn.execute(
            "UPDATE orchestrator_tasks SET payload = ? WHERE id = ?",
            (json.dumps(payload), task_id),
        )
        conn.commit()
        return payload

VAR_PATTERN = re.compile(r"\$\{([^}]+)\}")

def _get_prompt_or_404(prompt_id: str, allow_synced: bool = False):
    registry_missing = registry_find_prompt is None
    spec = None
    if not registry_missing:
        spec = registry_find_prompt(prompt_id)
    if spec:
        return spec
    if allow_synced:
        synced_spec = _synced_prompt_spec(prompt_id)
        if synced_spec:
            return synced_spec
    if registry_missing:
        raise HTTPException(status_code=503, detail="Prompt registry not available")
    raise HTTPException(status_code=404, detail=f"Prompt not found: {prompt_id}")

def _render_text(value: Any, variables: Dict[str, Any]) -> Any:
    if not isinstance(value, str):
        return value
    def repl(match: re.Match) -> str:
        key = match.group(1)
        return str(variables.get(key, match.group(0)))
    return VAR_PATTERN.sub(repl, value)

def render_blocks(spec, variables: Dict[str, Any]) -> Dict[str, Any]:
    blocks = spec.raw.get("blocks", {})
    rendered = {}
    for key, value in blocks.items():
        if isinstance(value, list):
            rendered[key] = [_render_text(v, variables) for v in value]
        elif isinstance(value, dict):
            rendered[key] = {k: _render_text(v, variables) for k, v in value.items()}
        else:
            rendered[key] = _render_text(value, variables)
    return rendered


def _block_to_string(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return "\n".join(str(item) for item in value)
    return str(value)


def _template_from_spec(spec: PromptSpec) -> Dict[str, Any]:
    blocks = spec.raw.get("blocks", {}) or {}
    examples = []
    for example in blocks.get("examples", []) or []:
        raw_input = example.get("input")
        if isinstance(raw_input, (dict, list)):
            input_value = json.dumps(raw_input, ensure_ascii=False)
        else:
            input_value = str(raw_input or "")
        examples.append(
            {
                "input": input_value,
                "output": example.get("output", ""),
            }
        )
    return {
        "id": spec.id,
        "version": spec.version,
        "system": blocks.get("system", ""),
        "instructions": _block_to_string(blocks.get("instructions")),
        "constraints": _block_to_string(blocks.get("constraints")),
        "style": _block_to_string(blocks.get("style")),
        "few_shot": examples,
    }


def _resolve_template_payload(template_id: str) -> Tuple[Dict[str, Any], str]:
    """
    Return a template-like payload for message building.

    Prefers the canonical prompt registry. Falls back to legacy YAML templates.
    """

    if registry_find_prompt is not None:
        try:
            spec = registry_find_prompt(template_id)
        except Exception as exc:  # pragma: no cover
            print(f"[prompt-api] registry lookup failed for {template_id}: {exc}")
            spec = None
        if spec:
            return _template_from_spec(spec), "registry"

    templates = read_templates()
    tpl = templates.get(template_id)
    if tpl:
        return tpl, "legacy"

    raise HTTPException(status_code=404, detail=f"Template not found: {template_id}")

METRICS = {
    "renders_total": 0,
    "render_errors": 0,
    "refiner_runs": 0,
    "refiner_errors": 0,
    "review_records": 0,
}

def _write_manifest(spec, review_policy: str) -> pathlib.Path:
    manifest = {
        "prompt_id": spec.id,
        "version": spec.version,
        "source_path": str(spec.path),
        "requested_at": now_iso(),
        "review_policy": review_policy,
        "status": "queued",
    }
    target = BRIDGE_RUN_DIR / f"{spec.id.replace('.', '_')}.{spec.version}.json"
    target.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return target

def _invoke_power_shell_refiner(spec, manifest: pathlib.Path, dry_run: bool) -> None:
    """
    Invoke the PowerShell refiner script to process a prompt.
    
    This intentionally uses PowerShell as a worker process to leverage the existing
    OpenAI_Refiner.ps1 script that handles goal refinement and AI interaction.
    The design allows the Python API to orchestrate PowerShell-based AI workflows
    without reimplementing the refinement logic.
    
    For language-agnostic orchestration, consider using the orchestration-bridge
    service which provides a more flexible task queue system.
    """
    if dry_run:
        return
    if not PS_REFINER.exists():
        raise HTTPException(status_code=500, detail="Refiner script missing; cannot invoke.")
    cmd = [
        "pwsh" if os.name != "nt" else "powershell",
        "-File",
        str(PS_REFINER),
        "-PromptPath",
        str(spec.path),
        "-Manifest",
        str(manifest),
    ]
    subprocess.run(cmd, check=False)

def _refiner_queue_depth() -> int:
    return len(list(BRIDGE_RUN_DIR.glob("*.json")))


def _append_review_run(spec: PromptSpec, entry: Dict[str, Any]) -> Dict[str, Any]:
    with open(spec.path, "r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}

    telemetry = data.setdefault("telemetry", {})
    audit = telemetry.setdefault("audit", {})
    runs = audit.setdefault("runs", [])
    runs.append(entry)

    telemetry["audit"] = audit
    data["telemetry"] = telemetry

    with open(spec.path, "w", encoding="utf-8") as fh:
        yaml.safe_dump(data, fh, sort_keys=False, allow_unicode=True)
    return entry

# ----------------------------
# Prompt assembly
# ----------------------------
def build_messages(tpl: Dict[str, Any], req: RequestPayload) -> List[Dict[str, str]]:
    """Assemble system + few-shot + user messages."""
    # 1) System message (strict behavior contract)
    system_msg = tpl.get("system", "You are a helpful assistant.")
    # Interpolate lite tokens
    system_msg = system_msg.replace("{role}", req.role)

    messages = [{"role": "system", "content": system_msg}]

    # 2) Few-shot scaffolding (gold examples)
    for ex in tpl.get("few_shot", []):
        messages.append({"role": "user", "content": ex.get("input", "")})
        messages.append({"role": "assistant", "content": ex.get("output", "")})

    # 3) Output contract (enforce response shape)
    contract = textwrap.dedent("""\
    Output Contract:
    - Always return a JSON object with keys requested in 'desired_output'. 
    - If 'executive_summary' is requested, provide 2-4 crisp bullets with trend direction and business impact.
    - If 'technical_json' is requested, include fields: probable_cause, recommended_action (1-3 sentences each).
    - If 'chart_recommendations' is requested, return a small array of chart specs with 'type','metric','granularity'.
    - Always include both "C-Suite Summary" and "Engineer Drill-down" perspectives when applicable.
    - If data is insufficient, set probable_cause='unknown' and recommended_action='collect additional signals: <list>'.
    """)

    # 4) User message (task, context, inputs)
    user_msg = {
        "Task": req.task,
        "Context": req.context,
        "Modes": req.modes,
        "DesiredOutput": req.desired_output,
        "InputData": req.input_data.model_dump()
    }

    user_content = f"""\
You are acting as: {req.role}
Task: {req.task}
Context: {json.dumps(req.context, ensure_ascii=False)}
Modes: {", ".join(req.modes)}
DesiredOutput: {", ".join(req.desired_output)}

InputData (JSON):
{json.dumps(req.input_data.model_dump(), ensure_ascii=False, indent=2)}

{contract}

Return ONLY the JSON. No extra text.
"""
    supplemental = []
    for label, key in [("Instructions", "instructions"), ("Constraints", "constraints"), ("Style", "style")]:
        text_value = tpl.get(key)
        if text_value:
            supplemental.append(f"{label}:\n{text_value}")
    if supplemental:
        user_content += "\n" + "\n\n".join(supplemental) + "\n"

    messages.append({"role": "user", "content": user_content})
    return messages

# ----------------------------
# OpenAI call
# ----------------------------
def call_openai_chat(model: str, messages: List[Dict[str, str]]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")

    client = openai.OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_API_BASE)
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.2,
        )
    except Exception as exc:
        error_id = uuid.uuid4().hex[:8]
        print(f"[prompt-api] OpenAI error {error_id}: {exc}")
        raise HTTPException(status_code=502, detail=f"OpenAI error (id: {error_id})")

    choice = resp.choices[0].message
    content = cast(str, choice.content or "")
    usage = {
        "prompt_tokens": resp.usage.prompt_tokens if resp.usage else None,
        "completion_tokens": resp.usage.completion_tokens if resp.usage else None,
        "total_tokens": resp.usage.total_tokens if resp.usage else None,
    }

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start >= 0 and end > start:
            parsed = json.loads(content[start:end+1])
        else:
            raise HTTPException(status_code=500, detail="Model did not return valid JSON.")

    return parsed, usage


def call_anthropic_chat(model: str, messages: List[Dict[str, str]]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Placeholder for Anthropic provider. Extend with real SDK when available.
    """
    raise HTTPException(status_code=501, detail="Anthropic provider not yet implemented")


def call_azure_openai_chat(model: str, messages: List[Dict[str, str]]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Placeholder for Azure OpenAI provider. Extend with Azure client configuration.
    """
    raise HTTPException(status_code=501, detail="Azure OpenAI provider not yet implemented")


def call_provider_chat(model: str, messages: List[Dict[str, str]]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Simple provider router. Defaults to OpenAI; other providers stubbed for now.
    """
    provider = PROVIDER
    if provider == "openai":
        return call_openai_chat(model, messages)
    if provider in ("anthropic", "claude"):
        return call_anthropic_chat(model, messages)
    if provider in ("azure", "azure-openai"):
        return call_azure_openai_chat(model, messages)
    raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")


def _raise_openai_error(resp: requests.Response) -> None:
    error_id = uuid.uuid4().hex[:8]
    snippet = (resp.text or "")[:500]
    print(f"[prompt-api] OpenAI error {error_id} ({resp.status_code}): {snippet}")
    raise HTTPException(status_code=502, detail=f"Upstream provider error (id: {error_id})")

# ----------------------------
# FastAPI app
# ----------------------------

# Security and Performance Middleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.requests import Request
import time

# Import security utilities
try:
    from security import (
        RateLimitMiddleware, AuditLoggingMiddleware, 
        get_security_headers, initialize_security
    )
    SECURITY_ENABLED = True
except ImportError as security_import_error:
    if not _allow_insecure_local():
        raise RuntimeError(
            "Security middleware is required in non-local environments. "
            "Ensure prompt-api/security.py is importable, or set ALLOW_INSECURE_LOCAL=true explicitly."
        ) from security_import_error
    print(f"Warning: Security module not available: {security_import_error}")
    SECURITY_ENABLED = False

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Apply security headers
        if SECURITY_ENABLED:
            headers = get_security_headers()
            for key, value in headers.items():
                response.headers[key] = value
            # Swagger / ReDoc UI loads scripts and styles from cdn.jsdelivr.net — relax CSP for those routes only
            if request.url.path in ("/docs", "/redoc"):
                response.headers["Content-Security-Policy"] = (
                    "default-src 'self' cdn.jsdelivr.net; "
                    "img-src 'self' data: fastapi.tiangolo.com cdn.jsdelivr.net; "
                    "script-src 'self' 'unsafe-inline' cdn.jsdelivr.net; "
                    "style-src 'self' 'unsafe-inline' cdn.jsdelivr.net; "
                    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
                )
        else:
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-XSS-Protection"] = "1; mode=block"
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        # Allow caching for static resources but not for API responses with sensitive data
        if request.url.path.startswith("/static/") or request.url.path.endswith((".css", ".js", ".png", ".jpg", ".svg")):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response

class PerformanceMiddleware(BaseHTTPMiddleware):
    """Middleware to track request performance metrics."""
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        response.headers["X-Process-Time"] = str(round(process_time * 1000, 2))  # milliseconds
        return response
def create_app() -> FastAPI:
    fastapi_app = FastAPI(title="AI Prompt Workbench", version="1.0.0")

    # Initialize security features
    if SECURITY_ENABLED:
        initialize_security()

    # Add compression middleware (first for response compression)
    fastapi_app.add_middleware(GZipMiddleware, minimum_size=1000)
    
    # Add security middleware (rate limiting and audit logging)
    if SECURITY_ENABLED:
        fastapi_app.add_middleware(AuditLoggingMiddleware)
        fastapi_app.add_middleware(RateLimitMiddleware)
    
    # Add performance tracking middleware
    fastapi_app.add_middleware(PerformanceMiddleware)
    
    # Add security headers middleware
    fastapi_app.add_middleware(SecurityHeadersMiddleware)

    fastapi_app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
            "http://localhost:8501",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        ensure_github_token()
        init_db()
        try:
            yield
        finally:
            _orch_run_executor.shutdown(wait=False, cancel_futures=True)

    fastapi_app.router.lifespan_context = lifespan
    return fastapi_app


app = create_app()

# Initialize authentication system
try:
    from auth import (
        initialize_auth, authenticate_user, create_access_token, create_refresh_token,
        UserLogin, Token, User, UserCreate, create_user, get_current_user, get_current_active_user,
        require_admin, require_user, require_readonly, UserRole
    )
    initialize_auth()
    AUTH_ENABLED = True
except ImportError as e:
    print(f"Warning: Authentication not available: {e}")
    AUTH_ENABLED = False

# Include GitHub integration router
try:
    from github_api import router as github_router
    app.include_router(github_router)
except ImportError as e:
    print(f"Warning: GitHub integration not available: {e}")

# Include webhook handler router
try:
    from webhook_handler import router as webhook_router
    app.include_router(webhook_router)
except ImportError as e:
    print(f"Warning: Webhook handler not available: {e}")

# Include MCP governance router
try:
    from mcp_governance.api_routes import router as mcp_router
    app.include_router(mcp_router)
except ImportError as e:
    print(f"Warning: MCP governance not available: {e}")

# ----------------------------
# Authentication Endpoints
# ----------------------------
if AUTH_ENABLED:
    @app.post("/auth/login", response_model=Token)
    def login(credentials: UserLogin):
        """Authenticate user and return access and refresh tokens."""
        user = authenticate_user(credentials.username, credentials.password)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        access_token = create_access_token(data={"sub": user.username, "role": user.role.value})
        refresh_token = create_refresh_token(data={"sub": user.username, "role": user.role.value})
        
        return Token(access_token=access_token, refresh_token=refresh_token)

    @app.post("/auth/register", response_model=User)
    def register(user_data: UserCreate, current_user: User = Depends(require_admin)):
        """Register a new user (admin only)."""
        return create_user(user_data)

    @app.get("/auth/me", response_model=User)
    def get_me(current_user: User = Depends(get_current_active_user)):
        """Get current user information."""
        return current_user

    @app.get("/auth/status")
    def auth_status():
        """Check if authentication is enabled."""
        return {"enabled": True, "message": "Authentication is enabled"}
else:
    @app.get("/auth/status")
    def auth_status():
        """Check if authentication is disabled."""
        return {"enabled": False, "message": "Authentication is disabled"}

@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Health",
    description="Basic service health check with a UTC timestamp.",
)
def health():
    return {"ok": True, "time": now_iso()}

# ----------------------------
# Telemetry Endpoint
# ----------------------------
class TelemetryEventModel(BaseModel):
    timestamp: str
    eventType: str
    source: str
    metadata: Dict[str, Any]
    schema_version: str = "1.0"

class TelemetryBatchRequest(BaseModel):
    events: List[TelemetryEventModel]

@app.post("/api/telemetry")
def receive_telemetry(batch: TelemetryBatchRequest):
    """
    Receive telemetry events from dashboard and other clients.
    Writes events to JSONL file in artifacts/telemetry directory.
    
    Note: In high-concurrency scenarios, consider using a message queue
    or database for better reliability.
    """
    try:
        # Ensure telemetry directory exists
        telemetry_dir = ROOT_DIR / "artifacts" / "telemetry"
        telemetry_dir.mkdir(parents=True, exist_ok=True)
        
        # Get today's telemetry file
        date_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
        telemetry_file = telemetry_dir / f"telemetry_{date_str}.jsonl"
        
        # Write events as JSONL with atomic-like operation
        # Serialize all events first
        json_lines = []
        for event in batch.events:
            event_dict = event.model_dump()
            json_lines.append(json.dumps(event_dict) + "\n")
        
        # Write all lines in one operation to minimize race window
        with open(telemetry_file, "a", encoding="utf-8") as f:
            f.writelines(json_lines)
        
        return {
            "ok": True,
            "events_received": len(batch.events),
            "file": str(telemetry_file.name)
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to write telemetry: {str(e)}"
        )

@app.get("/api/telemetry/stats")
def get_telemetry_stats(days: int = Query(7, ge=1, le=90)):
    """
    Get telemetry statistics for the specified number of days.
    Returns aggregated metrics from cost, quality, and run data.
    
    Compatible with migrations 4-6 (cost metrics, run aggregates, quality tracking).
    Returns sane defaults when no data exists.
    """
    try:
        # Calculate date range
        end_date = datetime.datetime.now(datetime.timezone.utc)
        start_date = end_date - datetime.timedelta(days=days)
        
        # Initialize response with safe defaults
        stats = {
            "total_events": 0,
            "period_days": days,
            "start_date": start_date.isoformat().replace("+00:00", "Z"),
            "end_date": end_date.isoformat().replace("+00:00", "Z"),
            "by_event_type": {},
            "by_source": {},
            "by_day": {}
        }
        
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Check if new tables exist (from migrations 4-6)
            cursor.execute("""
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name IN (
                    'orchestration_cost_metrics',
                    'orchestration_run_aggregates', 
                    'run_quality_metrics'
                )
            """)
            available_tables = {row[0] for row in cursor.fetchall()}
            
            # Query run aggregates if table exists (migration 5)
            if 'orchestration_run_aggregates' in available_tables:
                try:
                    cursor.execute("""
                        SELECT 
                            COUNT(*) as run_count,
                            SUM(total_cost_usd) as total_cost,
                            SUM(total_tokens_input + total_tokens_output) as total_tokens,
                            COUNT(DISTINCT run_id) as unique_runs
                        FROM orchestration_run_aggregates
                        WHERE datetime(created_at) >= datetime(?)
                          AND datetime(created_at) <= datetime(?)
                    """, (start_date.isoformat(), end_date.isoformat()))
                    
                    row = cursor.fetchone()
                    if row and row['run_count'] > 0:
                        stats['total_events'] = row['run_count'] or 0
                        stats['by_event_type']['OrchestrationRun.Completed'] = row['run_count'] or 0
                        
                        # Add cost summary to metadata (not breaking schema)
                        if row['total_cost'] is not None:
                            stats['by_event_type']['OrchestrationRun.TotalCost'] = float(row['total_cost'])
                
                except sqlite3.OperationalError as e:
                    logger.warning(f"Failed to query run_aggregates: {e}")
            
            # Query quality metrics if table exists (migration 6)
            if 'run_quality_metrics' in available_tables:
                try:
                    cursor.execute("""
                        SELECT 
                            COUNT(*) as total_runs,
                            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_runs,
                            AVG(quality_score) as avg_quality
                        FROM run_quality_metrics
                        WHERE datetime(created_at) >= datetime(?)
                          AND datetime(created_at) <= datetime(?)
                    """, (start_date.isoformat(), end_date.isoformat()))
                    
                    row = cursor.fetchone()
                    if row and row['total_runs'] > 0:
                        stats['by_event_type']['QualityMetrics.Total'] = row['total_runs'] or 0
                        stats['by_event_type']['QualityMetrics.Successful'] = row['successful_runs'] or 0
                        
                        failed_runs = (row['total_runs'] or 0) - (row['successful_runs'] or 0)
                        if failed_runs > 0:
                            stats['by_event_type']['QualityMetrics.Failed'] = failed_runs
                
                except sqlite3.OperationalError as e:
                    logger.warning(f"Failed to query quality_metrics: {e}")
            
            # Query cost metrics for daily breakdown if table exists (migration 4)
            if 'orchestration_cost_metrics' in available_tables:
                try:
                    cursor.execute("""
                        SELECT 
                            DATE(timestamp) as day,
                            COUNT(*) as call_count,
                            SUM(cost_usd) as daily_cost
                        FROM orchestration_cost_metrics
                        WHERE datetime(timestamp) >= datetime(?)
                          AND datetime(timestamp) <= datetime(?)
                        GROUP BY DATE(timestamp)
                        ORDER BY day ASC
                    """, (start_date.isoformat(), end_date.isoformat()))
                    
                    for row in cursor.fetchall():
                        day = row['day']
                        count = row['call_count'] or 0
                        if day:
                            stats['by_day'][day] = count
                            stats['total_events'] += count
                
                except sqlite3.OperationalError as e:
                    logger.warning(f"Failed to query cost_metrics: {e}")
            
            # Fallback: Try reading JSONL telemetry files if no database data
            if stats['total_events'] == 0:
                try:
                    telemetry_dir = ROOT_DIR / "artifacts" / "telemetry"
                    if telemetry_dir.exists():
                        # Read JSONL files for the date range
                        for jsonl_file in telemetry_dir.glob("telemetry_*.jsonl"):
                            try:
                                with open(jsonl_file, 'r', encoding='utf-8') as f:
                                    for line in f:
                                        if not line.strip():
                                            continue
                                        try:
                                            event = json.loads(line)
                                            event_time = datetime.datetime.fromisoformat(
                                                event.get('timestamp', '').replace('Z', '+00:00')
                                            )
                                            
                                            if start_date <= event_time <= end_date:
                                                stats['total_events'] += 1
                                                
                                                # Count by event type
                                                event_type = event.get('eventType', 'Unknown')
                                                stats['by_event_type'][event_type] = \
                                                    stats['by_event_type'].get(event_type, 0) + 1
                                                
                                                # Count by source
                                                source = event.get('source', 'Unknown')
                                                stats['by_source'][source] = \
                                                    stats['by_source'].get(source, 0) + 1
                                                
                                                # Count by day
                                                day = event_time.strftime('%Y-%m-%d')
                                                stats['by_day'][day] = stats['by_day'].get(day, 0) + 1
                                        
                                        except (json.JSONDecodeError, ValueError, KeyError) as e:
                                            # Skip malformed events
                                            logger.debug(f"Skipping malformed event: {e}")
                                            continue
                            
                            except Exception as e:
                                logger.warning(f"Failed to read telemetry file {jsonl_file}: {e}")
                                continue
                
                except Exception as e:
                    logger.warning(f"Failed to read JSONL telemetry files: {e}")
        
        # Ensure all values are JSON-safe (no None, Decimal, etc.)
        stats['total_events'] = int(stats['total_events'] or 0)
        
        return stats
        
    except Exception as e:
        # Log the error for debugging
        logger.error(f"Telemetry stats endpoint error: {e}", exc_info=True)
        
        # Return safe fallback response instead of raising
        return {
            "total_events": 0,
            "period_days": days,
            "start_date": (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)).isoformat().replace("+00:00", "Z"),
            "end_date": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
            "by_event_type": {},
            "by_source": {},
            "by_day": {}
        }

@app.get(
    "/prompts",
    response_model=PromptListResponse,
    summary="List canonical prompts",
    description=(
        "Return canonical prompt payloads from the prompt registry, merged with any synced local overrides. "
        "These prompt resources are the primary UI-facing contract for render, review, and refinement workflows."
    ),
)
def list_prompt_payloads():
    """
    Return the union of canonical registry prompts and any synced overrides.

    Synced payloads (from the React editor) override registry entries with the
    same id and introduce additional drafts for local development.
    """
    registry_payloads = load_registry_payloads()
    synced_payloads = load_synced_payloads()

    if not registry_payloads:
        return synced_payloads
    if not synced_payloads:
        return registry_payloads

    overrides = {payload.get("id"): payload for payload in synced_payloads if payload.get("id")}
    merged: List[Dict[str, Any]] = []

    for payload in registry_payloads:
        prompt_id = payload.get("id")
        if prompt_id and prompt_id in overrides:
            merged.append(overrides.pop(prompt_id))
        else:
            merged.append(payload)

    # Append new prompts that exist only in the synced cache
    merged.extend(overrides.values())
    return merged


@app.get("/prompts/search", response_model=SearchPromptsResponse)
def search_prompts(
    q: Optional[str] = Query(None, description="Full-text search query"),
    category: Optional[str] = Query(None, description="Filter by category"),
    owner: Optional[str] = Query(None, description="Filter by owner"),
    tags: Optional[str] = Query(None, description="Comma-separated tags to filter"),
    limit: int = Query(10, ge=1, le=100, description="Number of results to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination")
):
    """
    Search prompts using SQLite FTS5 when available; fallback to in-memory template search.
    """
    prompts_db = ROOT_DIR / "data" / "prompts.db"

    # FTS / DB-backed search
    if prompts_db.exists():
        try:
            with sqlite3.connect(prompts_db) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                where_clauses = []
                params = {}

                if q:
                    # Prefer FTS if available
                    try:
                        fts_query = """
                            SELECT p.id, p.title, p.version, p.category, p.owner, p.tags, 
                                   p.description, p.updated_utc, rank AS relevance
                            FROM prompts p
                            JOIN prompts_fts fts ON p.rowid = fts.rowid
                            WHERE prompts_fts MATCH :query
                        """
                        params[":query"] = q

                        if category:
                            where_clauses.append("p.category = :category")
                            params[":category"] = category
                        if owner:
                            where_clauses.append("p.owner = :owner")
                            params[":owner"] = owner
                        if tags:
                            tag_list = [t.strip() for t in tags.split(",")]
                            tag_conditions = [f"p.tags LIKE :tag{i}" for i in range(len(tag_list))]
                            where_clauses.append(f"({' OR '.join(tag_conditions)})")
                            for i, tag in enumerate(tag_list):
                                params[f":tag{i}"] = f"%{tag}%"

                        if where_clauses:
                            fts_query += " AND " + " AND ".join(where_clauses)
                        fts_query += " ORDER BY rank LIMIT :limit OFFSET :offset"
                        params[":limit"] = limit
                        params[":offset"] = offset
                        cursor.execute(fts_query, params)
                    except sqlite3.OperationalError:
                        # FTS missing -> fallback to LIKE
                        fallback = """
                            SELECT id, title, version, category, owner, tags, description, updated_utc
                            FROM prompts
                            WHERE (title LIKE :query OR description LIKE :query OR tags LIKE :query)
                        """
                        params[":query"] = f"%{q}%"
                        if category:
                            fallback += " AND category = :category"
                            params[":category"] = category
                        if owner:
                            fallback += " AND owner = :owner"
                            params[":owner"] = owner
                        if tags:
                            tag_list = [t.strip() for t in tags.split(",")]
                            tag_conditions = [f"tags LIKE :tag{i}" for i in range(len(tag_list))]
                            fallback += f" AND ({' OR '.join(tag_conditions)})"
                            for i, tag in enumerate(tag_list):
                                params[f":tag{i}"] = f"%{tag}%"
                        fallback += " ORDER BY updated_utc DESC LIMIT :limit OFFSET :offset"
                        params[":limit"] = limit
                        params[":offset"] = offset
                        cursor.execute(fallback, params)
                else:
                    filter_query = """
                        SELECT id, title, version, category, owner, tags, description, updated_utc
                        FROM prompts
                    """
                    if category:
                        where_clauses.append("category = :category")
                        params[":category"] = category
                    if owner:
                        where_clauses.append("owner = :owner")
                        params[":owner"] = owner
                    if tags:
                        tag_list = [t.strip() for t in tags.split(",")]
                        tag_conditions = [f"tags LIKE :tag{i}" for i in range(len(tag_list))]
                        where_clauses.append(f"({' OR '.join(tag_conditions)})")
                        for i, tag in enumerate(tag_list):
                            params[f":tag{i}"] = f"%{tag}%"
                    if where_clauses:
                        filter_query += " WHERE " + " AND ".join(where_clauses)
                    filter_query += " ORDER BY updated_utc DESC LIMIT :limit OFFSET :offset"
                    params[":limit"] = limit
                    params[":offset"] = offset
                    cursor.execute(filter_query, params)

                rows = cursor.fetchall()
                results: List[PromptSearchResult] = []
                for row in rows:
                    tags_list: List[str] = []
                    if row["tags"]:
                        try:
                            tags_list = json.loads(row["tags"])
                        except (json.JSONDecodeError, TypeError) as e:
                            # If tags are malformed, use empty list - non-critical for search results
                            logger.debug(f"Failed to parse tags for prompt {row.get('id', 'unknown')}: {e}")
                    results.append(
                        PromptSearchResult(
                            id=row["id"],
                            title=row["title"],
                            version=row["version"],
                            category=row["category"] or None,
                            owner=row["owner"] or None,
                            tags=tags_list if isinstance(tags_list, list) else [],
                            description=row["description"] or None,
                            updated=row["updated_utc"],
                            relevance=row["relevance"] if "relevance" in row.keys() else None,
                        )
                    )
                return SearchPromptsResponse(
                    results=results,
                    total=len(results),
                    query=q,
                    filters={
                        "category": category,
                        "owner": owner,
                        "tags": tags.split(",") if tags else []
                    }
                )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Search error: {str(e)}")

    # Fallback: search loaded templates in-memory (registry + synced)
    templates = read_templates()
    q_lower = (q or "").strip().lower()
    results = []
    for tpl_id, payload in templates.items():
        title = payload.get("title", "") or tpl_id
        cat_val = payload.get("category", "") or ""
        desc = payload.get("description", "") or ""
        ctx = payload.get("context", "") or ""
        tag_list = payload.get("telemetry", {}).get("tags", []) if isinstance(payload.get("telemetry"), dict) else payload.get("tags", [])
        haystacks = [tpl_id, title, cat_val, desc, ctx, " ".join(tag_list) if tag_list else ""]
        if q_lower and not any(q_lower in (h or "").lower() for h in haystacks):
            continue
        if category and cat_val != category:
            continue
        results.append(
            PromptSearchResult(
                id=tpl_id,
                title=title,
                version=payload.get("version") or "",
                category=cat_val or None,
                owner=None,
                tags=tag_list if isinstance(tag_list, list) else [],
                description=desc or None,
                updated=payload.get("updatedAt") or payload.get("createdAt") or now_iso(),
                relevance=None,
            )
        )
    # naive relevance: sort by updated desc
    results = sorted(results, key=lambda r: r.updated or "", reverse=True)
    paged = results[offset: offset + limit]
    return SearchPromptsResponse(
        results=paged,
        total=len(results),
        query=q,
        filters={
            "category": category,
            "owner": owner,
            "tags": tags.split(",") if tags else []
        }
    )


@app.get(
    "/prompts/{prompt_id}",
    response_model=PromptPayload,
    summary="Get canonical prompt",
    description="Return a single canonical prompt payload from `/prompts` by id.",
)
def get_prompt(prompt_id: str):
    spec = _get_prompt_or_404(prompt_id, allow_synced=True)
    return spec.to_ui_payload()

@app.post("/prompts/render", response_model=RenderResponse)
def render_prompt(req: RenderRequest):
    try:
        spec = _get_prompt_or_404(req.prompt_id, allow_synced=True)
        rendered = render_blocks(spec, req.variables)
        METRICS["renders_total"] += 1
        return RenderResponse(prompt=spec.to_ui_payload(), rendered_blocks=rendered)
    except HTTPException:
        METRICS["render_errors"] += 1
        raise

@app.post("/refiner/run", response_model=RefinerRunResponse)
def queue_refiner(req: RefinerRunRequest):
    try:
        spec = _get_prompt_or_404(req.prompt_id)
        review_policy = (spec.raw.get("integrations") or {}).get("orchestration", {}).get("review_policy", "manual")
        manifest = _write_manifest(spec, review_policy)
        if req.invoke_refiner:
            _invoke_power_shell_refiner(spec, manifest, req.dry_run)
        METRICS["refiner_runs"] += 1
        return RefinerRunResponse(
            prompt_id=spec.id,
            manifest=str(manifest),
            refiner_invoked=req.invoke_refiner,
            dry_run=req.dry_run,
            reviewers=req.reviewers,
            notes=req.notes,
        )
    except HTTPException:
        METRICS["refiner_errors"] += 1
        raise


@app.post("/prompts/{prompt_id}/refine")
def refine_single_prompt(prompt_id: str):
    """Refine a single prompt using AIRefiner"""
    try:
        req = RefinerRunRequest(prompt_id=prompt_id, invoke_refiner=True, dry_run=False)
        result = queue_refiner(req)
        return {"status": "success", "prompt_id": prompt_id, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/prompts/refine-bulk")
def refine_bulk_prompts(request: Dict[str, Any]):
    """Refine multiple prompts using AIRefiner"""
    prompt_ids = request.get("prompt_ids", [])
    if not prompt_ids:
        raise HTTPException(status_code=400, detail="No prompt_ids provided")
    
    results = []
    for prompt_id in prompt_ids:
        try:
            req = RefinerRunRequest(prompt_id=prompt_id, invoke_refiner=True, dry_run=False)
            result = queue_refiner(req)
            results.append({"prompt_id": prompt_id, "status": "success", "result": result})
        except Exception as e:
            results.append({"prompt_id": prompt_id, "status": "error", "error": str(e)})
    
    return {"status": "completed", "results": results}


@app.get("/prompts/{prompt_id}/reviews")
def get_prompt_reviews(prompt_id: str):
    """Get review history for a prompt"""
    spec = _get_prompt_or_404(prompt_id)
    reviews = (spec.raw.get("integrations") or {}).get("orchestration", {}).get("reviews", [])
    return {"prompt_id": spec.id, "reviews": reviews}


@app.post("/prompts/{prompt_id}/reviews")
def record_prompt_review(prompt_id: str, req: ReviewRecordRequest):
    spec = _get_prompt_or_404(prompt_id)
    entry = {
        "timestamp": req.timestamp or now_iso(),
        "status": req.status,
        "reviewers": req.reviewers,
        "notes": req.notes,
        "manifest": req.manifest,
        "runbook": req.runbook,
    }
    entry = {k: v for k, v in entry.items() if v is not None}
    _append_review_run(spec, entry)
    METRICS["review_records"] += 1
    return {"prompt_id": spec.id, "run": entry}

@app.get(
    "/metrics",
    response_model=MetricsResponse,
    summary="Metrics",
    description="Return in-process counters for prompt rendering, refiner runs, review writes, and current queue depth.",
)
def metrics():
    return {
        **METRICS,
        "refiner_queue_depth": _refiner_queue_depth(),
    }

@app.post(
    "/prompts:sync",
    response_model=PromptSyncResponse,
    summary="Sync prompt payloads",
    description="Persist locally edited prompt payloads to the sync cache used for offline development overrides.",
)
def sync_prompt_payloads(
    request: PromptSyncRequest,
    admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    _require_admin_access(admin_token)
    _validate_prompt_sync_payload(request.prompts)
    save_synced_payloads(request.prompts)
    return {"status": "ok", "count": len(request.prompts)}


@app.get("/agents")
def list_agents():
    return load_synced_agents()


@app.post("/agents:sync")
def sync_agents(
    request: AgentSyncRequest,
    admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    _require_admin_access(admin_token)
    _validate_agent_payload(request.agents)
    save_synced_agents(request.agents)
    return {"status": "ok", "count": len(request.agents)}


@app.post("/orchestrator/tasks")
def ingest_orchestrator_task(task: OrchestratorTask):
    payload = {
        "id": task.supervisor.get("id") or f"task-{datetime.datetime.now(datetime.timezone.utc).timestamp()}",
        "supervisor": task.supervisor,
        "agents": task.agents,
        "prompts": task.prompts,
        "received_at": now_iso(),
        "status": task.supervisor.get("status") or "queued",
    }
    append_task_queue(payload)
    return {"status": "queued", "task_id": payload["id"]}


@app.get("/orchestrator/tasks")
def list_orchestrator_tasks():
    return load_task_queue()


class OrchestratorTaskUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None


@app.patch("/orchestrator/tasks/{task_id}")
def update_orchestrator_task(task_id: str, update: OrchestratorTaskUpdate):
    updates: Dict[str, Any] = {}
    if update.status:
        updates["status"] = update.status
    if update.notes is not None:
        updates["notes"] = update.notes
    updates["updated_at"] = now_iso()
    task = update_task_queue(task_id, updates)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"status": "updated", "task": task}
@app.get(
    "/api/templates",
    response_model=TemplateListResponse,
    summary="List legacy templates",
    description=(
        "Return the ids of legacy YAML templates used by the generate runtime. "
        "Generation endpoints prefer canonical `/prompts` ids when available and fall back to these template files."
    ),
)
def list_templates():
    return {"templates": list(read_templates().keys())}

@app.get(
    "/api/audit",
    response_model=AuditListResponse,
    summary="List audit records",
    description="Return recent generation audit records. Each item can be matched from `GenerateResponse.audit_id`.",
)
def list_audit(limit: int = Query(50, ge=1, le=500, description="Maximum number of recent audit entries to return.")):
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("SELECT id, template_id, model, created_at, status, cached FROM audit ORDER BY id DESC LIMIT ?", (limit,))
        rows = c.fetchall()
    items = [{"id": r[0], "template_id": r[1], "model": r[2], "created_at": r[3], "status": r[4], "cached": bool(r[5])} for r in rows]
    return {"items": items}
@app.get("/", include_in_schema=False)
def root():
    """Landing page with quick links."""
    html = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>AI Prompt Workbench</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 2em; }
            h1 { color: #2c3e50; }
            ul { line-height: 1.6; }
            a { color: #2980b9; text-decoration: none; }
            a:hover { text-decoration: underline; }
        </style>
    </head>
    <body>
        <h1>AI Prompt Workbench</h1>
        <p>Welcome! Quick links:</p>
        <ul>
            <li><a href="/health">Health Check</a></li>
            <li><a href="/api/templates">Templates API</a></li>
            <li><a href="/api/audit">Audit API</a></li>
            <li><a href="/docs">Swagger UI (Interactive Docs)</a></li>
            <li><a href="/redoc">ReDoc API Docs</a></li>
        </ul>
    </body>
    </html>
    """
    return HTMLResponse(content=html, status_code=200)
from fastapi import Body

def _write_yaml(path: pathlib.Path, data: dict):
    path.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")

@app.post(
    "/api/templates/install-defaults",
    response_model=InstallDefaultTemplatesResponse,
    summary="Install default templates",
    description="Create example legacy YAML templates under the local templates directory.",
)
def install_default_templates(overwrite: bool = False):
    """Create a couple of example templates under ./templates."""
    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)

    examples = [
        {
            "file": TEMPLATE_DIR / "agent_webrtc_disconnect_v1.0.0.yaml",
            "data": {
                "id": "agent_webrtc_disconnect_v1.0.0",
                "system": (
                    "You are {role}. Be concise, actionable, and accurate for Genesys Cloud ops. "
                    "Assume logs may be partial; ask for missing signals only if critical."
                ),
                "few_shot": [
                    {
                        "input": "Task: Diagnose WebRTC disconnect spike around 14:00Z; InputData: {\"log_snippet\":\"ICE failures; TURN timeouts\"}",
                        "output": json.dumps({
                            "executive_summary": [
                                "Spike at 14:00Z linked to ICE/TURN failures",
                                "Likely regional egress network degradation",
                                "Impact contained to ~12% WebRTC sessions"
                            ],
                            "technical_json": {
                                "probable_cause": "ISP packet loss impacting STUN/TURN; elevated RTT",
                                "recommended_action": "Validate TURN reachability; compare MOS pre/post; apply QoS rules; notify NOC"
                            },
                            "chart_recommendations": [
                                {"type":"line","metric":"webrtc_disconnects","granularity":"5m"},
                                {"type":"heatmap","metric":"mos_agent_leg<=3.5","granularity":"hour"}
                            ]
                        })
                    }
                ]
            }
        },
        {
            "file": TEMPLATE_DIR / "volume_anomaly_summary_v1.0.0.yaml",
            "data": {
                "id": "volume_anomaly_summary_v1.0.0",
                "system": (
                    "You are {role}. Produce crisp incident-ready summaries for contact volume anomalies. "
                    "Prefer bullet points and concrete next steps."
                ),
                "few_shot": [
                    {
                        "input": "Task: Summarize inbound spike vs forecast; InputData: {\"timestamp\":\"2025-08-18T12:00:00Z\"}",
                        "output": json.dumps({
                            "executive_summary": [
                                "Inbound volume +28% vs forecast (10:00–12:00 local)",
                                "AHT flat; SLA dipped 5 pts; staffing shortfall main driver"
                            ],
                            "technical_json": {
                                "probable_cause": "Marketing push not reflected in forecast + partial IVR outage",
                                "recommended_action": "Engage WFM for surge staffing; update forecast; validate IVR path latency"
                            },
                            "chart_recommendations": [
                                {"type":"line","metric":"inbound_offered_vs_forecast","granularity":"15m"},
                                {"type":"bar","metric":"abandon_rate_by_queue","granularity":"hour"}
                            ]
                        })
                    }
                ]
            }
        }
    ]

    created, skipped = [], []
    for ex in examples:
        p = ex["file"]
        if p.exists() and not overwrite:
            skipped.append(p.name)
            continue
        _write_yaml(p, ex["data"])
        created.append(p.name)

    return {"created": created, "skipped": skipped, "dir": str(TEMPLATE_DIR)}
@app.post(
    "/api/templates/reload",
    response_model=ReloadTemplatesResponse,
    summary="Reload templates",
    description="Force a re-read of legacy template files from disk.",
)
def reload_templates():
    """Force re-read of template files (stateless, but useful for debugging)."""
    t = read_templates()
    return {"count": len(t), "ids": list(t.keys())}

@app.get(
    "/api/templates/{template_id}",
    response_model=TemplateDocument,
    summary="Get legacy template",
    description=(
        "Return the parsed YAML/JSON for a single legacy template resource. "
        "Use `/prompts/{prompt_id}` for canonical prompt payloads used by the editor and render flows."
    ),
)
def get_template(
    template_id: str = Path(
        ...,
        description="Legacy template id (matches the YAML `id` field used by `/api/templates`).",
    )
):
    t = read_templates()
    if template_id not in t:
        raise HTTPException(status_code=404, detail=f"Template not found: {template_id}")
    return t[template_id]


@app.post(
    "/api/generate/dry-run",
    response_model=DryRunResponse,
    summary="Generate dry run",
    description=(
        "Build the final chat messages without calling OpenAI. "
        "This resolves `template_id` against canonical `/prompts` first, then legacy `/api/templates` if needed."
    ),
)
def generate_dry_run(req: RequestPayload):
    tpl, _ = _resolve_template_payload(req.template_id)
    messages = build_messages(tpl, req)
    return {"model": req.model or DEFAULT_MODEL, "messages": messages}
@app.get("/audit", include_in_schema=False)
def audit_htm(limit: int = Query(100, ge=1, le=500)):
    # Simple, zero-dependency HTML to eyeball recent runs
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("""
        SELECT id, created_at, template_id, model, status, cached, 
               IFNULL(token_prompt,0), IFNULL(token_completion,0)
        FROM audit ORDER BY id DESC LIMIT ?
        """, (limit,))
        rows = c.fetchall()

    rows_html = "\n".join(
        f"<tr><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td>"
        f"<td>{r[4]}</td><td>{'yes' if r[5] else 'no'}</td><td>{r[6]}</td><td>{r[7]}</td></tr>"
        for r in rows
    )
    html = f"""
    <html><head><title>Audit - AI Prompt Workbench</title>
    <style>
    body {{ font-family: Arial, sans-serif; margin: 1.5rem; }}
    table {{ border-collapse: collapse; width: 100%; }}
    th, td {{ border: 1px solid #ddd; padding: .5rem; }}
    th {{ background: #f7f7f7; text-align: left; }}
    </style></head>
    <body>
      <h1>Audit (latest {limit})</h1>
      <p><a href="/docs">/docs</a> · <a href="/api/templates">/api/templates</a> · <a href="/health">/health</a></p>
      <table>
        <thead><tr><th>Id</th><th>Time</th><th>Template</th><th>Model</th><th>Status</th><th>Cached</th><th>PromptTok</th><th>CompTok</th></tr></thead>
        <tbody>{rows_html}</tbody>
      </table>
    </body></html>
    """
    return HTMLResponse(html)

@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    """Return empty response to silence browser favicon requests."""
    return Response(status_code=204, media_type="image/x-icon")

@app.post(
    "/api/generate",
    response_model=GenerateResponse,
    summary="Generate",
    description=(
        "Execute prompt generation against OpenAI. "
        "The supplied `template_id` first resolves against canonical `/prompts` ids and falls back to legacy `/api/templates`."
    ),
)
def generate(req: RequestPayload):
    tpl, _ = _resolve_template_payload(req.template_id)

    model = req.model or DEFAULT_MODEL
    payload_for_hash = {
        "template_id": req.template_id,
        "role": req.role,
        "task": req.task,
        "context": req.context,
        "input_data": req.input_data.model_dump(),
        "desired_output": req.desired_output,
        "modes": req.modes,
        "model": model,
        "tpl_version": tpl.get("version") or tpl.get("id", "")
    }
    cache_key = hash_payload(req.template_id, model, payload_for_hash)

    # Try cache first
    cached_output = cache_get(cache_key)
    input_json = normalize(payload_for_hash)

    if cached_output:
        audit_id = audit_log(
            req.template_id, model, input_json, cached_output, True, "ok", None, None,
            run_id=None, agent_name=None
        )
        return GenerateResponse(
            cached=True,
            cache_key=cache_key,
            template_id=req.template_id,
            model=model,
            output=cached_output,
            audit_id=audit_id
        )

    # Build messages & call provider
    messages = build_messages(tpl, req)
    try:
        output, usage = call_provider_chat(model, messages)
        # Cache + audit
        cache_put(cache_key, req.template_id, model, input_json, output)
        audit_id = audit_log(
            req.template_id, model, input_json, output, False, "ok",
            usage.get("prompt_tokens"), usage.get("completion_tokens"),
            run_id=None, agent_name=None
        )
        return GenerateResponse(
            cached=False,
            cache_key=cache_key,
            template_id=req.template_id,
            model=model,
            output=output,
            audit_id=audit_id
        )
    except HTTPException as e:
        audit_id = audit_log(
            req.template_id, model, input_json, None, False, f"error:{e.detail}", None, None,
            run_id=None, agent_name=None
        )
        raise e


# ----------------------------
# Cost Tracking Endpoints
# ----------------------------
from cost_tracker import CostTracker

cost_tracker = CostTracker(DB_PATH)


class CostSummaryResponse(BaseModel):
    """Response model for cost summaries."""
    total_cost: float
    period_days: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    provider: Optional[str] = None


class CostBreakdownResponse(BaseModel):
    """Response model for cost breakdowns."""
    by_provider: List[Dict[str, Any]]
    by_model: List[Dict[str, Any]]
    daily: List[Dict[str, Any]]


class BudgetStatusResponse(BaseModel):
    """Response model for budget status."""
    budget_amount: float
    period_days: int
    current_cost: float
    remaining: float
    percentage_used: float
    status: str
    provider: Optional[str] = None


@app.get("/admin/costs/summary", response_model=CostSummaryResponse)
def get_cost_summary(
    start_date: Optional[str] = Query(None, description="Start date (ISO format)"),
    end_date: Optional[str] = Query(None, description="End date (ISO format)"),
    provider: Optional[str] = Query(None, description="Filter by provider"),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    admin_token: Optional[str] = Header(None, alias="X-Admin-Token")
):
    """Get total cost summary for a time period."""
    _require_admin_access(admin_token)
    
    total_cost = cost_tracker.get_total_cost(
        start_date=start_date,
        end_date=end_date,
        provider=provider,
        user_id=user_id
    )
    
    return CostSummaryResponse(
        total_cost=total_cost,
        start_date=start_date,
        end_date=end_date,
        provider=provider
    )


@app.get("/admin/costs/breakdown", response_model=CostBreakdownResponse)
def get_cost_breakdown(
    start_date: Optional[str] = Query(None, description="Start date (ISO format)"),
    end_date: Optional[str] = Query(None, description="End date (ISO format)"),
    provider: Optional[str] = Query(None, description="Filter by provider"),
    days: int = Query(30, description="Number of days for daily breakdown"),
    admin_token: Optional[str] = Header(None, alias="X-Admin-Token")
):
    """Get detailed cost breakdown by provider, model, and day."""
    _require_admin_access(admin_token)
    
    by_provider = cost_tracker.get_cost_by_provider(
        start_date=start_date,
        end_date=end_date
    )
    
    by_model = cost_tracker.get_cost_by_model(
        start_date=start_date,
        end_date=end_date,
        provider=provider
    )
    
    daily = cost_tracker.get_daily_costs(
        days=days,
        provider=provider
    )
    
    return CostBreakdownResponse(
        by_provider=by_provider,
        by_model=by_model,
        daily=daily
    )


@app.get("/admin/costs/budget", response_model=BudgetStatusResponse)
def check_budget_status(
    budget_amount: float = Query(..., description="Budget amount in USD"),
    period_days: int = Query(30, description="Budget period in days"),
    provider: Optional[str] = Query(None, description="Filter by provider"),
    admin_token: Optional[str] = Header(None, alias="X-Admin-Token")
):
    """Check if costs are within budget."""
    _require_admin_access(admin_token)
    
    budget_status = cost_tracker.check_budget(
        budget_amount=budget_amount,
        period_days=period_days,
        provider=provider
    )
    
    return BudgetStatusResponse(**budget_status)


@app.get("/admin/costs/by-run")
def get_costs_by_run(
    run_id: Optional[str] = Query(None, description="Filter by specific run ID"),
    start_date: Optional[str] = Query(None, description="Start date (ISO 8601)"),
    end_date: Optional[str] = Query(None, description="End date (ISO 8601)"),
    admin_token: Optional[str] = Header(None, alias="X-Admin-Token")
):
    """
    Get cost breakdown by orchestration run.
    Shows token usage and costs attributed to each run.
    """
    _require_admin_access(admin_token)
    
    return cost_tracker.get_cost_by_run(
        run_id=run_id,
        start_date=start_date,
        end_date=end_date
    )


# ----------------------------
# Environmental Impact Metrics Endpoints
# ----------------------------
from routes_cost_metrics import (
    get_metrics_summary, get_runs_metrics, get_models_metrics, get_prometheus_metrics,
    MetricsSummaryResponse, RunMetricsResponse, ModelMetricsResponse
)


@app.get("/metrics/cost/summary", response_model=MetricsSummaryResponse)
def metrics_cost_summary(
    start_date: Optional[str] = Query(None, description="Start date (ISO 8601)"),
    end_date: Optional[str] = Query(None, description="End date (ISO 8601)"),
    project: Optional[str] = Query(None, description="Filter by project name"),
    app: Optional[str] = Query(None, description="Filter by app name"),
    admin_token: Optional[str] = Header(None, alias="X-Admin-Token")
):
    """
    Get comprehensive summary of cost and environmental impact metrics.
    
    Returns:
    - Total cost, energy (kWh), and water usage (liters)
    - Top models and agents by cost
    - Daily timeseries data
    """
    _require_admin_access(admin_token)
    return get_metrics_summary(
        db_path=DB_PATH,
        start_date=start_date,
        end_date=end_date,
        project=project,
        app=app,
        admin_token=admin_token,
        settings=settings
    )


@app.get("/metrics/cost/runs", response_model=RunMetricsResponse)
def metrics_cost_runs(
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    model: Optional[str] = Query(None, description="Filter by model"),
    agent: Optional[str] = Query(None, description="Filter by agent"),
    app: Optional[str] = Query(None, description="Filter by app"),
    start_date: Optional[str] = Query(None, description="Start date (ISO 8601)"),
    end_date: Optional[str] = Query(None, description="End date (ISO 8601)"),
    admin_token: Optional[str] = Header(None, alias="X-Admin-Token")
):
    """
    Get paginated list of orchestration runs with cost and environmental metrics.
    
    Supports filtering by:
    - Model name
    - Agent name
    - App name
    - Date range
    """
    _require_admin_access(admin_token)
    return get_runs_metrics(
        db_path=DB_PATH,
        page=page,
        per_page=per_page,
        model=model,
        agent=agent,
        app=app,
        start_date=start_date,
        end_date=end_date,
        admin_token=admin_token,
        settings=settings
    )


@app.get("/metrics/cost/models", response_model=ModelMetricsResponse)
def metrics_cost_models(
    start_date: Optional[str] = Query(None, description="Start date (ISO 8601)"),
    end_date: Optional[str] = Query(None, description="End date (ISO 8601)"),
    admin_token: Optional[str] = Header(None, alias="X-Admin-Token")
):
    """
    Get aggregated cost and environmental metrics by model.
    
    Returns per-model aggregates including:
    - Total tokens, cost, energy, and water
    - Average cost per call
    - Number of calls and runs
    """
    _require_admin_access(admin_token)
    return get_models_metrics(
        db_path=DB_PATH,
        start_date=start_date,
        end_date=end_date,
        admin_token=admin_token,
        settings=settings
    )


# Quality Metrics Endpoints
from routes_quality_metrics import (
    record_quality_rating, record_automated_test, get_run_quality,
    get_quality_summary as get_quality_summary_route, get_cost_quality_efficiency as get_efficiency_route,
    get_runs_with_quality,
    QualityRatingRequest, AutomatedTestRequest, QualityMetricsResponse,
    QualitySummaryResponse, CostQualityEfficiencyResponse
)


@app.post("/metrics/quality/runs/{run_id}/rating")
def quality_rating(
    run_id: str,
    rating: QualityRatingRequest,
    admin_token: Optional[str] = Header(None, alias="X-Admin-Token")
):
    """
    Submit a human quality rating for a run.
    
    Records success status, quality score, notes, and whether manual fixes were needed.
    This endpoint is designed for web UI integration to capture human feedback.
    """
    _require_admin_access(admin_token)
    return record_quality_rating(
        db_path=DB_PATH,
        run_id=run_id,
        rating=rating,
        admin_token=admin_token,
        settings=settings
    )


@app.post("/metrics/quality/runs/{run_id}/automated")
def automated_test(
    run_id: str,
    test_result: AutomatedTestRequest,
    admin_token: Optional[str] = Header(None, alias="X-Admin-Token")
):
    """
    Record automated test results for a run.
    
    Captures boolean success status and numeric test scores from automated test suites.
    Use this when runs are part of a test suite that can programmatically assess quality.
    """
    _require_admin_access(admin_token)
    return record_automated_test(
        db_path=DB_PATH,
        run_id=run_id,
        test_result=test_result,
        admin_token=admin_token,
        settings=settings
    )


@app.get("/metrics/quality/runs/{run_id}", response_model=QualityMetricsResponse)
def quality_metrics_for_run(run_id: str):
    """
    Get quality metrics for a specific run.
    
    Returns all quality data including success status, scores, and ratings.
    """
    result = get_run_quality(db_path=DB_PATH, run_id=run_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Quality metrics not found for run {run_id}")
    return result


@app.get("/metrics/quality/summary", response_model=QualitySummaryResponse)
def quality_summary(
    strategy: Optional[str] = Query(None, description="Filter by strategy"),
    min_quality_score: Optional[float] = Query(None, ge=0.0, le=1.0, description="Minimum quality score"),
    success_only: bool = Query(False, description="Only include successful runs")
):
    """
    Get summary statistics for quality metrics.
    
    Returns:
    - Overall success rate and average quality
    - Breakdown by strategy
    - Breakdown by model
    - Number of runs requiring manual fixes
    """
    return get_quality_summary_route(
        db_path=DB_PATH,
        strategy=strategy,
        min_quality_score=min_quality_score,
        success_only=success_only
    )


@app.get("/metrics/quality/efficiency", response_model=CostQualityEfficiencyResponse)
def cost_quality_efficiency(
    quality_threshold: float = Query(0.7, ge=0.0, le=1.0, description="Quality threshold for 'high-quality' runs")
):
    """
    Get cost efficiency metrics based on quality outcomes.
    
    Computes:
    - Cost per successful run
    - Cost per high-quality run (quality >= threshold)
    - Quality-adjusted cost index (lower is better)
    
    This endpoint helps identify which strategies and models provide
    the best value by balancing cost with outcome quality.
    """
    return get_efficiency_route(
        db_path=DB_PATH,
        quality_threshold=quality_threshold
    )


@app.get("/metrics/quality/runs")
def runs_with_quality(
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    strategy: Optional[str] = Query(None, description="Filter by strategy"),
    min_quality: Optional[float] = Query(None, ge=0.0, le=1.0, description="Minimum quality score"),
    success_only: bool = Query(False, description="Only successful runs")
):
    """
    Get paginated list of runs with both cost and quality metrics.
    
    Joins cost data with quality data to provide a complete view of run efficiency.
    Includes computed cost_efficiency metric (cost / quality).
    """
    return get_runs_with_quality(
        db_path=DB_PATH,
        page=page,
        per_page=per_page,
        strategy=strategy,
        min_quality=min_quality,
        success_only=success_only
    )


@app.get("/metrics/cost/prometheus", response_class=Response)
def metrics_cost_prometheus():
    """
    Export metrics in Prometheus text format for scraping.
    
    Metrics include:
    - unified_ai_cost_usd_total
    - unified_ai_energy_kwh_total
    - unified_ai_water_liters_total
    - unified_ai_tokens_total
    """
    metrics_text = get_prometheus_metrics(DB_PATH)
    return Response(
        content=metrics_text,
        media_type="text/plain; version=0.0.4"
    )


# ----------------------------
# GitHub Integration
# ----------------------------

# Initialize GitHub cloner (lazy initialization)
_github_cloner = None

def get_github_cloner():
    """Get or initialize the GitHub cloner."""
    global _github_cloner
    if _github_cloner is None:
        github_token = os.environ.get("GITHUB_TOKEN")
        _github_cloner = GitHubCloner(token=github_token)
    return _github_cloner


class GitHubCloner:
    """Placeholder for GitHub cloner - import from orchestration-bridge."""
    pass


# Try to import GitHub cloner from orchestration-bridge
try:
    orchestration_bridge_path = ROOT_DIR / "apps" / "orchestration-bridge"
    if orchestration_bridge_path not in sys.path:
        sys.path.insert(0, str(orchestration_bridge_path))
    from github.clone import GitHubCloner, CloneStatus  # type: ignore
except ImportError:
    # Fallback if module not available
    class GitHubCloner:  # type: ignore
        def __init__(self, token=None, base_clone_dir=None):
            pass
        def search_repositories(self, query, max_results=30):
            return []
        def get_repository_info(self, owner, repo_name):
            return {}
        def clone_repository(self, repo_url, branch=None, depth=None):
            return "mock_id"
        def get_progress(self, clone_id):
            return None


class GitHubSearchRequest(BaseModel):
    """Request model for GitHub repository search."""
    query: str = Field(..., description="Search query")
    max_results: int = Field(30, description="Maximum results", ge=1, le=100)


class GitHubRepoInfo(BaseModel):
    """Repository information model."""
    full_name: str
    name: str
    owner: str
    description: Optional[str]
    url: str
    clone_url: str
    stars: int
    forks: int
    language: Optional[str]
    size_kb: int
    updated_at: Optional[str]
    default_branch: str
    branches: Optional[List[str]] = None
    topics: Optional[List[str]] = None
    license: Optional[str] = None


class CloneRequest(BaseModel):
    """Request model for cloning a repository."""
    repo_url: str = Field(..., description="Repository URL")
    branch: Optional[str] = Field(None, description="Branch to clone")

# ----------------------------
# Orchestration Bridge Imports
# ----------------------------
_orchestration_bridge_path = ROOT_DIR / "apps" / "orchestration-bridge"
if _orchestration_bridge_path not in sys.path:
    sys.path.insert(0, str(_orchestration_bridge_path))

try:
    from github_integration.clone_service import GitHubCloneService, RepositoryCloneError  # type: ignore
    from github_integration.repo_intake_service import RepoIntakeService, RepoIntakeError  # type: ignore
    from github_integration.supervisor_planner import SupervisorPlanner, SupervisorPlannerError  # type: ignore
    from github_integration.task_executor import TaskExecutor, TaskExecutionError  # type: ignore
    from github_integration.merge_coordinator import MergeCoordinator, MergeCoordinatorError  # type: ignore
    from github_integration.pr_service import PRCreationError  # type: ignore
    from github_integration.codex_service import CodexSwarmService  # type: ignore
except Exception as orchestration_import_error:  # pragma: no cover - optional dependency
    GitHubCloneService = None  # type: ignore
    RepositoryCloneError = Exception  # type: ignore
    RepoIntakeService = None  # type: ignore
    RepoIntakeError = Exception  # type: ignore
    SupervisorPlanner = None  # type: ignore
    SupervisorPlannerError = Exception  # type: ignore
    TaskExecutor = None  # type: ignore
    TaskExecutionError = Exception  # type: ignore
    MergeCoordinator = None  # type: ignore
    MergeCoordinatorError = Exception  # type: ignore
    PRCreationError = Exception  # type: ignore
    CodexSwarmService = None  # type: ignore


# ----------------------------
# Orchestration Run Stub
# ----------------------------
class OrchestrationRequest(BaseModel):
    prompt_id: Optional[str] = None
    version: Optional[str] = None
    review_policy: Optional[str] = None
    status: Optional[str] = "queued"
    dataset_id: Optional[str] = None
    dataset_name: Optional[str] = None
    agents: Optional[List[str]] = None
    notes: Optional[str] = None
    goal: Optional[str] = None
    model: Optional[str] = None
    run_mode: Optional[str] = "default"  # default | multi-agent | codex-swarm | swarms
    repo_root: Optional[str] = None
    max_iterations: Optional[int] = None
    job_type: Optional[str] = None
    app_type: Optional[str] = None
    request_path: Optional[str] = None
    contract_path: Optional[str] = None
    mcp_allowed_servers: List[str] = Field(default_factory=list)
    mcp_allowed_collections: List[str] = Field(default_factory=list)
    acceptance_checks: List[str] = Field(default_factory=list)  # Phase 1: Verifier


class CheckpointResponseRequest(BaseModel):
    """Phase 3: Payload for responding to a mid-run human checkpoint."""
    response: Optional[str] = None       # selected option or free-text answer
    agent: Optional[str] = None          # which agent requested the checkpoint (for validation)
    answers: List[Dict[str, str]] = Field(default_factory=list)


class BulkRunCancelRequest(BaseModel):
    """Bulk cancellation request for orchestration runs."""
    run_ids: List[str] = Field(default_factory=list)
    cancel_all_queued: bool = False


def _canonical_job_type(job_type_value: Any) -> Optional[str]:
    if not isinstance(job_type_value, str):
        return None
    raw = job_type_value.strip().lower()
    if not raw:
        return None
    aliases = {
        "create_new_app": "build_new_app",
        "new_app": "build_new_app",
        "build_new_app": "build_new_app",
        "maintain_existing_app": "maintain_existing_app",
        "maintenance": "maintain_existing_app",
    }
    return aliases.get(raw, raw)


def _derive_app_type(goal_text: str, requested_app_type: Optional[str] = None) -> str:
    if isinstance(requested_app_type, str) and requested_app_type.strip():
        return requested_app_type.strip().lower()

    normalized_goal = (goal_text or "").lower()
    if re.search(r"\b(wpf|winforms|windows forms|xaml|desktop app|windows desktop)\b", normalized_goal):
        return "wpf"
    if re.search(r"\b(web|website|browser|next\.?js|react|html|css|frontend|dom)\b", normalized_goal):
        return "web"
    return "unknown"


def _iter_orchestration_manifests() -> List[Tuple[pathlib.Path, Dict[str, Any]]]:
    manifests: List[Tuple[pathlib.Path, Dict[str, Any]]] = []
    for manifest_path in BRIDGE_RUN_DIR.glob("*.json"):
        try:
            raw = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(raw, dict):
            continue
        if not raw.get("run_id"):
            continue
        manifests.append((manifest_path, raw))
    return manifests


def _parse_iso_timestamp(value: Any) -> Optional[datetime.datetime]:
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        parsed = datetime.datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime.timezone.utc)
    return parsed.astimezone(datetime.timezone.utc)


def _lease_is_stale(manifest: Dict[str, Any], now_utc: Optional[datetime.datetime] = None) -> bool:
    if not isinstance(manifest, dict):
        return False
    status_value = str(manifest.get("status") or "").strip().lower()
    if status_value in ORCH_TERMINAL_STATUSES or status_value in ORCH_QUEUE_STATUSES:
        return False

    lease = manifest.get("lease")
    if not isinstance(lease, dict):
        return False

    now_ts = now_utc or datetime.datetime.now(datetime.timezone.utc)
    expires_at = _parse_iso_timestamp(lease.get("expires_at"))
    if expires_at is None:
        return False
    return expires_at < now_ts


def _derive_run_runtime_fields(manifest: Dict[str, Any]) -> Dict[str, Any]:
    data = dict(manifest)
    raw_status = str(data.get("status") or "unknown").strip().lower()
    derived_status = raw_status or "unknown"

    now_ts = datetime.datetime.now(datetime.timezone.utc)
    heartbeat_stale = _lease_is_stale(data, now_utc=now_ts)
    if heartbeat_stale:
        derived_status = "stuck"

    events = data.get("events") if isinstance(data.get("events"), list) else []
    last_event_at: Optional[str] = None
    current_agent: Optional[str] = None
    current_stage: Optional[str] = None
    for ev in events:
        if not isinstance(ev, dict):
            continue
        ts_value = str(ev.get("ts") or "").strip()
        if ts_value:
            if last_event_at is None or ts_value > last_event_at:
                last_event_at = ts_value
        ev_type = str(ev.get("type") or "")
        if ev_type.startswith("agent:"):
            current_agent = ev_type.split(":", 1)[1]
            current_stage = "agent_activity"
        elif ev_type.startswith("verify:"):
            current_stage = "verification"
        elif ev_type.startswith("checkpoint:"):
            current_stage = "checkpoint"
        elif ev_type.startswith("overseer:"):
            current_stage = "overseer"

    lease = data.get("lease") if isinstance(data.get("lease"), dict) else {}
    last_heartbeat_at = lease.get("heartbeat_at") if lease else None

    data["raw_status"] = raw_status
    data["status"] = derived_status
    data["heartbeat_stale"] = heartbeat_stale
    data["last_heartbeat_at"] = last_heartbeat_at
    data["last_event_at"] = last_event_at
    if current_agent:
        data["current_agent"] = current_agent
    if current_stage:
        data["current_stage"] = current_stage
    return data


def _update_manifest_atomic(path: pathlib.Path, update_fn: Callable[[Dict[str, Any]], Dict[str, Any]]) -> Dict[str, Any]:
    with _orch_manifest_lock:
        current = safe_json_load(path, default={}, context=f"manifest_atomic:{path.name}")
        if not isinstance(current, dict):
            current = {}
        updated = update_fn(dict(current))
        path.write_text(json.dumps(updated, indent=2), encoding="utf-8")
        return updated


def _lease_payload(run_id: str, worker_id: str) -> Dict[str, Any]:
    now_ts = datetime.datetime.now(datetime.timezone.utc)
    expires = now_ts + datetime.timedelta(seconds=ORCH_LEASE_TTL_SECONDS)
    now_iso_ts = now_ts.isoformat()
    return {
        "run_id": run_id,
        "worker_id": worker_id,
        "ttl_seconds": ORCH_LEASE_TTL_SECONDS,
        "acquired_at": now_iso_ts,
        "heartbeat_at": now_iso_ts,
        "expires_at": expires.isoformat(),
        "released_at": None,
        "release_reason": None,
    }


def _acquire_run_lease(run_id: str, path: pathlib.Path, worker_id: str) -> Dict[str, Any]:
    def _apply(data: Dict[str, Any]) -> Dict[str, Any]:
        current_status = str(data.get("status") or "").strip().lower()
        if current_status in ORCH_QUEUE_STATUSES:
            data["status"] = "dispatching"
        data["lease"] = _lease_payload(run_id, worker_id)
        data.setdefault("events", []).append(
            {"ts": now_iso(), "type": "lease", "message": f"Lease acquired by {worker_id}."}
        )
        return data

    return _update_manifest_atomic(path, _apply)


def _heartbeat_run_lease(path: pathlib.Path) -> Dict[str, Any]:
    def _apply(data: Dict[str, Any]) -> Dict[str, Any]:
        lease = data.get("lease")
        if not isinstance(lease, dict):
            return data
        now_ts = datetime.datetime.now(datetime.timezone.utc)
        lease["heartbeat_at"] = now_ts.isoformat()
        lease["expires_at"] = (now_ts + datetime.timedelta(seconds=ORCH_LEASE_TTL_SECONDS)).isoformat()
        data["lease"] = lease
        return data

    return _update_manifest_atomic(path, _apply)


def _release_run_lease(path: pathlib.Path, reason: str) -> Dict[str, Any]:
    def _apply(data: Dict[str, Any]) -> Dict[str, Any]:
        lease = data.get("lease")
        if not isinstance(lease, dict):
            return data
        lease["released_at"] = now_iso()
        lease["release_reason"] = reason
        data["lease"] = lease
        return data

    return _update_manifest_atomic(path, _apply)


def _set_run_status_atomic(path: pathlib.Path, status_value: str, event_message: Optional[str] = None) -> Dict[str, Any]:
    def _apply(data: Dict[str, Any]) -> Dict[str, Any]:
        data["status"] = status_value
        if event_message:
            data.setdefault("events", []).append({"ts": now_iso(), "type": "status", "message": event_message})
        return data

    return _update_manifest_atomic(path, _apply)


def _orchestration_queue_snapshot() -> Dict[str, int]:
    queued = 0
    running = 0
    dispatching = 0
    cancelled = 0
    stuck = 0
    terminal = 0
    total = 0

    for _, manifest in _iter_orchestration_manifests():
        manifest = _derive_run_runtime_fields(manifest)
        total += 1
        status = str(manifest.get("status") or "").strip().lower()
        if status in ORCH_QUEUE_STATUSES:
            queued += 1
        elif status in ORCH_DISPATCHING_STATUSES:
            dispatching += 1
        elif status in ORCH_RUNNING_STATUSES:
            running += 1
        elif status == "stuck":
            stuck += 1
        elif status in {"cancelled", "canceled"}:
            cancelled += 1
            terminal += 1
        elif status in ORCH_TERMINAL_STATUSES:
            terminal += 1

    return {
        "total": total,
        "queued": queued,
        "dispatching": dispatching,
        "running": running,
        "stuck": stuck,
        "cancelled": cancelled,
        "terminal": terminal,
        "max_concurrent": ORCH_RUN_MAX_CONCURRENT,
        "max_queued": ORCH_RUN_MAX_QUEUED,
        "available_slots": max(0, ORCH_RUN_MAX_CONCURRENT - (running + dispatching)),
    }


def _set_orch_run_process(run_id: str, process: Optional[subprocess.Popen]) -> None:
    with _orch_run_state_lock:
        state = _orch_run_state.get(run_id)
        if not state:
            return
        state["process"] = process
        _orch_run_state[run_id] = state


def _request_orch_run_cancel(run_id: str, cancel_future: bool, force_process: bool = False) -> Dict[str, bool]:
    cancel_event: Optional[threading.Event] = None
    future: Optional[Future] = None
    process: Optional[subprocess.Popen] = None

    with _orch_run_state_lock:
        state = _orch_run_state.get(run_id)
        if state:
            cancel_event = state.get("cancel_event")
            future = state.get("future")
            process = state.get("process")

    if cancel_event:
        cancel_event.set()

    future_cancelled = bool(cancel_future and future and future.cancel())
    process_running = bool(process and process.poll() is None)
    process_terminated = False
    process_killed = False
    if force_process and process_running and process is not None:
        try:
            process.terminate()
            process.wait(timeout=8)
            process_terminated = True
        except subprocess.TimeoutExpired:
            try:
                process.kill()
                process.wait(timeout=5)
                process_killed = True
            except Exception:
                process_killed = False
        except Exception:
            process_terminated = False

    return {
        "state_found": cancel_event is not None or future is not None or process is not None,
        "future_cancelled": future_cancelled,
        "process_running": process_running,
        "process_terminated": process_terminated,
        "process_killed": process_killed,
    }


def _cancel_orchestration_run_internal(run_id: str, reason: str = "manual") -> Dict[str, Any]:
    manifest_path = BRIDGE_RUN_DIR / f"{run_id}.json"
    if not manifest_path.exists():
        raise HTTPException(status_code=404, detail="Run not found")

    data = safe_json_load(manifest_path, default={}, context=f"cancel_run:{run_id}")
    if not isinstance(data, dict):
        data = {}
    status_value = str(data.get("status") or "unknown").strip().lower()

    if status_value in ORCH_TERMINAL_STATUSES:
        return {
            "run_id": run_id,
            "status": status_value,
            "cancelled": False,
            "cancel_requested": False,
            "message": "Run already in terminal state.",
        }

    cancel_result = _request_orch_run_cancel(run_id, cancel_future=True, force_process=False)
    now = now_iso()

    if status_value in ORCH_QUEUE_STATUSES or cancel_result["future_cancelled"]:
        data["status"] = "cancelled"
        data["completed_at"] = now
        data.setdefault("events", []).append({"ts": now, "type": "status", "message": "cancelled"})
        data.setdefault("events", []).append(
            {"ts": now, "type": "info", "message": f"Run cancelled before execution ({reason})."}
        )
        manifest_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        with _orch_run_state_lock:
            _orch_run_state.pop(run_id, None)
        try:
            _release_run_lease(manifest_path, reason=f"cancel:{reason}")
        except Exception:
            pass
        return {
            "run_id": run_id,
            "status": "cancelled",
            "cancelled": True,
            "cancel_requested": False,
            "message": "Queued run cancelled.",
        }

    data.setdefault("events", []).append(
        {"ts": now, "type": "info", "message": f"Cancellation requested ({reason})."}
    )
    data["cancel_requested"] = True
    manifest_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return {
        "run_id": run_id,
        "status": status_value,
        "cancelled": False,
        "cancel_requested": True,
        "message": "Cancellation requested for active run.",
    }


def _force_cancel_orchestration_run_internal(run_id: str, reason: str = "force") -> Dict[str, Any]:
    manifest_path = BRIDGE_RUN_DIR / f"{run_id}.json"
    if not manifest_path.exists():
        raise HTTPException(status_code=404, detail="Run not found")

    data = safe_json_load(manifest_path, default={}, context=f"force_cancel_run:{run_id}")
    if not isinstance(data, dict):
        data = {}
    status_value = str(data.get("status") or "unknown").strip().lower()
    if status_value in ORCH_TERMINAL_STATUSES:
        return {
            "run_id": run_id,
            "status": status_value,
            "cancelled": False,
            "cancel_requested": False,
            "message": "Run already in terminal state.",
        }

    cancel_result = _request_orch_run_cancel(run_id, cancel_future=True, force_process=True)
    now = now_iso()
    data["status"] = "cancelled"
    data["completed_at"] = now
    data["cancel_requested"] = False
    data.setdefault("events", []).append({"ts": now, "type": "status", "message": "cancelled"})
    data.setdefault("events", []).append(
        {"ts": now, "type": "info", "message": f"Force cancellation executed ({reason})."}
    )
    manifest_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    try:
        _release_run_lease(manifest_path, reason=f"force_cancel:{reason}")
    except Exception:
        pass
    with _orch_run_state_lock:
        _orch_run_state.pop(run_id, None)
    return {
        "run_id": run_id,
        "status": "cancelled",
        "cancelled": True,
        "cancel_requested": False,
        "process_terminated": bool(cancel_result.get("process_terminated")),
        "process_killed": bool(cancel_result.get("process_killed")),
        "message": "Force cancel completed; worker process terminated and lease released.",
    }


def _requeue_orchestration_run_internal(run_id: str, reason: str = "manual_requeue") -> Dict[str, Any]:
    manifest_path = BRIDGE_RUN_DIR / f"{run_id}.json"
    if not manifest_path.exists():
        raise HTTPException(status_code=404, detail="Run not found")

    def _apply(data: Dict[str, Any]) -> Dict[str, Any]:
        status_value = str(data.get("status") or "unknown").strip().lower()
        if status_value in ORCH_RUNNING_STATUSES:
            raise HTTPException(status_code=409, detail="Cannot requeue an active run")
        data["status"] = "queued"
        data["cancel_requested"] = False
        data["started_at"] = None
        data["completed_at"] = None
        data["lease"] = None
        data.setdefault("events", []).append(
            {"ts": now_iso(), "type": "status", "message": f"queued ({reason})"}
        )
        return data

    _update_manifest_atomic(manifest_path, _apply)
    with _orch_run_state_lock:
        _orch_run_state[run_id] = {
            "cancel_event": threading.Event(),
            "process": None,
            "future": None,
        }
    return {"run_id": run_id, "status": "queued", "requeued": True, "message": "Run requeued."}


def _release_stale_leases_internal() -> Dict[str, Any]:
    released: List[str] = []
    for manifest_path, manifest in _iter_orchestration_manifests():
        run_id = str(manifest.get("run_id") or "").strip()
        if not run_id:
            continue
        if not _lease_is_stale(manifest):
            continue
        try:
            def _apply(data: Dict[str, Any]) -> Dict[str, Any]:
                data["status"] = "stuck"
                data["cancel_requested"] = False
                data.setdefault("events", []).append(
                    {"ts": now_iso(), "type": "warn", "message": "Lease expired; run marked STUCK."}
                )
                lease = data.get("lease")
                if isinstance(lease, dict):
                    lease["released_at"] = now_iso()
                    lease["release_reason"] = "stale_lease_released"
                    data["lease"] = lease
                return data

            _update_manifest_atomic(manifest_path, _apply)
            with _orch_run_state_lock:
                _orch_run_state.pop(run_id, None)
            released.append(run_id)
        except Exception:
            continue
    return {"released": len(released), "run_ids": released}


def _normalize_run_mode(run_mode: Optional[str]) -> str:
    raw = (run_mode or "default").strip().lower()
    if raw in {"default", "multi-agent", "multi_agent", "multiagent"}:
        return "default"
    if raw in {"codex-swarm", "codex_swarm", "codexswarm", "swarms", "swarm"}:
        return "codex-swarm"
    return raw or "default"


def _create_run_allowlist_if_requested(run_id: str, req: OrchestrationRequest) -> Optional[str]:
    """Create a run-scoped MCP allowlist if requested by run creation payload."""
    if not MCP_ENFORCEMENT_IMPORTS_AVAILABLE or not mcp_storage:
        return None

    if not req.mcp_allowed_servers and not req.mcp_allowed_collections:
        return None

    allowlist_id = f"run-{run_id}-allowlist"
    existing = mcp_storage.get_allowlist(allowlist_id)
    if existing:
        return allowlist_id

    allowlist = Allowlist(
        allowlist_id=allowlist_id,
        scope=AllowlistScope.RUN,
        scope_id=run_id,
        allowed_servers=req.mcp_allowed_servers,
        allowed_collections=req.mcp_allowed_collections,
        created_by="system",
        metadata={"source": "orchestrate_run"},
    )
    mcp_storage.save_allowlist(allowlist)
    return allowlist_id


class RepoOrchestrationOptions(BaseModel):
    """Options for repository-first orchestration."""

    branch: Optional[str] = None
    base_branch: Optional[str] = None
    integration_branch: Optional[str] = None
    allowed_paths: List[str] = Field(default_factory=list)
    max_parallel: int = 3
    risk_posture: str = "standard"
    github_token: Optional[str] = Field(
        default=None, description="GitHub token (not persisted to disk)"
    )
    model: Optional[str] = None
    pr_title: Optional[str] = None
    pr_body: Optional[str] = None


class RepoOrchestrationRequest(BaseModel):
    """Request to orchestrate a repo workflow end-to-end."""

    repo: str = Field(..., description="Repository URL or owner/repo slug")
    goal: str = Field(..., description="Goal for the orchestration")
    options: RepoOrchestrationOptions = Field(default_factory=RepoOrchestrationOptions)


_repo_orchestration_state: Dict[str, Dict[str, Any]] = {}
_repo_state_lock = asyncio.Lock()
_mcp_middleware: Optional["OrchestrationMCPMiddleware"] = None


def get_orchestration_mcp_middleware() -> Optional["OrchestrationMCPMiddleware"]:
    """Lazy-initialize runtime MCP middleware for orchestration integrations."""
    global _mcp_middleware
    if not MCP_ENFORCEMENT_IMPORTS_AVAILABLE or OrchestrationMCPMiddleware is None:
        return None
    if _mcp_middleware is None:
        try:
            _mcp_middleware = OrchestrationMCPMiddleware.from_environment(
                audit_log_dir=str(ROOT_DIR / "data" / "audit")
            )
        except Exception as exc:
            logger.warning("Failed to initialize orchestration MCP middleware: %s", exc)
            return None
    return _mcp_middleware


@app.post("/orchestrate/run")
def orchestrate_run(
    req: OrchestrationRequest,
    execution_token: Optional[str] = Header(default=None, alias="X-Execution-Token"),
    admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    """
    Queue an orchestration run (lightweight orchestrator). Writes a manifest and kicks off a
    background task that executes the external orchestrator (Unified-Orchestration.ps1 by default), otherwise
    simulates a completion.
    """
    _require_execution_access(execution_token or admin_token)

    queue_snapshot = _orchestration_queue_snapshot()
    if queue_snapshot["queued"] >= ORCH_RUN_MAX_QUEUED:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Queue limit reached ({queue_snapshot['queued']} queued, "
                f"max {ORCH_RUN_MAX_QUEUED}). Cancel queued runs or wait for capacity."
            ),
        )

    # Sanitize the raw run base to ensure it's safe for filesystem use on Windows
    raw_run_base = req.prompt_id or req.goal or "run"
    safe_run_base = sanitize_run_id(raw_run_base)
    run_id = f"{safe_run_base}.{now_iso().replace(':','-')}"
    out_dir = BRIDGE_RUN_DIR / run_id
    log_path = BRIDGE_RUN_DIR / f"{run_id}.log"
    out_dir.mkdir(parents=True, exist_ok=True)
    normalized_run_mode = _normalize_run_mode(req.run_mode)
    normalized_job_type = _canonical_job_type(req.job_type) or "build_new_app"
    derived_app_type = _derive_app_type(req.goal or "", req.app_type)

    allowlist_id = _create_run_allowlist_if_requested(run_id, req)
    middleware = get_orchestration_mcp_middleware()

    # Initialize orchestrator logger if available
    orch_logger = None
    if ORCHESTRATOR_LOGGING_AVAILABLE:
        try:
            artifacts_root = ROOT_DIR / "artifacts"
            orch_logger = OrchestratorLogger(artifacts_root, run_id=run_id)
            
            # Log run metadata
            prompt_library_hash = compute_prompt_hash(str(PROMPT_SYNC_FILE.read_text() if PROMPT_SYNC_FILE.exists() else ""))
            orch_logger.log_run_metadata(
                orchestrator_version="1.5.0",
                prompt_library_hash=prompt_library_hash,
                user_goal=req.goal or req.prompt_id or "Orchestration run",
                context_payload={
                    "prompt_id": req.prompt_id,
                    "model": req.model or DEFAULT_MODEL,
                    "run_mode": normalized_run_mode,
                    "job_type": normalized_job_type,
                    "app_type": derived_app_type,
                    "repo_root": req.repo_root or REPO_ROOT_DEFAULT,
                    "agents": req.agents or [],
                },
                definition_of_done=["Complete orchestration execution", "Generate artifacts", "Log final synthesis"],
            )
        except Exception as e:
            logger.warning(f"Failed to initialize orchestrator logger: {e}")
            orch_logger = None

    manifest = {
        "run_id": run_id,
        "prompt_id": req.prompt_id,
        "version": req.version or "latest",
        "review_policy": req.review_policy or "standard",
        "dataset_id": req.dataset_id,
        "dataset_name": req.dataset_name,
        "agents": req.agents or [],
        "notes": req.notes,
        "requested_at": now_iso(),
        "source": "api",
        "status": "queued",
        "goal": req.goal,
        "model": req.model or DEFAULT_MODEL,
        "run_mode": normalized_run_mode,
        "requested_run_mode": req.run_mode or "default",
        "job_type": normalized_job_type,
        "app_type": derived_app_type,
        "request_path": req.request_path,
        "contract_path": req.contract_path,
        "mode": "simulated",
        "mcp_allowlist_id": allowlist_id,
        "mcp_allowed_servers": req.mcp_allowed_servers,
        "mcp_allowed_collections": req.mcp_allowed_collections,
        "mcp_enforcement_enabled": bool(getattr(middleware, "enabled", False)),
        "run_dir": str(out_dir),
        "log_path": str(log_path),
        "events": [
            {"ts": now_iso(), "type": "status", "message": "queued"},
        ],
        "scratchpad": [],
        "acceptance_checks": req.acceptance_checks,
        "verification_status": "pending",
        "loop_iteration": 0,
        "checkpoints": [],       # Phase 3: mid-run human decision log
        "lease": None,
        "cancel_requested": False,
    }
    path = BRIDGE_RUN_DIR / f"{run_id}.json"
    path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    cancel_event = threading.Event()
    with _orch_run_state_lock:
        _orch_run_state[run_id] = {
            "cancel_event": cancel_event,
            "future": None,
            "process": None,
            "created_at": now_iso(),
            "worker_id": None,
        }

    def _update_manifest(update_fn):
        try:
            _update_manifest_atomic(path, lambda d: update_fn(d) or d)
        except Exception as e:
            print(f"[orchestrate] Failed to update manifest {path}: {e}", file=sys.stderr)

    def _append_events(events: List[Dict[str, Any]]):
        def _inner(data):
            data.setdefault("events", [])
            data["events"].extend(events)
            return data
        _update_manifest(_inner)

    def _append_scratchpad(entries: List[Dict[str, Any]]):
        def _inner(data):
            data.setdefault("scratchpad", [])
            data["scratchpad"].extend(entries)
            return data
        _update_manifest(_inner)

    def _ingest_status_file(status_file: pathlib.Path, processed: int):
        if not status_file.exists():
            return processed
        try:
            lines = status_file.read_text(encoding="utf-8").splitlines()
        except Exception as e:
            print(f"[orchestrate] Failed to read status file {status_file}: {e}", file=sys.stderr)
            return processed
        if processed >= len(lines):
            return processed
        new_lines = lines[processed:]
        processed = len(lines)
        entries = []
        events = []
        for line_num, line in enumerate(new_lines, start=processed+1):
            if not line.strip():  # Skip empty lines
                continue
            try:
                rec = json.loads(line)
                entries.append(rec)
                events.append(
                    {
                        "ts": rec.get("timestamp") or now_iso(),
                        "type": f"agent:{rec.get('agent')}",
                        "message": rec.get("status") or "",
                    }
                )
                
                # Log agent step if orchestrator logger is available
                if orch_logger and rec.get("agent"):
                    try:
                        step_id = f"{run_id}_step_{processed + line_num}"
                        orch_logger.log_step(
                            step_id=step_id,
                            agent_id=rec.get("agent", "unknown"),
                            model=manifest.get("model", DEFAULT_MODEL),
                            prompt_text=rec.get("prompt", ""),
                            input_payload={"status": rec.get("status"), "timestamp": rec.get("timestamp")},
                            raw_output=rec.get("output", ""),
                            parsed_output=rec if isinstance(rec, dict) else None,
                            timing_ms=rec.get("duration_ms"),
                        )
                    except Exception as log_err:
                        logger.warning(f"Failed to log step: {log_err}")
                
            except json.JSONDecodeError as e:
                print(f"[orchestrate] Invalid JSON in {status_file} at line {line_num}: {e.msg} - Content: {line[:100]}", file=sys.stderr)
                continue
            except Exception as e:
                print(f"[orchestrate] Error processing line {line_num} in {status_file}: {e}", file=sys.stderr)
                continue
        if entries:
            _append_scratchpad(entries)
        if events:
            _append_events(events)
        return processed

    def _execute(path: pathlib.Path, manifest: Dict[str, Any], cancel_event: threading.Event):
        nonlocal orch_logger
        start_time = time.time()
        worker_id = f"orch-worker-{os.getpid()}-{threading.get_ident()}-{run_id[:8]}"
        heartbeat_stop = threading.Event()
        heartbeat_thread: Optional[threading.Thread] = None
        try:
            _acquire_run_lease(run_id, path, worker_id=worker_id)
            with _orch_run_state_lock:
                state = _orch_run_state.get(run_id, {})
                state["worker_id"] = worker_id
                _orch_run_state[run_id] = state

            data = safe_json_load(path, context=f"execute_start:{run_id}")
            if cancel_event.is_set():
                data["status"] = "cancelled"
                data["completed_at"] = now_iso()
                data.setdefault("events", []).append({"ts": data["completed_at"], "type": "status", "message": "cancelled"})
                data.setdefault("events", []).append({"ts": data["completed_at"], "type": "info", "message": "Run cancelled before execution started."})
                path.write_text(json.dumps(data, indent=2), encoding="utf-8")
                _release_run_lease(path, reason="cancelled_before_start")
                return
            data["status"] = "running"
            data["started_at"] = now_iso()
            data.setdefault("events", []).append({"ts": data["started_at"], "type": "status", "message": "running"})
            data["mode"] = "executed"
            path.write_text(json.dumps(data, indent=2), encoding="utf-8")

            def _heartbeat_loop() -> None:
                while not heartbeat_stop.wait(ORCH_HEARTBEAT_INTERVAL_SECONDS):
                    try:
                        _heartbeat_run_lease(path)
                    except Exception as hb_exc:
                        print(f"[orchestrate] heartbeat update failed for {run_id}: {hb_exc}", file=sys.stderr)

            heartbeat_thread = threading.Thread(target=_heartbeat_loop, daemon=True)
            heartbeat_thread.start()

            goal_text = manifest.get("goal") or manifest.get("prompt_id") or ""
            repo_root = req.repo_root or REPO_ROOT_DEFAULT
            ps_exe = shutil.which("pwsh") or shutil.which("powershell")

            # choose orchestrator script based on normalized run_mode
            run_mode = _normalize_run_mode(req.run_mode)
            ps1_candidate = pathlib.Path(CODEX_SWARM_PS1 if run_mode == "codex-swarm" else ORCH_PS1)
            data.setdefault("events", []).append({
                "ts": now_iso(),
                "type": "debug",
                "message": f"Resolved ORCH_PS1={ORCH_PS1}, POF_PS1={POF_PS1}",
            })
            data.setdefault("events", []).append({
                "ts": now_iso(),
                "type": "debug",
                "message": f"Resolving orchestrator script: ROOT={ROOT_DIR}, candidate={ps1_candidate}, exists={ps1_candidate.exists()}, run_mode={run_mode}",
            })
            path.write_text(json.dumps(data, indent=2), encoding="utf-8")
            env_snapshot = {
                "root": str(ROOT_DIR),
                "candidate": str(ps1_candidate),
                "exists": ps1_candidate.exists(),
                "cwd": str(ps1_candidate.parent),
                "pwsh_path": ps_exe,
                "run_mode": run_mode,
            }
            with open(log_path, "w", encoding="utf-8") as logf:
                logf.write(f"PRE-EXEC ENV: {json.dumps(env_snapshot)}\n")
            try:
                ps1 = ps1_candidate.resolve(strict=True)
            except FileNotFoundError:
                raise FileNotFoundError(f"Orchestrator script not found: {ps1_candidate.as_posix()}")

            status_file = out_dir / "agent_status.json"
            final_synthesis = out_dir / "Final_Synthesis.txt"
            processed_status = 0
            stop_event = threading.Event()

            def _poll_status():
                nonlocal processed_status
                while not stop_event.is_set():
                    processed_status = _ingest_status_file(status_file, processed_status)
                    stop_event.wait(1.0)

            poller = threading.Thread(target=_poll_status, daemon=True)
            poller.start()

            # ── Overseer ──────────────────────────────────────────────────────
            # Monitors orchestration health independently of the goal.
            # Emits overseer:* events to the manifest and writes overseer_advisory.json.
            # Never surfaces findings to the end user — advises Commissioner only.
            AGENT_STUCK_WARN_S = 60
            AGENT_STUCK_CRITICAL_S = 180
            advisory_path = out_dir / "overseer_advisory.json"

            def _oversee():
                advisory = {
                    "run_id": run_id,
                    "generated_at": now_iso(),
                    "observations": [],
                    "commissioner_directives": [],
                }

                def _save_advisory():
                    try:
                        advisory_path.write_text(json.dumps(advisory, indent=2), encoding="utf-8")
                    except Exception as _e:
                        print(f"[overseer] advisory write failed: {_e}", file=sys.stderr)

                def _observe(severity, agent, finding, duration_s, directive):
                    ts = now_iso()
                    obs = {"ts": ts, "severity": severity, "finding": finding}
                    if agent:
                        obs["agent"] = agent
                    if duration_s is not None:
                        obs["duration_s"] = round(duration_s, 1)
                    if directive:
                        obs["suggested_directive"] = directive
                    advisory["observations"].append(obs)
                    if directive:
                        advisory["commissioner_directives"].append({"ts": ts, "directive": directive})
                    _save_advisory()
                    msg = f"[{agent}] {finding}" if agent else finding
                    if duration_s is not None:
                        msg += f" ({duration_s:.0f}s)"
                    if directive:
                        msg += f" — {directive}"
                    _append_events([{"ts": ts, "type": f"overseer:{severity}", "message": msg}])

                _append_events([{"ts": now_iso(), "type": "overseer:info", "message": "Overseer monitoring started"}])

                agent_working_since: Dict[str, float] = {}
                warned_agents: set = set()
                checked_agents: set = set()  # agents whose .txt output has been inspected

                # ── Phase 3: Checkpoint state ──────────────────────────────────
                CHECKPOINT_TIMEOUT_S = 300          # 5 minutes before auto-resolve
                checkpoint_pending_path = out_dir / "checkpoint_pending.json"
                checkpoint_response_path = out_dir / "checkpoint_response.json"
                active_checkpoint_key: Optional[str] = None  # "{agent}:{question[:40]}"
                checkpoint_started_at: Optional[float] = None

                def _write_checkpoint_pending(agent_name: str, question: str, options: list, default_opt: str) -> None:
                    """Write checkpoint_pending.json so agents and the UI know to pause."""
                    nonlocal active_checkpoint_key, checkpoint_started_at
                    key = f"{agent_name}:{question[:40]}"
                    active_checkpoint_key = key
                    checkpoint_started_at = time.time()
                    record = {
                        "run_id": run_id,
                        "agent": agent_name,
                        "question": question,
                        "options": options,
                        "default_option": default_opt,
                        "requested_at": now_iso(),
                        "timeout_s": CHECKPOINT_TIMEOUT_S,
                    }
                    try:
                        checkpoint_pending_path.write_text(json.dumps(record, indent=2), encoding="utf-8")
                    except Exception as _e:
                        print(f"[overseer] checkpoint_pending write failed: {_e}", file=sys.stderr)
                    # Update manifest: status → awaiting_input, append to checkpoints[]
                    def _apply(d):
                        d["status"] = "awaiting_input"
                        d.setdefault("checkpoints", []).append({
                            "id": key,
                            "agent": agent_name,
                            "question": question,
                            "options": options,
                            "default_option": default_opt,
                            "requested_at": record["requested_at"],
                            "response": None,
                            "responded_at": None,
                            "resolved_by": None,
                        })
                        d.setdefault("events", []).append({
                            "ts": now_iso(),
                            "type": "checkpoint:pending",
                            "message": f"[{agent_name}] {question}",
                        })
                        return d
                    _update_manifest(_apply)

                def _resolve_checkpoint(response: str, resolved_by: str) -> None:
                    """Resolve active checkpoint — write response file and update manifest."""
                    nonlocal active_checkpoint_key, checkpoint_started_at
                    key = active_checkpoint_key
                    active_checkpoint_key = None
                    checkpoint_started_at = None
                    try:
                        checkpoint_response_path.write_text(
                            json.dumps({"response": response, "resolved_by": resolved_by, "resolved_at": now_iso()}, indent=2),
                            encoding="utf-8",
                        )
                    except Exception as _e:
                        print(f"[overseer] checkpoint_response write failed: {_e}", file=sys.stderr)
                    def _apply(d):
                        d["status"] = "running"
                        for cp in d.get("checkpoints", []):
                            if cp.get("id") == key and cp.get("response") is None:
                                cp["response"] = response
                                cp["responded_at"] = now_iso()
                                cp["resolved_by"] = resolved_by
                                break
                        ev_type = "checkpoint:timed_out" if resolved_by == "timeout" else "checkpoint:resolved"
                        d.setdefault("events", []).append({
                            "ts": now_iso(),
                            "type": ev_type,
                            "message": f"Checkpoint resolved by {resolved_by}: {response!r}",
                        })
                        return d
                    _update_manifest(_apply)
                # ── End Phase 3 checkpoint state ──────────────────────────────

                def _build_error_directive(agent_name: str, error_msgs: list) -> str:
                    """Produce a root-cause + remediation directive for an agent error."""
                    for err in error_msgs:
                        err_str = str(err)
                        # Schema validation failure (ReviewGate pattern)
                        if "output_schema" in err_str or "Required properties" in err_str:
                            m = re.search(r'Required properties \["([^"]+)"\]', err_str)
                            missing = f'"{m.group(1)}"' if m else "a required field"
                            return (
                                f"{agent_name} failed schema validation: an upstream agent returned JSON "
                                f"that is missing the required property {missing}. "
                                f"Root cause: the agent feeding {agent_name} did not include a top-level "
                                f"{missing} key in its response. "
                                f"Remediation: inspect the output_schema for {agent_name} and ensure all "
                                f"upstream agents include {missing}. Consider adding explicit output "
                                f"validation to the upstream agent's prompt."
                            )
                    error_summary = "; ".join(str(e) for e in error_msgs)
                    return (
                        f"{agent_name} produced an error-status output. "
                        f"Error: {error_summary}. "
                        f"Remediation: review {agent_name}'s prompt template and expected input format. "
                        f"Verify that the model response conforms to the output_schema."
                    )

                def _analyze_agent_output(agent_name: str) -> None:
                    """Read canonical agent output; emit an observation if it contains errors."""
                    try:
                        output_json = _parse_agent_json_from_run_dir(out_dir, agent_name)
                        if not isinstance(output_json, dict):
                            return
                        status = output_json.get("status", "")
                        errors = output_json.get("errors", [])
                        has_error = status == "error" or (isinstance(errors, list) and len(errors) > 0)
                        if not has_error:
                            return
                        error_msgs = errors if isinstance(errors, list) else []
                        error_summary = (
                            "; ".join(str(e) for e in error_msgs) if error_msgs else f"status={status!r}"
                        )
                        directive = _build_error_directive(agent_name, error_msgs)
                        _observe(
                            severity="warn",
                            agent=agent_name,
                            finding=f"agent_output_error: {error_summary}",
                            duration_s=None,
                            directive=directive,
                        )
                    except Exception as _e:
                        print(f"[overseer] Output check failed for {agent_name}: {_e}", file=sys.stderr)

                while not stop_event.is_set():
                    stop_event.wait(3.0)
                    if stop_event.is_set():
                        break

                    # Read latest agent statuses from agent_status.json
                    if not status_file.exists():
                        continue
                    try:
                        lines = status_file.read_text(encoding="utf-8").splitlines()
                    except Exception:
                        continue

                    agent_latest: Dict[str, Dict[str, Any]] = {}
                    for line in lines:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            rec = json.loads(line)
                            name = rec.get("agent")
                            if name:
                                agent_latest[name] = rec
                        except json.JSONDecodeError:
                            continue

                    now_ts = time.time()
                    for name, rec in agent_latest.items():
                        agent_status_val = rec.get("status", "")
                        if agent_status_val == "working":
                            if name not in agent_working_since:
                                agent_working_since[name] = now_ts
                            duration = now_ts - agent_working_since[name]
                            if duration >= AGENT_STUCK_CRITICAL_S and f"{name}:critical" not in warned_agents:
                                warned_agents.add(f"{name}:critical")
                                _observe(
                                    severity="critical",
                                    agent=name,
                                    finding="stuck_working_critical",
                                    duration_s=duration,
                                    directive=(
                                        f"{name} has been working for {duration:.0f}s with no status change. "
                                        f"Commissioner should consider synthesizing from available partial output "
                                        f"or reducing scope and retrying."
                                    ),
                                )
                            elif duration >= AGENT_STUCK_WARN_S and f"{name}:warn" not in warned_agents:
                                warned_agents.add(f"{name}:warn")
                                _observe(
                                    severity="warn",
                                    agent=name,
                                    finding="stuck_working",
                                    duration_s=duration,
                                    directive=None,
                                )
                        else:
                            agent_working_since.pop(name, None)

                    # ── Agent output error check ──────────────────────────────────
                    # Inspect newly completed agents' .txt files for error status.
                    for name, rec in agent_latest.items():
                        if rec.get("status") == "complete" and name not in checked_agents:
                            checked_agents.add(name)
                            _analyze_agent_output(name)

                    # ── Phase 3: Checkpoint detection ─────────────────────────────
                    if active_checkpoint_key is None:
                        # Look for any agent that has requested a checkpoint
                        for name, rec in agent_latest.items():
                            if rec.get("checkpoint") is True and rec.get("status") != "complete":
                                question = rec.get("question", "Agent requires a decision to continue.")
                                options = rec.get("options") or ["Continue", "Abort"]
                                default_opt = rec.get("default") or options[0]
                                _write_checkpoint_pending(name, question, options, default_opt)
                                _append_events([{
                                    "ts": now_iso(),
                                    "type": "checkpoint:pending",
                                    "message": f"[{name}] waiting for human input: {question[:120]}",
                                }])
                                break
                    else:
                        # Checkpoint is active — check for response or timeout
                        if checkpoint_response_path.exists():
                            try:
                                resp_data = json.loads(checkpoint_response_path.read_text(encoding="utf-8"))
                                response_val = resp_data.get("response", "")
                                resolved_by = resp_data.get("resolved_by", "human")
                                _resolve_checkpoint(response_val, resolved_by)
                                _append_events([{
                                    "ts": now_iso(),
                                    "type": "checkpoint:resolved",
                                    "message": f"Human response received: {response_val!r}",
                                }])
                            except Exception as _cpe:
                                print(f"[overseer] checkpoint response read error: {_cpe}", file=sys.stderr)
                        elif checkpoint_started_at is not None:
                            elapsed = time.time() - checkpoint_started_at
                            if elapsed >= CHECKPOINT_TIMEOUT_S:
                                # Load default from pending file and auto-resolve
                                try:
                                    pending_data = json.loads(checkpoint_pending_path.read_text(encoding="utf-8"))
                                    default_val = pending_data.get("default_option", "Continue")
                                except Exception:
                                    default_val = "Continue"
                                _resolve_checkpoint(default_val, "timeout")
                                _append_events([{
                                    "ts": now_iso(),
                                    "type": "checkpoint:timed_out",
                                    "message": f"Checkpoint timed out after {CHECKPOINT_TIMEOUT_S}s. Auto-resolved: {default_val!r}",
                                }])
                    # ── End Phase 3 checkpoint detection ──────────────────────────

                # ── Final sweep (runs after subprocess exits) ──────────────────
                try:
                    run_data = safe_json_load(path, default={}, context=f"overseer_final:{run_id}")
                    final_status = str(run_data.get("status", "") or "")
                    scratchpad = run_data.get("scratchpad", [])

                    # Build agent completion map from scratchpad
                    agent_completions: Dict[str, str] = {}
                    for entry in scratchpad:
                        a = entry.get("agent")
                        s = entry.get("status")
                        if a and s:
                            agent_completions[a] = s
                    all_agents_complete = bool(agent_completions) and all(
                        v == "complete" for v in agent_completions.values()
                    )
                    synthesis_present = (
                        (out_dir / "Final_Synthesis.html").exists()
                        or (out_dir / "Final_Synthesis.txt").exists()
                    )
                    derived_final_status = _derive_final_status(
                        final_status, agent_completions, all_agents_complete, synthesis_present
                    )

                    # ── Final output error sweep ──────────────────────────────────
                    # Catch any agents that completed too quickly to be seen during polling.
                    SKIP_FINAL_SWEEP = {"Final_Synthesis"}
                    for agent_file in sorted(out_dir.glob("*.txt")):
                        name = agent_file.stem
                        if name not in checked_agents and name not in SKIP_FINAL_SWEEP:
                            checked_agents.add(name)
                            _analyze_agent_output(name)

                    # STATUS RECLASSIFICATION
                    # A CalledProcessError after all agents complete and synthesis exists
                    # means the PowerShell wrapper exited non-zero for a non-critical reason
                    # (e.g. stdout/stderr flush, non-fatal post-run hook).
                    # Reclassify so the UI shows results rather than a red error state.
                    if derived_final_status == "completed_with_errors":
                        derived_final_status = "completed_with_errors"
                        _append_events([{
                            "ts": now_iso(),
                            "type": "overseer:action",
                            "message": (
                                "Status reclassified from error:CalledProcessError → completed_with_errors. "
                                "All agents completed and synthesis output is present; "
                                "PowerShell exit code is non-critical."
                            ),
                        }])
                        _update_manifest(lambda d: {
                            **d,
                            "status": derived_final_status,
                            "overseer_reclassified": True,
                            "overseer_original_status": final_status,
                        })
                    elif derived_final_status != final_status:
                        _update_manifest(lambda d: {
                            **d,
                            "status": derived_final_status,
                        })

                    obs_count = len(advisory["observations"])
                    directives_count = len(advisory.get("commissioner_directives", []))
                    summary = (
                        f"Overseer monitoring ended. "
                        f"{obs_count} observation(s), {directives_count} directive(s). "
                        f"All agents complete: {all_agents_complete}. "
                        f"Synthesis present: {synthesis_present}."
                    )
                    _append_events([{"ts": now_iso(), "type": "overseer:info", "message": summary}])

                    advisory["completed_at"] = now_iso()
                    advisory["agent_completions"] = agent_completions
                    advisory["all_agents_complete"] = all_agents_complete
                    advisory["synthesis_present"] = synthesis_present
                    advisory["final_status"] = derived_final_status
                    _save_advisory()
                except Exception as _e:
                    print(f"[overseer] Final sweep error: {_e}", file=sys.stderr)

            overseer = threading.Thread(target=_oversee, daemon=True)
            overseer.start()
            # ── End Overseer ──────────────────────────────────────────────────

            if not ps_exe:
                raise RuntimeError("PowerShell executable not found (pwsh or powershell)")

            # ── Phase 2: Knowledge context injection ──────────────────────────
            # Query similar past runs and prepend [KNOWLEDGE CONTEXT] to -Instruction
            # so orchestration agents can learn from historical results.
            knowledge_ctx = ""
            if goal_text:
                try:
                    knowledge_ctx = build_knowledge_context(goal_text)
                    if knowledge_ctx:
                        _append_events([{
                            "ts": now_iso(),
                            "type": "info",
                            "message": "Knowledge context injected from similar past runs.",
                        }])
                except Exception as _kce:
                    print(f"[knowledge] Context build error: {_kce}", file=sys.stderr)
            # ── End Phase 2 Knowledge context injection ───────────────────────

            data["events"].append({"ts": now_iso(), "type": "info", "message": f"Executing {ps1.name}"})
            path.write_text(json.dumps(data, indent=2), encoding="utf-8")
            args = [ps_exe, "-NoLogo", "-File", str(ps1)]
            if run_mode == "codex-swarm":
                args += [
                    "-RepoRoot",
                    repo_root,
                    "-Goal",
                    str(goal_text),
                    "-Model",
                    manifest.get("model") or DEFAULT_MODEL,
                    "-OutputDir",
                    str(out_dir),
                ]
            else:
                args += [
                    "-Goal", str(goal_text),
                    "-Model", manifest.get("model") or DEFAULT_MODEL,
                ]
                if manifest.get("job_type"):
                    args += ["-JobType", str(manifest.get("job_type"))]
                if manifest.get("app_type"):
                    args += ["-AppType", str(manifest.get("app_type"))]
                if manifest.get("request_path"):
                    args += ["-RequestPath", str(manifest.get("request_path"))]
                if manifest.get("contract_path"):
                    args += ["-ContractPath", str(manifest.get("contract_path"))]
                notes = manifest.get("notes")
                resume_context = manifest.get("resume_context")
                instruction_parts = [p for p in [knowledge_ctx, resume_context, notes] if p]
                if instruction_parts:
                    args += ["-Instruction", "\n\n".join(instruction_parts)]
                args += [
                    "-OutputDir", str(out_dir),
                ]
            data.setdefault("events", []).append({
                "ts": now_iso(),
                "type": "debug",
                "message": f"Prepared orchestration run with script {ps1} and args {args}",
            })
            path.write_text(json.dumps(data, indent=2), encoding="utf-8")
            if cancel_event.is_set():
                raise RuntimeError("cancelled")
            try:
                with open(log_path, "a", encoding="utf-8") as logf:
                    logf.write(f"READY TO EXECUTE: {json.dumps({'script': str(ps1), 'args': args})}\n")
                    proc = subprocess.Popen(args, stdout=logf, stderr=logf)
                    _set_orch_run_process(run_id, proc)
                    try:
                        while True:
                            if cancel_event.is_set():
                                try:
                                    proc.terminate()
                                    proc.wait(timeout=8)
                                except subprocess.TimeoutExpired:
                                    proc.kill()
                                    proc.wait(timeout=5)
                                raise RuntimeError("cancelled")

                            return_code = proc.poll()
                            if return_code is not None:
                                if return_code != 0:
                                    # Capture the last 4 KB of combined stdout/stderr (both were
                                    # redirected into log_path) so the error handler can surface
                                    # the actual PowerShell failure message instead of just an
                                    # opaque exit-code number.
                                    _log_tail = ""
                                    try:
                                        _log_sz = log_path.stat().st_size
                                        _read_sz = min(_log_sz, 4096)
                                        with open(log_path, "r", encoding="utf-8", errors="replace") as _lf:
                                            _lf.seek(max(0, _log_sz - _read_sz))
                                            _log_tail = _lf.read()
                                    except Exception:
                                        pass
                                    raise subprocess.CalledProcessError(
                                        return_code, args, output=_log_tail.encode("utf-8", errors="replace")
                                    )
                                break
                            time.sleep(0.5)
                    finally:
                        _set_orch_run_process(run_id, None)
            finally:
                # Always stop background threads when the subprocess exits, whether it
                # succeeded, failed, or was cancelled.  Without this guard the poller
                # thread keeps calling _ingest_status_file every second, and the overseer
                # thread keeps appending events — both after the run is already marked
                # failed — producing duplicate/phantom entries in the manifest.
                stop_event.set()
                poller.join(timeout=2.0)
                overseer.join(timeout=6.0)  # slightly longer — overseer does a final manifest sweep
                processed_status = _ingest_status_file(status_file, processed_status)
            if cancel_event.is_set():
                raise RuntimeError("cancelled")

            # ── Phase 1 Verifier ──────────────────────────────────────────────
            # Evaluates each acceptance check from the proposal against the
            # run_dir output files. Runs after Overseer so reclassifications
            # are already applied. Writes sandbox_report.json.
            def _verify():
                checks_to_run = list(req.acceptance_checks or [])
                mandatory_contract_check = (
                    "Conceptual Model Contract must be strict JSON, machine-falsifiable, and fully traceable in Engineer output."
                )
                if mandatory_contract_check not in checks_to_run:
                    checks_to_run.append(mandatory_contract_check)

                sandbox_report_path = out_dir / "sandbox_report.json"

                def _parse_agent_json(agent_name: str) -> Optional[Dict[str, Any]]:
                    return _parse_agent_json_from_run_dir(out_dir, agent_name)

                def _eval_commissioner_score():
                    d = _parse_agent_json("Commissioner")
                    if d is None:
                        return "deferred", "Commissioner output not found", {}
                    return _evaluate_commissioner_decision(d)

                def _eval_critic_blockers():
                    d = _parse_agent_json("Critic")
                    if d is None:
                        return "deferred", "Critic output not found", {}
                    blockers = d.get("blockers", [])
                    if isinstance(blockers, list) and len(blockers) > 0:
                        return (
                            "failed",
                            f"{len(blockers)} blocker(s): {'; '.join(str(b) for b in blockers[:3])}",
                            {"blockers": blockers},
                        )
                    return "passed", "No blockers found in Critic output", {"blockers": []}

                def _eval_reviewgate():
                    d = _parse_agent_json("ReviewGate")
                    if d is None:
                        return "deferred", "ReviewGate output not found", {}
                    status = d.get("status", "")
                    errors = d.get("errors", [])
                    if status == "error" or (isinstance(errors, list) and len(errors) > 0):
                        return (
                            "failed",
                            f"ReviewGate status: {status!r}. Errors: {'; '.join(str(e) for e in errors[:2])}",
                            {"status": status, "errors": errors},
                        )
                    return "passed", f"ReviewGate passed (status: {status or 'ok'})", {"status": status}

                def _eval_agent_completion():
                    if not status_file.exists():
                        return "deferred", "agent_status.json not found", {}
                    try:
                        lines = status_file.read_text(encoding="utf-8").splitlines()
                        agent_latest: Dict[str, str] = {}
                        for line in lines:
                            line = line.strip()
                            if not line:
                                continue
                            try:
                                rec = json.loads(line)
                                name = rec.get("agent")
                                if name:
                                    agent_latest[name] = rec.get("status", "unknown")
                            except json.JSONDecodeError:
                                continue
                        incomplete = [n for n, s in agent_latest.items() if s != "complete"]
                        if incomplete:
                            return (
                                "failed",
                                f"Agents not complete: {', '.join(incomplete)}",
                                {"incomplete": incomplete, "all": agent_latest},
                            )
                        return "passed", f"All {len(agent_latest)} agents completed", {"agents": agent_latest}
                    except Exception as _e:
                        return "deferred", f"Error reading agent_status.json: {_e}", {}

                def _eval_synthesis_present():
                    if (out_dir / "Final_Synthesis.html").exists():
                        return "passed", "Final_Synthesis.html is present", {"file": "Final_Synthesis.html"}
                    if (out_dir / "Final_Synthesis.txt").exists():
                        return "passed", "Final_Synthesis.txt is present", {"file": "Final_Synthesis.txt"}
                    return "failed", "No Final_Synthesis output found in run directory", {}

                def _eval_conceptual_model_contract():
                    contract = _parse_agent_json("ConceptualModelContract")
                    if contract is None:
                        return "failed", "ConceptualModelContract output not found", {}

                    clarification_request = str(contract.get("clarification_request") or "").strip()
                    if clarification_request:
                        packet = _build_requirements_request_packet(
                            {
                                "summary": "ConceptualModelContract requested additional requirements before implementation can continue.",
                                "blockers": [
                                    {
                                        "id": "req_1",
                                        "question": clarification_request,
                                        "why": "Required to convert intent into machine-verifiable acceptance criteria.",
                                    }
                                ],
                            }
                        )
                        return (
                            "needs_requirements",
                            f"ConceptualModelContract requested clarification: {clarification_request}",
                            {
                                "requirements_request": packet,
                                "blocking_agent": "ConceptualModelContract",
                                "clarification_request": clarification_request,
                            },
                        )

                    contract_errors = _validate_conceptual_model_contract(contract)
                    if contract_errors:
                        return (
                            "failed",
                            f"ConceptualModelContract invalid: {contract_errors[0]}",
                            {"errors": contract_errors},
                        )

                    engineer = _parse_agent_json("Engineer")
                    if engineer is None:
                        return "failed", "Engineer output not found for traceability validation", {}

                    traceability_errors = _validate_engineer_contract_traceability(engineer, contract)
                    if traceability_errors:
                        return (
                            "failed",
                            f"Engineer Contract Traceability invalid: {traceability_errors[0]}",
                            {"errors": traceability_errors},
                        )

                    return "passed", "ConceptualModelContract and Engineer traceability passed", {}

                EVALUATOR_MAP = {
                    "commissioner_score": _eval_commissioner_score,
                    "critic_blockers": _eval_critic_blockers,
                    "reviewgate_status": _eval_reviewgate,
                    "agent_completion": _eval_agent_completion,
                    "synthesis_present": _eval_synthesis_present,
                    "conceptual_model_contract": _eval_conceptual_model_contract,
                }

                def _pick_evaluator(check_text: str) -> str:
                    text = check_text.lower()
                    if any(k in text for k in ("commissioner", "value score", "score ≥", "score >=")):
                        return "commissioner_score"
                    if any(k in text for k in ("blocker", "high-severity", "high severity", "critical finding")):
                        return "critic_blockers"
                    if any(k in text for k in ("review gate", "reviewgate", "schema", "output schema")):
                        return "reviewgate_status"
                    if any(k in text for k in ("all agent", "agents complete", "agent completion")):
                        return "agent_completion"
                    if any(k in text for k in ("synthesis", "output present", "deliverable", "final output")):
                        return "synthesis_present"
                    if any(k in text for k in ("conceptual model contract", "traceability", "observableevidence", "acceptance_tests")):
                        return "conceptual_model_contract"
                    return "deferred_code_execution"  # needs Phase 4

                results = []
                for check_text in checks_to_run:
                    evaluator_key = _pick_evaluator(check_text)
                    evaluator_fn = EVALUATOR_MAP.get(evaluator_key)
                    if evaluator_fn is None:
                        results.append({
                            "check": check_text,
                            "evaluator": evaluator_key,
                            "result": "deferred",
                            "details": "Requires code execution — deferred to Phase 4 (Artifact Pipeline).",
                            "data": {},
                        })
                        continue
                    try:
                        v_result, v_details, v_data = evaluator_fn()
                    except Exception as _e:
                        v_result, v_details, v_data = "deferred", f"Evaluator error: {_e}", {}
                    results.append({
                        "check": check_text,
                        "evaluator": evaluator_key,
                        "result": v_result,
                        "details": v_details,
                        "data": v_data,
                    })

                n_passed  = sum(1 for r in results if r["result"] == "passed")
                n_failed  = sum(1 for r in results if r["result"] == "failed")
                n_needs_requirements = sum(1 for r in results if r["result"] == "needs_requirements")
                n_deferred = sum(1 for r in results if r["result"] == "deferred")
                commissioner_hard_fail = any(
                    r.get("evaluator") == "commissioner_score"
                    and r.get("result") == "failed"
                    and isinstance(r.get("data"), dict)
                    and str(cast(Dict[str, Any], r.get("data", {})).get("commissioner_decision") or "") == "hard_fail"
                    for r in results
                )
                requirements_request = next(
                    (
                        cast(Dict[str, Any], r.get("data", {})).get("requirements_request")
                        for r in results
                        if r.get("result") == "needs_requirements" and isinstance(r.get("data"), dict)
                    ),
                    None,
                )

                if commissioner_hard_fail:
                    v_status = "failed"
                elif n_needs_requirements > 0:
                    v_status = "needs_requirements"
                elif n_failed > 0:
                    v_status = "failed"
                elif n_passed > 0 and n_deferred == 0:
                    v_status = "passed"
                elif n_passed > 0:
                    v_status = "partial"
                else:
                    v_status = "deferred"

                sandbox_report = {
                    "generated_at": now_iso(),
                    "verification_status": v_status,
                    "loop_iteration": 0,
                    "checks": results,
                    "passed_count": n_passed,
                    "failed_count": n_failed,
                    "needs_requirements_count": n_needs_requirements,
                    "deferred_count": n_deferred,
                    "requirements_request": requirements_request,
                }
                try:
                    sandbox_report_path.write_text(json.dumps(sandbox_report, indent=2), encoding="utf-8")
                except Exception as _e:
                    print(f"[verifier] Failed to write sandbox_report.json: {_e}", file=sys.stderr)

                _append_events([{
                    "ts": now_iso(),
                    "type": f"verify:{v_status}",
                    "message": (
                        f"Verification {v_status}: {n_passed} passed, {n_failed} failed, "
                        f"{n_needs_requirements} needs_requirements, {n_deferred} deferred "
                        f"out of {len(results)} check(s)."
                    ),
                }])
                _update_manifest(lambda d: {
                    **d,
                    "verification_status": v_status,
                    "sandbox_report": sandbox_report,
                    "requirements_request": requirements_request,
                })

            _verify()
            # ── End Phase 1 Verifier ──────────────────────────────────────────

            # ── Phase 2: Knowledge ingestion ──────────────────────────────────
            # Runs after _verify() so sandbox_report data is in the manifest.
            try:
                ingest_run_knowledge(run_id, out_dir, path)
            except Exception as _ke:
                print(f"[knowledge] Post-run ingestion error: {_ke}", file=sys.stderr)
            # ── End Phase 2 Knowledge ingestion ──────────────────────────────
            if cancel_event.is_set():
                raise RuntimeError("cancelled")

            # Try to populate final_synthesis from various sources
            final_synthesis_text = None
            
            # First try Final_Synthesis.txt (legacy location)
            if final_synthesis.exists():
                try:
                    final_synthesis_text = final_synthesis.read_text(encoding="utf-8")
                except Exception as e:
                    print(f"[orchestrate] Failed to read Final_Synthesis.txt: {e}", file=sys.stderr)
            
            # If not found, try orchestration-summary.json from run_dir
            if not final_synthesis_text:
                orchestration_summary = out_dir / "orchestration-summary.json"
                if orchestration_summary.exists():
                    try:
                        summary_data = safe_json_load(orchestration_summary, context=f"final_synthesis:{run_id}")
                        if summary_data is not None:
                            # Format the summary as readable text
                            summary_lines = [
                                f"Goal: {summary_data.get('Goal', 'N/A')}",
                                f"Status: {summary_data.get('Status', 'N/A')}",
                                f"Model: {summary_data.get('Model', 'N/A')}",
                                f"Duration: {summary_data.get('DurationSeconds', 'N/A')} seconds",
                                f"Milestones: {summary_data.get('CompletedMilestones', 0)}/{summary_data.get('MilestonesCount', 0)} completed",
                            ]
                            final_synthesis_text = "\n".join(summary_lines)
                    except Exception as e:
                        print(f"[orchestrate] Failed to read orchestration-summary.json: {e}", file=sys.stderr)
            
            # Update manifest with final synthesis if found
            if final_synthesis_text:
                try:
                    _update_manifest(lambda d: {**d, "final_synthesis": final_synthesis_text})
                except Exception as e:
                    print(f"[orchestrate] Failed to update manifest with final synthesis: {e}", file=sys.stderr)

            # Materialize concrete app files from Engineer output when possible.
            try:
                generated_app_files = _materialize_engineer_artifacts(out_dir)
            except Exception as e:
                generated_app_files = []
                print(f"[orchestrate] Failed to materialize Engineer artifacts: {e}", file=sys.stderr)
            if generated_app_files:
                app_production = None
                app_production_repairs = None
                generated_root = out_dir / "generated_app"
                if ORCHESTRATOR_LOGGING_AVAILABLE and generated_root.exists():
                    try:
                        generated_logs_dir = out_dir / "logs" / "generated_app"
                        verifier = OrchestratorVerifier(generated_root, log_dir=generated_logs_dir)
                        install_result = verifier.verify_install()
                        install_failed = isinstance(install_result, dict) and not bool(install_result.get("passed"))
                        gate_results = {
                            "install_result": install_result,
                            "lint_result": (
                                _make_skipped_gate_result("Lint skipped because dependency installation failed.")
                                if install_failed else verifier.verify_lint()
                            ),
                            "build_result": (
                                _make_skipped_gate_result("Build skipped because dependency installation failed.")
                                if install_failed else verifier.verify_build()
                            ),
                            "unit_test_result": (
                                _make_skipped_gate_result("Unit tests skipped because dependency installation failed.")
                                if install_failed else verifier.verify_unit_tests()
                            ),
                            "smoke_test_result": (
                                _make_skipped_gate_result("Smoke tests skipped because dependency installation failed.")
                                if install_failed else verifier.verify_smoke_tests()
                            ),
                            "dev_server_result": (
                                _make_skipped_gate_result("Dev server proof skipped because dependency installation failed.")
                                if install_failed else verifier.verify_dev_server()
                            ),
                            "docker_compose_valid": verifier.verify_docker_compose(),
                        }
                        app_production = _summarize_app_production_gates(gate_results, out_dir, generated_root)
                        json_path, md_path = _write_app_production_artifacts(out_dir, app_production)
                        app_production["report_artifact"] = _to_relpath(json_path, out_dir)
                        app_production["summary_artifact"] = _to_relpath(md_path, out_dir)
                        app_production_repairs = _derive_app_production_repair_plan(app_production)
                        if app_production_repairs.get("items"):
                            repair_json_path, repair_md_path = _write_app_production_repair_artifacts(out_dir, app_production_repairs)
                            app_production_repairs["report_artifact"] = _to_relpath(repair_json_path, out_dir)
                            app_production_repairs["summary_artifact"] = _to_relpath(repair_md_path, out_dir)
                    except Exception as e:
                        print(f"[orchestrate] Failed to verify generated_app artifacts: {e}", file=sys.stderr)

                _append_events([{
                    "ts": now_iso(),
                    "type": "artifact:generated_app",
                    "message": f"Generated {len(generated_app_files)} app file(s) under generated_app/.",
                }])
                if app_production:
                    _append_events([{
                        "ts": now_iso(),
                        "type": "verify:generated_app",
                        "message": (
                            f"Generated app verification {app_production['status']}: "
                            f"{app_production['passed_count']} passed, "
                            f"{app_production['failed_count']} failed, "
                            f"{app_production['skipped_count']} skipped."
                        ),
                    }])
                if app_production_repairs and app_production_repairs.get("items"):
                    _append_events([{
                        "ts": now_iso(),
                        "type": "repair:generated_app_route",
                        "message": (
                            f"Generated app repair routing prepared {len(app_production_repairs['items'])} target(s)."
                        ),
                    }])
                _update_manifest(lambda d: {
                    **d,
                    "generated_app_files": generated_app_files,
                    "app_production": app_production or d.get("app_production"),
                    "app_production_repairs": app_production_repairs or d.get("app_production_repairs"),
                })

            data = safe_json_load(path, context=f"execute_complete:{run_id}")
            verification_status = str(data.get("verification_status") or "").strip().lower()
            if verification_status in {"needs_requirements", "blocked_requirements"}:
                data["status"] = "blocked_requirements"
                completion_message = "blocked_requirements"
            else:
                data["status"] = "completed"
                completion_message = "completed"
            data["completed_at"] = now_iso()
            data.setdefault("events", []).append({"ts": data["completed_at"], "type": "status", "message": completion_message})
            path.write_text(json.dumps(data, indent=2), encoding="utf-8")
            
            # Log artifact manifest and run verification if logger is available
            if orch_logger:
                try:
                    # Collect generated files
                    generated_files = []
                    if out_dir.exists():
                        for file_path in out_dir.rglob("*"):
                            if file_path.is_file() and file_path.name not in ["run.json", "steps.jsonl", "decisions.jsonl", "conflicts.jsonl"]:
                                try:
                                    generated_files.append({
                                        "path": str(file_path.relative_to(out_dir)),
                                        "sha256": compute_file_hash(file_path),
                                        "size_bytes": file_path.stat().st_size,
                                    })
                                except Exception:
                                    pass
                    
                    # Detect stacks
                    detected = detect_stacks(out_dir)
                    
                    # Find entrypoints
                    entrypoints = []
                    for common_entry in ["main.py", "index.js", "app.py", "server.js", "index.html"]:
                        if (out_dir / common_entry).exists():
                            entrypoints.append(common_entry)
                    
                    # Log artifact manifest
                    orch_logger.log_artifact_manifest(
                        files=generated_files,
                        detected_stacks=detected,
                        entrypoints_found=entrypoints,
                        warnings=[],
                    )
                    
                    # Run verification (optional)
                    try:
                        verifier = OrchestratorVerifier(out_dir)
                        verification_results = verifier.run_all_verifications()
                        orch_logger.log_verification(**verification_results)
                    except Exception as verify_err:
                        logger.warning(f"Verification failed: {verify_err}")
                        
                except Exception as log_err:
                    logger.warning(f"Failed to log artifacts/verification: {log_err}")
            
            elapsed_ms = (time.time() - start_time) * 1000
            logger.info(f"Orchestration run {run_id} completed in {elapsed_ms:.2f}ms")
            
        except Exception as exc:
            is_cancelled = str(exc).strip().lower() == "cancelled"
            if is_cancelled:
                try:
                    data = safe_json_load(path, default={}, context=f"execute_cancelled:{run_id}")
                    data["status"] = "cancelled"
                    data["completed_at"] = now_iso()
                    data.setdefault("events", []).append({"ts": data["completed_at"], "type": "status", "message": "cancelled"})
                    data.setdefault("events", []).append({"ts": data["completed_at"], "type": "info", "message": "Run cancelled during execution."})
                    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
                except Exception as e:
                    print(f"[orchestrate] Failed to write cancelled state to manifest: {e}", file=sys.stderr)
            else:
                # When the subprocess exited non-zero, CalledProcessError.output holds the
                # last 4 KB of the script's combined stdout+stderr (captured above).
                # Decode it and attach to the error so operators can read the root cause
                # directly from the manifest instead of hunting through log files.
                error_log_tail = ""
                if isinstance(exc, subprocess.CalledProcessError) and exc.output:
                    try:
                        raw = exc.output if isinstance(exc.output, str) else exc.output.decode("utf-8", errors="replace")
                        error_log_tail = raw.strip()[-3000:]  # cap at 3000 chars for manifest size
                    except Exception:
                        pass
                exit_code_str = f" (exit code {exc.returncode})" if isinstance(exc, subprocess.CalledProcessError) else ""
                error_detail = f"orchestrator failed{exit_code_str}: {exc}"
                if error_log_tail:
                    error_detail = f"{error_detail}\n\n--- Script output (last 4 KB) ---\n{error_log_tail}"
                print(f"[orchestrate] {error_detail}", file=sys.stderr)
                try:
                    _append_events(
                        [{"ts": now_iso(), "type": "error", "message": error_detail, "error_detail": str(exc), "traceback": str(type(exc).__name__)}]
                    )
                    data = safe_json_load(path, default={}, context=f"execute_error:{run_id}")
                    data["status"] = f"error:{type(exc).__name__}"
                    data["completed_at"] = now_iso()
                    data["error_detail"] = str(exc)
                    if error_log_tail:
                        data["error_log_tail"] = error_log_tail
                    data["last_step"] = "orchestrator execution"
                    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
                except Exception as e:
                    print(f"[orchestrate] Failed to write error state to manifest: {e}", file=sys.stderr)
        finally:
            heartbeat_stop.set()
            if heartbeat_thread is not None:
                heartbeat_thread.join(timeout=2.0)
            try:
                data = safe_json_load(path, default={}, context=f"execute_finally:{run_id}")
                status_value = str(data.get("status") or "").strip().lower()
                if status_value == "stuck":
                    _release_run_lease(path, reason="stale_lease_detected")
                elif status_value in ORCH_TERMINAL_STATUSES:
                    _release_run_lease(path, reason=f"terminal:{status_value}")
            except Exception:
                pass

    disable_exec = os.environ.get("PROMPT_API_DISABLE_ORCHESTRATION_EXEC") == "1" or bool(
        os.environ.get("PYTEST_CURRENT_TEST")
    )
    if not disable_exec:
        future = _orch_run_executor.submit(_execute, path, manifest, cancel_event)
        with _orch_run_state_lock:
            state = _orch_run_state.get(run_id, {})
            state["future"] = future
            _orch_run_state[run_id] = state

        def _cleanup_state(_future: Future) -> None:
            with _orch_run_state_lock:
                _orch_run_state.pop(run_id, None)

        future.add_done_callback(_cleanup_state)
    else:
        with _orch_run_state_lock:
            _orch_run_state.pop(run_id, None)

    return {"run_id": run_id, "manifest": manifest}


def _select_prompt_id(task: Dict[str, Any]) -> Optional[str]:
    prompts = task.get("prompts")
    if isinstance(prompts, list):
        for entry in prompts:
            if isinstance(entry, dict) and entry.get("id"):
                return str(entry.get("id"))
    supervisor = task.get("supervisor") or {}
    if supervisor.get("prompt_id"):
        return str(supervisor.get("prompt_id"))
    return None


def process_orchestrator_queue(limit: int = 5, run_mode: Optional[str] = None) -> Dict[str, Any]:
    """Process queued orchestrator tasks by dispatching them to the orchestrate_run stub."""
    processed: List[Dict[str, Any]] = []
    queue = load_task_queue()
    for task in queue:
        if task.get("status") not in ("queued", "pending"):
            continue
        task_id = task.get("id")
        if not task_id:
            continue
        update_task_queue(task_id, {"status": "running", "started_at": now_iso()})
        try:
            prompt_id = _select_prompt_id(task)
            if not prompt_id:
                raise ValueError("task missing prompt id")
            supervisor = task.get("supervisor") or {}
            goal = supervisor.get("objective") or supervisor.get("task") or prompt_id
            notes = supervisor.get("notes")
            model = supervisor.get("model")
            run_mode_value = run_mode or task.get("run_mode") or supervisor.get("run_mode") or "default"
            run_req = OrchestrationRequest(
                prompt_id=prompt_id,
                goal=goal,
                notes=notes,
                model=model,
                run_mode=run_mode_value,
                repo_root=task.get("repo_root"),
            )
            res = orchestrate_run(run_req)
            run_id = cast(str, res.get("run_id"))
            manifest = res.get("manifest")
            update_task_queue(
                task_id,
                {
                    "status": "dispatched",
                    "run_id": run_id,
                    "manifest": manifest,
                    "updated_at": now_iso(),
                },
            )
            processed.append({"task_id": task_id, "run_id": run_id, "status": "dispatched"})
        except Exception as exc:
            update_task_queue(task_id, {"status": f"error:{exc}", "error": str(exc), "updated_at": now_iso()})
        if len(processed) >= limit:
            break
    return {"processed": len(processed), "results": processed}


@app.post("/orchestrator/tasks:process")
def process_orchestrator_tasks(
    limit: int = Query(1, ge=1, le=20),
    run_mode: Optional[str] = Query(None, description="Override run mode for processed tasks"),
    admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    _require_admin_access(admin_token)
    return process_orchestrator_queue(limit=limit, run_mode=run_mode)


# ── Phase 2: Agent Knowledge Base ────────────────────────────────────────────

_knowledge_lock = threading.Lock()


def _kb_tokenize(text: str) -> List[str]:
    """Return meaningful lowercase tokens (length > 3) from text."""
    return [t for t in re.split(r"\W+", text.lower()) if len(t) > 3]


def _kb_similarity(a: List[str], b: List[str]) -> float:
    """Jaccard-like overlap: shared tokens / max(|A|, |B|)."""
    if not a or not b:
        return 0.0
    sa, sb = set(a), set(b)
    return len(sa & sb) / max(len(sa), len(sb))


def _normalize_knowledge_status(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if raw in {"pass", "needs_info", "fail"}:
        return raw
    return "needs_info"


def _normalize_learning_payload(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    learning = dict(value)
    if not isinstance(learning.get("evidence"), list):
        learning["evidence"] = []
    if not isinstance(learning.get("prevention_patches"), list):
        learning["prevention_patches"] = []
    if not isinstance(learning.get("regression_checks"), list):
        learning["regression_checks"] = []
    if "questions_needed" in learning and not isinstance(learning.get("questions_needed"), list):
        learning["questions_needed"] = []
    if not isinstance(learning.get("corrective_actions"), list):
        learning["corrective_actions"] = []
    if not isinstance(learning.get("instruction_adjustments"), list):
        learning["instruction_adjustments"] = []
    return learning


def _derive_knowledge_status_for_entry(entry: Dict[str, Any]) -> Tuple[str, Optional[float]]:
    learning = _normalize_learning_payload(entry.get("learning"))
    evidence = [str(v).strip() for v in learning.get("evidence", []) if str(v).strip()]
    patches = [p for p in learning.get("prevention_patches", []) if isinstance(p, dict)]
    checks = [str(v).strip() for v in learning.get("regression_checks", []) if str(v).strip()]
    root_cause = str(learning.get("root_cause") or "").strip()
    what_broke = str(learning.get("what_broke") or "").strip()
    classification = str(learning.get("classification") or "").strip()

    has_required_fields = bool(classification and what_broke and root_cause)
    has_prevention = len(patches) >= 1
    has_checks = len(checks) >= 1
    has_evidence = len(evidence) >= 1

    if has_required_fields and has_prevention and has_checks and has_evidence:
        score = 7.0 + min(3.0, (len(patches) * 0.8 + len(checks) * 0.5 + len(evidence) * 0.3) / 3.0)
        return "pass", round(min(10.0, score), 1)

    # needs_info means learning payload exists but evidence/diagnosis is incomplete.
    if has_required_fields or has_prevention or has_checks or has_evidence:
        return "needs_info", 4.0

    # Legacy fallback if no learning object was present.
    legacy_patches = entry.get("prevention_patches")
    if isinstance(legacy_patches, list) and len(legacy_patches) > 0:
        return "pass", 7.0
    return "needs_info", 3.0


def _migrate_knowledge_entry(entry: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
    migrated = dict(entry)
    changed = False

    learning = _normalize_learning_payload(migrated.get("learning"))
    if learning != migrated.get("learning"):
        migrated["learning"] = learning
        changed = True

    status_value, score_value = _derive_knowledge_status_for_entry(migrated)
    normalized_existing = _normalize_knowledge_status(migrated.get("knowledge_status"))
    if normalized_existing != migrated.get("knowledge_status"):
        changed = True
    if normalized_existing == "needs_info" and status_value == "pass":
        normalized_existing = "pass"
        changed = True
    if "knowledge_status" not in migrated:
        normalized_existing = status_value
        changed = True
    migrated["knowledge_status"] = normalized_existing

    if migrated.get("knowledge_score") is None and score_value is not None:
        migrated["knowledge_score"] = score_value
        changed = True

    return migrated, changed


def _build_learning_payload(
    manifest: Dict[str, Any],
    commissioner_payload: Optional[Dict[str, Any]],
    critic_payload: Optional[Dict[str, Any]],
    researcher_payload: Optional[Dict[str, Any]],
    instruction_adjustments: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    verification_status = str(manifest.get("verification_status") or "pending").strip().lower()
    run_status = str(manifest.get("status") or "unknown").strip().lower()
    sandbox_report = manifest.get("sandbox_report") if isinstance(manifest.get("sandbox_report"), dict) else {}
    checks = sandbox_report.get("checks") if isinstance(sandbox_report.get("checks"), list) else []
    failed_checks = [c for c in checks if isinstance(c, dict) and str(c.get("result") or "").lower() == "failed"]
    deferred_checks = [c for c in checks if isinstance(c, dict) and str(c.get("result") or "").lower() == "deferred"]
    checkpoint_history = _normalize_checkpoint_history(manifest)
    corrective_actions = _build_corrective_actions_from_manifest(manifest)
    app_production_repairs_payload = manifest.get("app_production_repairs") if isinstance(manifest.get("app_production_repairs"), dict) else {}
    app_production_repairs = app_production_repairs_payload.get("items") if isinstance(app_production_repairs_payload.get("items"), list) else []
    normalized_instruction_adjustments = [
        adjustment
        for adjustment in (instruction_adjustments or [])
        if isinstance(adjustment, dict) and str(adjustment.get("suggestion") or "").strip()
    ]

    if verification_status in {"needs_requirements", "blocked_requirements"}:
        classification = "requirements_gap"
    elif verification_status == "failed":
        classification = "verification_gate_failure"
    elif verification_status == "deferred":
        classification = "evidence_deferred"
    elif run_status.startswith("error") or run_status == "failed":
        classification = "execution_failure"
    else:
        classification = "general_learning"

    evidence: List[str] = []
    for check in failed_checks[:3]:
        evidence.append(f"failed_check:{check.get('evaluator')}:{check.get('details')}")
    for check in deferred_checks[:2]:
        evidence.append(f"deferred_check:{check.get('evaluator')}:{check.get('details')}")
    requirements_request = manifest.get("requirements_request")
    if isinstance(requirements_request, dict):
        blockers = requirements_request.get("blockers")
        if isinstance(blockers, list) and blockers:
            evidence.append(f"requirements_request_blockers:{len(blockers)}")
    if checkpoint_history:
        evidence.append(f"checkpoint_history:{len(checkpoint_history)}")
    if corrective_actions:
        evidence.append(f"corrective_actions:{len(corrective_actions)}")
        for action in corrective_actions[:2]:
            evidence.append(f"checkpoint_resolved:{action.get('agent')}:{action.get('status')}")
    if app_production_repairs:
        evidence.append(f"app_production_repairs:{len(app_production_repairs)}")
        for repair in app_production_repairs[:2]:
            if isinstance(repair, dict):
                evidence.append(f"repair_target:{repair.get('gate')}:{repair.get('agent')}")
    for adjustment in normalized_instruction_adjustments[:2]:
        evidence.append(f"instruction_adjustment:{adjustment.get('agent')}")

    events = manifest.get("events") if isinstance(manifest.get("events"), list) else []
    overseer_warnings = [
        str(ev.get("message"))
        for ev in events
        if isinstance(ev, dict)
        and (
            str(ev.get("type") or "").startswith("overseer:warn")
            or str(ev.get("type") or "").startswith("overseer:critical")
        )
    ]
    evidence.extend(overseer_warnings[:3])

    critic_blockers = []
    if isinstance(critic_payload, dict):
        raw_blockers = critic_payload.get("blockers")
        if isinstance(raw_blockers, list):
            critic_blockers = [str(v) for v in raw_blockers if str(v).strip()]
            evidence.extend([f"critic_blocker:{b}" for b in critic_blockers[:2]])

    if isinstance(commissioner_payload, dict):
        score = commissioner_payload.get("value_score")
        if score is not None:
            evidence.append(f"commissioner_score:{score}")
        recommendation = commissioner_payload.get("recommendation")
        if recommendation:
            evidence.append(f"commissioner_recommendation:{recommendation}")

    researcher_facts: List[str] = []
    if isinstance(researcher_payload, dict):
        facts = researcher_payload.get("facts")
        if isinstance(facts, list):
            researcher_facts = [str(v) for v in facts if str(v).strip()]

    if classification == "requirements_gap":
        what_broke = "Requirements were incomplete for machine-verifiable implementation."
        root_cause = "Commissioner detected unresolved requirement gaps and requested follow-up inputs."
    elif classification == "verification_gate_failure":
        what_broke = "One or more verification gates failed after orchestration execution."
        root_cause = "Agent outputs did not satisfy required schema/traceability checks."
    elif classification == "evidence_deferred":
        what_broke = "Verification could not complete due to deferred code-execution checks."
        root_cause = "Evidence pipeline lacked executable validation for at least one acceptance check."
    elif classification == "execution_failure":
        what_broke = "Execution ended with runtime or orchestration errors."
        root_cause = "Runtime pipeline failed before all expected artifacts/checks were produced."
    else:
        what_broke = "Run completed with reusable learnings."
        root_cause = "Process produced actionable patterns worth preserving."

    prevention_patches: List[Dict[str, Any]] = []
    regression_checks: List[str] = []
    questions_needed: List[str] = []

    if classification == "requirements_gap":
        prevention_patches.append(
            {
                "target": "commissioner_evaluator",
                "change": "Route incomplete requirements to needs_requirements with structured blockers instead of failed.",
                "artifact_ref": "sandbox_report.requirements_request",
            }
        )
        prevention_patches.append(
            {
                "target": "concierge_ui",
                "change": "Render blockers as concise follow-up questions with defaults for fast-path responses.",
                "artifact_ref": "requirements_request.blockers",
            }
        )
        regression_checks.append("Commissioner low-score + resolvable blockers yields verification_status=needs_requirements")
        regression_checks.append("Concierge receives blockers/questions payload and keeps run non-failure")
    elif classification == "verification_gate_failure":
        prevention_patches.append(
            {
                "target": "agent_prompt_contracts",
                "change": "Enforce strict JSON output and required traceability fields before finalization.",
            }
        )
        regression_checks.append("Failing gate details include evaluator + actionable fix text")
    elif classification == "evidence_deferred":
        prevention_patches.append(
            {
                "target": "verification_pipeline",
                "change": "Add executable probes or simulation harness for deferred acceptance checks.",
            }
        )
        regression_checks.append("Deferred checks are surfaced with explicit next-action guidance")
    elif classification == "execution_failure":
        prevention_patches.append(
            {
                "target": "runtime_supervision",
                "change": "Improve liveness monitoring and failure diagnostics around worker execution.",
            }
        )
        regression_checks.append("Runtime errors create actionable blocker summary and repair path")
    else:
        prevention_patches.append(
            {
                "target": "playbook",
                "change": "Preserve successful run pattern for future similar goals.",
            }
        )
        regression_checks.append("Knowledge context includes top similar runs with actionable guidance")

    if corrective_actions:
        prevention_patches.append(
            {
                "target": "operator_run_history",
                "change": "Persist resolved requirements checkpoints and answers as part of the run's corrective-action trail.",
                "artifact_ref": "checkpoints[]",
            }
        )
        regression_checks.append("Run history shows answered requirements checkpoints and resume lineage")

    if normalized_instruction_adjustments:
        prevention_patches.append(
            {
                "target": "learning_agent",
                "change": "Carry minor agent instruction adjustments forward for similar future runs instead of relearning the same repair.",
                "artifact_ref": "agent_improvements.json",
            }
        )
        regression_checks.append("Knowledge context includes instruction adjustments for similar runs")
    if app_production_repairs:
        prevention_patches.append(
            {
                "target": "app_production_loop",
                "change": "Preserve structured repair targets for failed generated-app gates so future runs inherit root-cause-aware repair guidance.",
                "artifact_ref": "app_production_repairs.items",
            }
        )
        regression_checks.append("Generated-app failures emit structured repair targets with root-cause ordering")

    if not evidence:
        questions_needed.append("Provide concrete evidence (logs/checks/events) supporting the inferred root cause.")

    return {
        "classification": classification,
        "what_broke": what_broke,
        "root_cause": root_cause,
        "evidence": evidence,
        "prevention_patches": prevention_patches,
        "regression_checks": regression_checks,
        "questions_needed": questions_needed,
        "context_facts": researcher_facts[:3],
        "critic_blockers": critic_blockers[:3],
        "corrective_actions": corrective_actions[:5],
        "instruction_adjustments": normalized_instruction_adjustments[:5],
    }


def _build_learning_failure_payload(error_message: str) -> Dict[str, Any]:
    return {
        "classification": "knowledge_generation_failure",
        "what_broke": "Knowledge artifact generation crashed.",
        "root_cause": error_message,
        "evidence": [error_message],
        "prevention_patches": [],
        "regression_checks": [],
        "questions_needed": [],
        "corrective_actions": [],
        "instruction_adjustments": [],
    }


def _kb_load() -> List[Dict[str, Any]]:
    """Load all knowledge entries from disk (thread-safe read)."""
    with _knowledge_lock:
        if not KNOWLEDGE_DB_PATH.exists():
            return []
        try:
            loaded = json.loads(KNOWLEDGE_DB_PATH.read_text(encoding="utf-8"))
            if not isinstance(loaded, list):
                return []

            migrated_entries: List[Dict[str, Any]] = []
            changed = False
            for item in loaded:
                if not isinstance(item, dict):
                    continue
                migrated, did_change = _migrate_knowledge_entry(item)
                migrated_entries.append(migrated)
                changed = changed or did_change

            if changed:
                tmp = KNOWLEDGE_DB_PATH.with_suffix(".tmp")
                tmp.write_text(json.dumps(migrated_entries, indent=2), encoding="utf-8")
                tmp.replace(KNOWLEDGE_DB_PATH)
            return migrated_entries
        except Exception:
            return []


def _kb_save(entries: List[Dict[str, Any]]) -> None:
    """Atomically overwrite the knowledge base file (thread-safe)."""
    tmp = KNOWLEDGE_DB_PATH.with_suffix(".tmp")
    with _knowledge_lock:
        try:
            tmp.write_text(json.dumps(entries, indent=2), encoding="utf-8")
            tmp.replace(KNOWLEDGE_DB_PATH)
        except Exception as _e:
            print(f"[knowledge] Save failed: {_e}", file=sys.stderr)
            if tmp.exists():
                tmp.unlink(missing_ok=True)


def _kb_parse_agent_json(out_dir: pathlib.Path, agent_name: str) -> Optional[Dict[str, Any]]:
    return _parse_agent_json_from_run_dir(out_dir, agent_name)


def _load_agent_improvements(out_dir: pathlib.Path) -> List[Dict[str, Any]]:
    path = out_dir / "agent_improvements.json"
    if not path.exists():
        return []
    loaded = safe_json_load(path, default=[], context=f"agent_improvements:{out_dir.name}")
    if not isinstance(loaded, list):
        return []

    improvements: List[Dict[str, Any]] = []
    for item in loaded:
        if not isinstance(item, dict):
            continue
        suggestion = str(item.get("suggestion") or "").strip()
        if not suggestion:
            continue
        improvements.append(
            {
                "agent": str(item.get("agent") or "unknown").strip() or "unknown",
                "suggestion": suggestion,
                "timestamp": str(item.get("timestamp") or "").strip() or None,
                "source": str(item.get("source") or "commissioner").strip() or "commissioner",
            }
        )
    return improvements


def _normalize_checkpoint_history(manifest: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw_checkpoints = manifest.get("checkpoints")
    if not isinstance(raw_checkpoints, list):
        return []

    checkpoints: List[Dict[str, Any]] = []
    for index, item in enumerate(raw_checkpoints):
        if not isinstance(item, dict):
            continue

        answers: List[Dict[str, Any]] = []
        raw_answers = item.get("answers")
        if isinstance(raw_answers, list):
            for answer in raw_answers:
                if not isinstance(answer, dict):
                    continue
                question = str(answer.get("question") or "").strip()
                answer_text = str(answer.get("answer") or "").strip()
                blocker_id = str(answer.get("blocker_id") or answer.get("blockerId") or "").strip() or None
                if not question and not answer_text:
                    continue
                answers.append(
                    {
                        "blocker_id": blocker_id,
                        "question": question or None,
                        "answer": answer_text,
                    }
                )

        response_value = item.get("response")
        response_text = None if response_value is None else str(response_value).strip() or None
        checkpoints.append(
            {
                "id": str(item.get("id") or item.get("checkpoint_id") or f"checkpoint_{index + 1}").strip(),
                "agent": str(item.get("agent") or "unknown").strip() or "unknown",
                "question": str(item.get("question") or "").strip(),
                "options": [str(v) for v in item.get("options", [])] if isinstance(item.get("options"), list) else [],
                "default_option": str(item.get("default_option") or item.get("defaultOption") or "").strip(),
                "requested_at": str(item.get("requested_at") or item.get("requestedAt") or "").strip() or None,
                "response": response_text,
                "responded_at": str(item.get("responded_at") or item.get("respondedAt") or "").strip() or None,
                "resolved_by": str(item.get("resolved_by") or item.get("resolvedBy") or "").strip() or None,
                "status": str(item.get("status") or "").strip() or None,
                "answers": answers,
            }
        )
    return checkpoints


def _build_corrective_actions_from_manifest(manifest: Dict[str, Any]) -> List[Dict[str, Any]]:
    actions: List[Dict[str, Any]] = []
    for checkpoint in _normalize_checkpoint_history(manifest):
        response_text = str(checkpoint.get("response") or "").strip()
        answers = checkpoint.get("answers") if isinstance(checkpoint.get("answers"), list) else []
        if not response_text and not answers:
            continue

        if answers:
            summary = f"{checkpoint.get('agent')}: answered {len(answers)} requirement blocker(s) to resume execution."
        else:
            summary = f"{checkpoint.get('agent')}: resolved checkpoint and resumed execution."

        actions.append(
            {
                "type": "requirements_checkpoint",
                "agent": checkpoint.get("agent"),
                "status": checkpoint.get("status") or "answered",
                "summary": summary,
                "question": checkpoint.get("question"),
                "response": response_text or None,
                "requested_at": checkpoint.get("requested_at"),
                "responded_at": checkpoint.get("responded_at"),
                "resolved_by": checkpoint.get("resolved_by"),
                "answers": answers,
            }
        )
    return actions


def ingest_run_knowledge(run_id: str, out_dir: pathlib.Path, manifest_path: pathlib.Path) -> None:
    """
    Extract structured learning from a completed run and append it to the knowledge base.
    Called after _verify() so verification results are available in the manifest.
    """
    try:
        manifest = safe_json_load(manifest_path, default={}, context=f"knowledge_ingest:{run_id}")
        if not isinstance(manifest, dict):
            manifest = {}
        goal = manifest.get("goal") or ""
        if not goal:
            return  # goal-less runs (prompt-id only) aren't useful for knowledge

        comm = _kb_parse_agent_json(out_dir, "Commissioner")
        critic = _kb_parse_agent_json(out_dir, "Critic")
        researcher = _kb_parse_agent_json(out_dir, "Researcher")
        instruction_adjustments = _load_agent_improvements(out_dir)
        checkpoint_history = _normalize_checkpoint_history(manifest)
        corrective_actions = _build_corrective_actions_from_manifest(manifest)

        learning = _build_learning_payload(manifest, comm, critic, researcher, instruction_adjustments)
        knowledge_status, knowledge_score = _derive_knowledge_status_for_entry({"learning": learning})

        entry: Dict[str, Any] = {
            "run_id": run_id,
            "ingested_at": now_iso(),
            "goal": goal,
            "goal_tokens": _kb_tokenize(goal),
            "status": manifest.get("status", "unknown"),
            "verification_status": manifest.get("verification_status"),
            "knowledge_status": knowledge_status,
            "knowledge_score": knowledge_score,
            "learning": learning,
            "agents": manifest.get("agents", []),
            "model": manifest.get("model", ""),
            "checkpoint_history": checkpoint_history,
            "corrective_actions": corrective_actions,
            "app_production_repairs": app_production_repairs_payload,
            "instruction_adjustments": instruction_adjustments,
            "synthesis_present": (
                (out_dir / "Final_Synthesis.html").exists()
                or (out_dir / "Final_Synthesis.txt").exists()
            ),
            # Commissioner
            "commissioner_score": comm.get("value_score") if comm else None,
            "commissioner_recommendation": comm.get("recommendation") if comm else None,
            "commissioner_rationale": comm.get("rationale", "") if comm else "",
            "commissioner_improvements": comm.get("improvements", []) if comm else [],
            # Critic
            "critic_blockers": critic.get("blockers", []) if critic else [],
            "critic_ratings": critic.get("ratings", {}) if critic else {},
            # Researcher
            "researcher_facts": researcher.get("facts", [])[:5] if researcher else [],  # top 5
            # Overseer
            "overseer_warnings": [
                ev["message"]
                for ev in manifest.get("events", [])
                if ev.get("type", "").startswith("overseer:warn")
                or ev.get("type", "").startswith("overseer:critical")
            ],
            # Acceptance check summary
            "acceptance_checks_summary": {
                "passed": manifest.get("sandbox_report", {}).get("passed_count", 0),
                "failed": manifest.get("sandbox_report", {}).get("failed_count", 0),
                "deferred": manifest.get("sandbox_report", {}).get("deferred_count", 0),
            } if manifest.get("sandbox_report") else None,
        }
        if knowledge_status == "needs_info" and not learning.get("questions_needed"):
            learning["questions_needed"] = ["Confirm root cause with additional evidence from run logs or failing artifacts."]
            entry["learning"] = learning

        entries = _kb_load()
        # Replace if this run is already indexed (re-run after retry)
        entries = [e for e in entries if e.get("run_id") != run_id]
        entries.insert(0, entry)
        _kb_save(entries)
        print(
            f"[knowledge] Ingested run {run_id} (score={entry['commissioner_score']}, knowledge_status={entry['knowledge_status']})",
            file=sys.stderr,
        )
    except Exception as _e:
        print(f"[knowledge] Ingestion failed for {run_id}: {_e}", file=sys.stderr)
        try:
            fallback_manifest = safe_json_load(manifest_path, default={}, context=f"knowledge_ingest_fallback:{run_id}")
            if not isinstance(fallback_manifest, dict):
                fallback_manifest = {}
            fallback_goal = str(fallback_manifest.get("goal") or run_id).strip() or run_id
            failure_entry = {
                "run_id": run_id,
                "ingested_at": now_iso(),
                "goal": fallback_goal,
                "goal_tokens": _kb_tokenize(fallback_goal),
                "status": fallback_manifest.get("status", "unknown"),
                "verification_status": fallback_manifest.get("verification_status"),
                "knowledge_status": "fail",
                "knowledge_score": 0,
                "learning": _build_learning_failure_payload(str(_e)),
                "checkpoint_history": _normalize_checkpoint_history(fallback_manifest),
                "corrective_actions": _build_corrective_actions_from_manifest(fallback_manifest),
                "app_production_repairs": fallback_manifest.get("app_production_repairs") if isinstance(fallback_manifest.get("app_production_repairs"), dict) else {},
                "instruction_adjustments": [],
                "agents": fallback_manifest.get("agents", []),
                "model": fallback_manifest.get("model", ""),
                "synthesis_present": False,
            }
            entries = _kb_load()
            entries = [e for e in entries if e.get("run_id") != run_id]
            entries.insert(0, failure_entry)
            _kb_save(entries)
        except Exception:
            pass


def query_knowledge_similar(goal: str, limit: int = 4) -> List[Dict[str, Any]]:
    """Return up to `limit` knowledge entries with goals most similar to `goal`."""
    tokens = _kb_tokenize(goal)
    if not tokens:
        return []
    entries = _kb_load()
    scored = [
        (e, _kb_similarity(tokens, e.get("goal_tokens") or _kb_tokenize(e.get("goal", ""))))
        for e in entries
    ]
    return [
        {**e, "_similarity": round(s, 3)}
        for e, s in sorted(scored, key=lambda x: -x[1])
        if s >= 0.2
    ][:limit]


def build_knowledge_context(goal: str) -> str:
    """
    Build a [KNOWLEDGE CONTEXT] block to prepend to the -Instruction parameter
    so orchestration agents can learn from past runs.
    Returns empty string if no relevant history exists.
    """
    similar = query_knowledge_similar(goal, limit=3)
    if not similar:
        return ""

    lines = [
        "[KNOWLEDGE CONTEXT FROM SIMILAR PAST RUNS]",
        "The following historical runs are relevant to your goal.",
        "Apply these learnings to improve output quality.",
        "",
    ]
    for i, e in enumerate(similar, 1):
        pct = round(e["_similarity"] * 100)
        lines.append(f"Run {i} ({pct}% match): \"{e['goal'][:120]}\"")
        score = e.get("commissioner_score")
        rec = e.get("commissioner_recommendation", "")
        if score is not None:
            lines.append(f"  Commissioner: {score}/10 ({rec})")
        rationale = e.get("commissioner_rationale", "")
        if rationale:
            lines.append(f"  Rationale: {rationale[:200]}")
        blockers = e.get("critic_blockers", [])
        if blockers:
            lines.append(f"  Critic blockers: {'; '.join(str(b) for b in blockers[:2])}")
        improvements = e.get("commissioner_improvements", [])
        if improvements:
            lines.append(f"  Required improvements: {'; '.join(str(v) for v in improvements[:2])}")
        repair_targets = (
            e.get("app_production_repairs", {}).get("items")
            if isinstance(e.get("app_production_repairs"), dict)
            else []
        )
        if isinstance(repair_targets, list) and repair_targets:
            first_target = repair_targets[0]
            if isinstance(first_target, dict):
                lines.append(
                    "  App-production repair: "
                    f"{str(first_target.get('gate') or 'gate')} -> {str(first_target.get('agent') or 'Engineer')}"
                )
        warnings = e.get("overseer_warnings", [])
        if warnings:
            lines.append(f"  Overseer warnings: {warnings[0][:150]}")
        raw_corrective_actions = e.get("corrective_actions") if isinstance(e.get("corrective_actions"), list) else []
        corrective_actions = [
            str(action.get("summary") or "").strip()
            for action in raw_corrective_actions
            if isinstance(action, dict) and str(action.get("summary") or "").strip()
        ]
        if corrective_actions:
            lines.append(f"  Corrective actions: {'; '.join(corrective_actions[:2])[:220]}")
        instruction_adjustments = []
        raw_instruction_adjustments = e.get("instruction_adjustments") if isinstance(e.get("instruction_adjustments"), list) else []
        for adjustment in raw_instruction_adjustments:
            if not isinstance(adjustment, dict):
                continue
            suggestion = str(adjustment.get("suggestion") or "").strip()
            if not suggestion:
                continue
            agent_name = str(adjustment.get("agent") or "unknown").strip() or "unknown"
            instruction_adjustments.append(f"{agent_name}: {suggestion}")
        if instruction_adjustments:
            lines.append(f"  Instruction adjustments: {'; '.join(instruction_adjustments[:2])[:220]}")
        lines.append("")
    lines.append("[END KNOWLEDGE CONTEXT — address the patterns above in this run]")
    return "\n".join(lines)


def get_run_dna() -> List[Dict[str, Any]]:
    """
    Aggregate knowledge base entries into performance stats per agent configuration.
    Returns list of { agent_config, avg_score, run_count, goal_examples }.
    """
    entries = _kb_load()
    buckets: Dict[str, Dict[str, Any]] = {}
    for e in entries:
        score = e.get("commissioner_score")
        if score is None:
            continue
        config_key = "|".join(sorted(e.get("agents") or []))
        if not config_key:
            continue
        if config_key not in buckets:
            buckets[config_key] = {
                "agent_config": sorted(e.get("agents") or []),
                "scores": [],
                "goal_examples": [],
            }
        buckets[config_key]["scores"].append(int(score))
        if len(buckets[config_key]["goal_examples"]) < 3:
            buckets[config_key]["goal_examples"].append(e["goal"][:80])

    dna = []
    for key, b in buckets.items():
        scores = b["scores"]
        dna.append({
            "agent_config": b["agent_config"],
            "agent_config_key": key,
            "run_count": len(scores),
            "avg_score": round(sum(scores) / len(scores), 1),
            "max_score": max(scores),
            "min_score": min(scores),
            "goal_examples": b["goal_examples"],
        })
    return sorted(dna, key=lambda x: -x["avg_score"])


# ── Knowledge API endpoints ───────────────────────────────────────────────────

@app.get("/knowledge/entries")
def list_knowledge_entries(limit: int = 50):
    """Return the most recent knowledge entries."""
    return {"entries": _kb_load()[:limit], "total": len(_kb_load())}


@app.get("/knowledge/similar")
def knowledge_similar(goal: str, limit: int = 4):
    """Return knowledge entries with goals similar to the query."""
    return {"entries": query_knowledge_similar(goal, limit)}


@app.get("/knowledge/run-dna")
def knowledge_run_dna():
    """Return aggregated performance stats per agent configuration."""
    return {"dna": get_run_dna()}


@app.get("/orchestrate/runs")
def list_orchestration_runs():
    runs = []
    for f in BRIDGE_RUN_DIR.glob("*.json"):
        try:
            data = json.loads(f.read_text())
            data["run_id"] = data.get("run_id") or f.stem
            runs.append(_derive_run_runtime_fields(data))
        except Exception:
            continue
    runs = sorted(runs, key=lambda r: r.get("requested_at", ""), reverse=True)
    return {"runs": runs}


@app.get("/orchestrate/runs/limits")
def get_orchestration_queue_limits():
    """Return queue/runtime safety limits and current queue occupancy."""
    snapshot = _orchestration_queue_snapshot()
    return {
        "max_concurrent": snapshot["max_concurrent"],
        "max_queued": snapshot["max_queued"],
        "running": snapshot["running"],
        "queued": snapshot["queued"],
        "dispatching": snapshot["dispatching"],
        "stuck": snapshot["stuck"],
        "available_slots": snapshot["available_slots"],
    }


@app.get("/orchestrate/run/{run_id}")
def get_orchestration_run(run_id: str):
    path = BRIDGE_RUN_DIR / f"{run_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Run not found")
    try:
        data = safe_json_load(path, context=f"get_run:{run_id}")
        data["run_id"] = data.get("run_id") or run_id
        run_dir_value = str(data.get("run_dir") or "").strip()
        out_dir = pathlib.Path(run_dir_value) if run_dir_value else BRIDGE_RUN_DIR / run_id
        if out_dir.exists():
            data["agent_improvements"] = _load_agent_improvements(out_dir)
            if "corrective_actions" not in data:
                data["corrective_actions"] = _build_corrective_actions_from_manifest(data)
        log_path = BRIDGE_RUN_DIR / f"{run_id}.log"
        if log_path.exists():
            log_text = log_path.read_text(encoding="utf-8")
            data["log_path"] = str(log_path)
            data["log_excerpt"] = log_text[-4000:] if len(log_text) > 4000 else log_text
        return _derive_run_runtime_fields(data)
    except ValueError as exc:
        # Enhanced error for JSON parsing issues
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read run: {exc}")


@app.post("/orchestrate/run/{run_id}/cancel")
def cancel_orchestration_run(
    run_id: str,
    force: int = Query(default=0, ge=0, le=1),
    execution_token: Optional[str] = Header(default=None, alias="X-Execution-Token"),
    admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    """Cancel a single orchestration run (queued runs cancel immediately)."""
    _require_execution_access(execution_token or admin_token)
    if force == 1:
        return _force_cancel_orchestration_run_internal(run_id, reason="single_cancel_force")
    return _cancel_orchestration_run_internal(run_id, reason="single_cancel")


@app.post("/api/runs/{run_id}/cancel")
def cancel_orchestration_run_alias(
    run_id: str,
    force: int = Query(default=0, ge=0, le=1),
    execution_token: Optional[str] = Header(default=None, alias="X-Execution-Token"),
    admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    _require_execution_access(execution_token or admin_token)
    if force == 1:
        return _force_cancel_orchestration_run_internal(run_id, reason="api_alias_force_cancel")
    return _cancel_orchestration_run_internal(run_id, reason="api_alias_cancel")


@app.post("/api/runs/{run_id}/requeue")
def requeue_orchestration_run_alias(
    run_id: str,
    execution_token: Optional[str] = Header(default=None, alias="X-Execution-Token"),
    admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    _require_execution_access(execution_token or admin_token)
    return _requeue_orchestration_run_internal(run_id, reason="api_alias_requeue")


@app.post("/api/runs/release-stale-leases")
def release_stale_leases_alias(
    execution_token: Optional[str] = Header(default=None, alias="X-Execution-Token"),
    admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    _require_execution_access(execution_token or admin_token)
    return _release_stale_leases_internal()


@app.post("/orchestrate/runs/cancel")
def bulk_cancel_orchestration_runs(
    body: BulkRunCancelRequest,
    execution_token: Optional[str] = Header(default=None, alias="X-Execution-Token"),
    admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    """Cancel multiple orchestration runs by id, or cancel all queued runs."""
    _require_execution_access(execution_token or admin_token)

    requested_ids: List[str] = []
    if body.cancel_all_queued:
        queued_ids: List[str] = []
        for _, manifest in _iter_orchestration_manifests():
            run_id = str(manifest.get("run_id") or "").strip()
            status = str(manifest.get("status") or "").strip().lower()
            if run_id and status in ORCH_QUEUE_STATUSES:
                queued_ids.append(run_id)
        requested_ids = sorted(set(queued_ids))
    else:
        requested_ids = sorted({rid.strip() for rid in body.run_ids if rid and rid.strip()})

    if not requested_ids:
        return {"requested": 0, "cancelled": 0, "cancel_requested": 0, "results": []}

    results: List[Dict[str, Any]] = []
    cancelled_count = 0
    cancel_requested_count = 0
    for run_id in requested_ids:
        try:
            result = _cancel_orchestration_run_internal(run_id, reason="bulk_cancel")
            if result.get("cancelled"):
                cancelled_count += 1
            if result.get("cancel_requested"):
                cancel_requested_count += 1
            results.append(result)
        except HTTPException as exc:
            results.append(
                {
                    "run_id": run_id,
                    "status": "not_found" if exc.status_code == 404 else "error",
                    "cancelled": False,
                    "cancel_requested": False,
                    "message": str(exc.detail),
                }
            )

    return {
        "requested": len(requested_ids),
        "cancelled": cancelled_count,
        "cancel_requested": cancel_requested_count,
        "results": results,
    }


def _load_pending_checkpoint_record(
    run_id: str,
    manifest: Dict[str, Any],
    checkpoint_pending_path: pathlib.Path,
) -> Dict[str, Any]:
    if checkpoint_pending_path.exists():
        pending = safe_json_load(checkpoint_pending_path, default={}, context="checkpoint_pending")
        if isinstance(pending, dict):
            return pending

    requirements_request = manifest.get("requirements_request")
    if isinstance(requirements_request, dict):
        blockers = requirements_request.get("blockers") if isinstance(requirements_request.get("blockers"), list) else []
        first_question = ""
        if blockers:
            first = blockers[0] if isinstance(blockers[0], dict) else {}
            first_question = str(first.get("question") or "").strip()
        if first_question:
            return {
                "checkpoint_id": f"requirements-{run_id}",
                "run_id": run_id,
                "kind": "requirements",
                "agent": "ConceptualModelContract",
                "summary": str(requirements_request.get("summary") or "").strip(),
                "question": first_question,
                "options": ["Provide explicit requirements answers", "Revise the goal and resume"],
                "default_option": "Provide explicit requirements answers",
                "requested_at": now_iso(),
                "requirements_request": requirements_request,
            }

    raise HTTPException(status_code=409, detail="No active checkpoint pending for this run")


def _normalize_checkpoint_answers(
    pending: Dict[str, Any],
    body: CheckpointResponseRequest,
) -> Tuple[str, List[Dict[str, str]]]:
    blockers = []
    requirements_request = pending.get("requirements_request")
    if isinstance(requirements_request, dict):
        raw_blockers = requirements_request.get("blockers")
        if isinstance(raw_blockers, list):
            blockers = [b for b in raw_blockers if isinstance(b, dict)]
    blocker_lookup = {
        str(blocker.get("id") or f"req_{idx + 1}"): str(blocker.get("question") or "").strip()
        for idx, blocker in enumerate(blockers)
    }

    normalized_answers: List[Dict[str, str]] = []
    for idx, raw in enumerate(body.answers):
        if not isinstance(raw, dict):
            continue
        answer = str(raw.get("answer") or "").strip()
        if not answer:
            continue
        blocker_id = str(raw.get("blocker_id") or raw.get("id") or f"req_{idx + 1}").strip()
        question = str(raw.get("question") or blocker_lookup.get(blocker_id) or "").strip()
        normalized_answers.append(
            {
                "blocker_id": blocker_id,
                "question": question,
                "answer": answer,
            }
        )

    if normalized_answers:
        lines = ["Requirements answers:"]
        for item in normalized_answers:
            if item["question"]:
                lines.append(f"- {item['question']}")
                lines.append(f"  Answer: {item['answer']}")
            else:
                lines.append(f"- Answer: {item['answer']}")
        return "\n".join(lines), normalized_answers

    response_text = str(body.response or "").strip()
    if not response_text:
        raise HTTPException(status_code=400, detail="Provide either response text or structured answers")

    normalized_answers = [
        {
            "blocker_id": str(blockers[0].get("id") or "req_1") if blockers else "req_1",
            "question": str(blockers[0].get("question") or "").strip() if blockers else str(pending.get("question") or "").strip(),
            "answer": response_text,
        }
    ]
    return response_text, normalized_answers


def _build_resume_requirements_context(
    pending: Dict[str, Any],
    normalized_answers: List[Dict[str, str]],
) -> str:
    lines = [
        "[REQUIREMENTS CHECKPOINT RESUME]",
        "The previous attempt paused because the conceptual contract could not be completed safely.",
        "Treat the following answers as authoritative requirements for the resumed run.",
        "",
    ]
    summary = str(pending.get("summary") or "").strip()
    if summary:
        lines.append(f"Summary: {summary}")
        lines.append("")

    for item in normalized_answers:
        question = item.get("question") or item.get("blocker_id") or "Requirement"
        answer = item.get("answer") or ""
        lines.append(f"- {question}")
        lines.append(f"  Answer: {answer}")

    requirements_request = pending.get("requirements_request")
    if isinstance(requirements_request, dict):
        proposed_tests = requirements_request.get("proposed_acceptance_tests")
        if isinstance(proposed_tests, list) and proposed_tests:
            lines.append("")
            lines.append("Proposed acceptance tests to preserve while resuming:")
            for test in proposed_tests:
                test_text = str(test).strip()
                if test_text:
                    lines.append(f"- {test_text}")

    lines.extend([
        "",
        "Resume from the requirements checkpoint.",
        "Do not ask the same requirements questions again unless the answers are contradictory.",
    ])
    return "\n".join(lines)


@app.post("/orchestrate/run/{run_id}/checkpoint")
def respond_to_checkpoint(run_id: str, body: CheckpointResponseRequest):
    """
    Submit a human response to a checkpoint.

    Active checkpoints are resolved in-place for the Overseer to pick up.
    Blocked requirements checkpoints are resumed on the same run lineage by
    queuing the run with an appended resume context.
    """
    run_path = BRIDGE_RUN_DIR / f"{run_id}.json"
    if not run_path.exists():
        raise HTTPException(status_code=404, detail="Run not found")

    try:
        manifest = safe_json_load(run_path, default={}, context=f"checkpoint_respond:{run_id}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read run manifest: {exc}")

    run_dir = manifest.get("run_dir")
    if not run_dir:
        raise HTTPException(status_code=400, detail="Run has no run_dir in manifest")

    out_dir = pathlib.Path(run_dir)
    checkpoint_pending_path = out_dir / "checkpoint_pending.json"
    checkpoint_response_path = out_dir / "checkpoint_response.json"
    requirements_answers_path = out_dir / "requirements_answers.json"

    pending = _load_pending_checkpoint_record(run_id, manifest, checkpoint_pending_path)

    # Validate agent if provided
    if body.agent:
        pending_agent = str(pending.get("agent") or "").strip()
        if pending_agent and pending_agent != body.agent:
            raise HTTPException(
                status_code=400,
                detail=f"Checkpoint is from agent '{pending_agent}', not '{body.agent}'",
            )

    response_text, normalized_answers = _normalize_checkpoint_answers(pending, body)
    resolved_at = now_iso()
    response_payload = {
        "response": response_text,
        "resolved_by": "human",
        "resolved_at": resolved_at,
        "answers": normalized_answers,
    }

    status_value = str(manifest.get("status") or "").strip().lower()
    is_active_checkpoint = status_value in ORCH_RUNNING_STATUSES and checkpoint_pending_path.exists()

    if is_active_checkpoint:
        if checkpoint_response_path.exists():
            raise HTTPException(status_code=409, detail="Checkpoint already responded to")
        try:
            checkpoint_response_path.write_text(json.dumps(response_payload, indent=2), encoding="utf-8")
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to write checkpoint response: {exc}")

        return {
            "status": "accepted",
            "run_id": run_id,
            "response": response_text,
            "message": "Checkpoint response queued. Run will resume within a few seconds.",
        }

    resume_context = _build_resume_requirements_context(pending, normalized_answers)
    checkpoint_id = str(pending.get("checkpoint_id") or pending.get("id") or f"requirements-{run_id}").strip()

    try:
        requirements_answers_path.write_text(json.dumps(response_payload, indent=2), encoding="utf-8")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to write requirements answers: {exc}")

    def _apply(data: Dict[str, Any]) -> Dict[str, Any]:
        data["status"] = "queued"
        data["cancel_requested"] = False
        data["started_at"] = None
        data["completed_at"] = None
        data["lease"] = None
        data["verification_status"] = "pending"
        data["sandbox_report"] = None
        data["requirements_request"] = None
        data["resume_context"] = resume_context
        data["requirements_answers"] = normalized_answers
        checkpoints = data.get("checkpoints")
        if not isinstance(checkpoints, list):
            checkpoints = []
            data["checkpoints"] = checkpoints

        updated = False
        for cp in checkpoints:
            if not isinstance(cp, dict):
                continue
            if str(cp.get("id") or "").strip() == checkpoint_id:
                cp["response"] = response_text
                cp["answers"] = normalized_answers
                cp["responded_at"] = resolved_at
                cp["resolved_by"] = "human"
                cp["status"] = "answered"
                updated = True
                break
        if not updated:
            checkpoints.append(
                {
                    "id": checkpoint_id,
                    "agent": str(pending.get("agent") or "ConceptualModelContract"),
                    "question": str(pending.get("question") or "").strip(),
                    "options": pending.get("options") if isinstance(pending.get("options"), list) else [],
                    "default_option": str(pending.get("default_option") or ""),
                    "requested_at": str(pending.get("requested_at") or now_iso()),
                    "response": response_text,
                    "answers": normalized_answers,
                    "responded_at": resolved_at,
                    "resolved_by": "human",
                    "status": "answered",
                }
            )

        data.setdefault("events", []).append(
            {"ts": resolved_at, "type": "checkpoint:resolved", "message": f"Requirements checkpoint answered: {response_text[:160]}"}
        )
        data["events"].append({"ts": resolved_at, "type": "status", "message": "queued (resume_requirements)"})
        return data

    _update_manifest_atomic(run_path, _apply)

    try:
        checkpoint_pending_path.unlink(missing_ok=True)
        checkpoint_response_path.unlink(missing_ok=True)
    except Exception:
        pass

    with _orch_run_state_lock:
        _orch_run_state[run_id] = {
            "cancel_event": threading.Event(),
            "process": None,
            "future": None,
            "created_at": resolved_at,
            "worker_id": None,
        }

    return {
        "status": "queued",
        "run_id": run_id,
        "response": response_text,
        "answers": normalized_answers,
        "message": "Requirements accepted. The run has been queued to resume on the same run id.",
    }


@app.get("/orchestrate/run/{run_id}/log")
def get_orchestration_log(run_id: str, max_bytes: int = Query(8000, ge=1, le=20000)):
    log_path = BRIDGE_RUN_DIR / f"{run_id}.log"
    if not log_path.exists():
        raise HTTPException(status_code=404, detail="Log not found")
    try:
        data = log_path.read_bytes()
        if len(data) > max_bytes:
            data = data[-max_bytes:]
        return {
            "run_id": run_id,
            "bytes": len(data),
            "log": data.decode("utf-8", errors="ignore"),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read log: {exc}")


# ----------------------------
# Run Feedback and Learning Endpoints
# ----------------------------


# ----------------------------
# Repo Orchestration Workflow
# ----------------------------
def _repo_manifest_path(run_id: str) -> pathlib.Path:
    run_dir = BRIDGE_RUN_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    return run_dir / "repo-orchestration.json"


def _repo_result_path(run_id: str) -> pathlib.Path:
    return BRIDGE_RUN_DIR / run_id / "repo-result.json"


def _redact_options(options: Dict[str, Any]) -> Dict[str, Any]:
    cleaned = dict(options or {})
    if cleaned.get("github_token"):
        cleaned["github_token"] = "REDACTED"
    return cleaned


def _persist_repo_state(path: pathlib.Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

def _gate_status(result: Any) -> str:
    if result is None:
        return "skipped"
    if isinstance(result, bool):
        return "passed" if result else "failed"
    if isinstance(result, dict):
        explicit_status = str(result.get("status") or "").strip().lower()
        if explicit_status in {"passed", "failed", "skipped"}:
            return explicit_status
        return "passed" if result.get("passed") else "failed"
    return "failed"


def _summarize_repo_gates(results: Dict[str, Any]) -> Dict[str, Any]:
    checks = {}
    for key, value in results.items():
        if key == "paths_to_full_logs":
            continue
        checks[key] = {
            "status": _gate_status(value),
            "details": value,
        }

    failed = [name for name, meta in checks.items() if meta["status"] == "failed"]
    return {
        "checks": checks,
        "failed": failed,
        "failed_count": len(failed),
        "passed_count": len([1 for meta in checks.values() if meta["status"] == "passed"]),
        "skipped_count": len([1 for meta in checks.values() if meta["status"] == "skipped"]),
    }


class _HtmlTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: List[str] = []
        self._skip_tags = {"style", "script"}
        self._skip_depth = 0
        self._block_tags = {
            "p",
            "div",
            "section",
            "article",
            "header",
            "footer",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "ul",
            "ol",
            "li",
            "pre",
            "br",
        }

    def handle_starttag(self, tag, attrs):
        if tag in self._skip_tags:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if tag in self._block_tags:
            self.parts.append("\n")
        if tag == "li":
            self.parts.append("- ")

    def handle_endtag(self, tag):
        if tag in self._skip_tags:
            if self._skip_depth > 0:
                self._skip_depth -= 1
            return
        if self._skip_depth:
            return
        if tag in self._block_tags:
            self.parts.append("\n")

    def handle_data(self, data):
        if self._skip_depth:
            return
        if data:
            self.parts.append(data)

    def text(self) -> str:
        raw = "".join(self.parts)
        lines = [line.rstrip() for line in raw.splitlines()]
        normalized: List[str] = []
        saw_blank = False
        for line in lines:
            if line.strip() == "":
                if not saw_blank:
                    normalized.append("")
                saw_blank = True
                continue
            normalized.append(line.strip())
            saw_blank = False
        return "\n".join(normalized).strip()


def _extract_section_lines(text: str, keywords: List[str]) -> List[str]:
    lines = [line.strip() for line in text.splitlines()]
    matches: List[str] = []
    capture = False
    for line in lines:
        lowered = line.lower()
        if any(keyword in lowered for keyword in keywords):
            capture = True
            continue
        if capture and line == "":
            break
        if capture:
            if line.startswith("- "):
                matches.append(line[2:].strip())
            else:
                matches.append(line.strip())
    return [m for m in matches if m]


def _build_report_from_html(html_text: str) -> Dict[str, Any]:
    parser = _HtmlTextExtractor()
    parser.feed(html_text)
    text = parser.text()
    summary_lines = text.splitlines()[:6]
    summary = " ".join(summary_lines).strip()

    return {
        "summary": summary,
        "key_findings": _extract_section_lines(text, ["finding", "key finding"]),
        "recommended_actions": _extract_section_lines(text, ["recommend", "action"]),
        "risks": _extract_section_lines(text, ["risk"]),
        "next_steps": _extract_section_lines(text, ["next step", "next steps"]),
    }


_CODE_BLOCK_RE = re.compile(r"```([^\n`]*)\n(.*?)```", re.DOTALL)
_INLINE_FILE_HINT_RE = re.compile(
    r"(?:<!--|/\*+|//|#)\s*File:\s*([^>\n*]+?)(?:-->|(?:\*+/)|$)",
    re.IGNORECASE,
)
_BACKTICK_FILE_RE = re.compile(r"`([^`\n]+?\.[A-Za-z0-9._-]+)`")


def _load_agent_json_output(agent_file: pathlib.Path) -> Optional[Dict[str, Any]]:
    if not agent_file.exists():
        return None
    try:
        content = agent_file.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return None
    idx = content.find("{")
    if idx < 0:
        return None
    try:
        payload = json.loads(content[idx:])
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


def _safe_generated_relpath(path_hint: str) -> Optional[pathlib.PurePosixPath]:
    candidate = (path_hint or "").strip().strip("`'\"")
    if not candidate:
        return None
    candidate = candidate.replace("\\", "/")
    if candidate.lower().startswith("file:"):
        candidate = candidate.split(":", 1)[1].strip()
    if not candidate:
        return None
    path = pathlib.PurePosixPath(candidate)
    if path.is_absolute():
        return None
    if any(part in ("", ".", "..") for part in path.parts):
        return None
    if path.parts and path.parts[0].endswith(":"):
        return None
    return path


def _strip_file_header_line(code: str) -> str:
    lines = code.splitlines()
    if not lines:
        return code
    if _INLINE_FILE_HINT_RE.search(lines[0]):
        return "\n".join(lines[1:]).lstrip("\n")
    return code


def _infer_filename(language: str, index: int) -> str:
    lang = (language or "").strip().lower()
    if "html" in lang:
        return "index.html"
    if "css" in lang:
        return "styles.css"
    if "javascript" in lang or lang == "js":
        return "script.js"
    if "typescript" in lang or lang == "ts":
        return "script.ts"
    return f"generated_{index + 1}.txt"


def _extract_code_target(code: str, prelude: str, language: str, index: int, used: set[str]) -> pathlib.PurePosixPath:
    hint = None
    first_lines = code.splitlines()[:2]
    for line in first_lines:
        m = _INLINE_FILE_HINT_RE.search(line)
        if m:
            hint = m.group(1).strip()
            break
    if not hint:
        prelude_match = _BACKTICK_FILE_RE.findall(prelude or "")
        if prelude_match:
            hint = prelude_match[-1]

    rel = _safe_generated_relpath(hint) if hint else None
    if rel is None:
        rel = pathlib.PurePosixPath(_infer_filename(language, index))

    base_name = rel.name
    stem = pathlib.PurePosixPath(base_name).stem
    suffix = pathlib.PurePosixPath(base_name).suffix
    parent = rel.parent if str(rel.parent) != "." else pathlib.PurePosixPath()
    candidate = rel
    counter = 2
    while str(candidate) in used:
        candidate = parent / f"{stem}_{counter}{suffix}"
        counter += 1
    used.add(str(candidate))
    return candidate


def _materialize_engineer_artifacts(out_dir: pathlib.Path) -> List[str]:
    engineer_payload = _load_agent_json_output(out_dir / "Engineer.txt")
    if not engineer_payload:
        return []
    implementation = engineer_payload.get("implementation")
    if not isinstance(implementation, str) or "```" not in implementation:
        return []

    generated_root = out_dir / "generated_app"
    generated_root.mkdir(parents=True, exist_ok=True)

    written: List[str] = []
    used: set[str] = set()
    for idx, match in enumerate(_CODE_BLOCK_RE.finditer(implementation)):
        language = (match.group(1) or "").strip()
        code = (match.group(2) or "").strip("\n")
        if not code.strip():
            continue
        prelude = implementation[max(0, match.start() - 240):match.start()]
        rel = _extract_code_target(code, prelude, language, idx, used)
        target = (generated_root / pathlib.Path(rel.as_posix())).resolve()
        try:
            target.relative_to(generated_root.resolve())
        except Exception:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(_strip_file_header_line(code).rstrip() + "\n", encoding="utf-8")
        written.append(str(target.relative_to(out_dir)))

    return written


def _report_md_from_json(report_json: Dict[str, Any]) -> str:
    repo_value = report_json.get("repo")
    repo = repo_value if isinstance(repo_value, dict) else {"url": repo_value} if repo_value else {}
    summary_value = report_json.get("summary")
    summary = summary_value if isinstance(summary_value, dict) else {}
    verification = report_json.get("verification") or {}
    changes = report_json.get("changes") or {}
    findings = report_json.get("findings") or {}
    blockers = report_json.get("blockers") or []

    def _list(values: Any, fallback: str) -> List[str]:
        if isinstance(values, list) and values:
            return [str(v) for v in values if v]
        return [fallback]

    commands = verification.get("commands") if isinstance(verification, dict) else []
    command_lines: List[str] = []
    if isinstance(commands, list) and commands:
        for cmd in commands:
            if not isinstance(cmd, dict):
                continue
            name = cmd.get("name") or "command"
            cmd_text = cmd.get("cmd") or ""
            exit_code = cmd.get("exit_code")
            log_artifact = cmd.get("log_artifact") or "n/a"
            desc = f"- **{name}**"
            if cmd_text:
                desc += f": `{cmd_text}`"
            if exit_code is not None:
                desc += f" (exit {exit_code})"
            desc += f" — log: `{log_artifact}`"
            command_lines.append(desc)
    else:
        command_lines.append("- No verification commands were executed in this run.")

    files_changed = changes.get("files_changed") if isinstance(changes, dict) else []
    files_changed_lines = (
        [f"- `{path}`" for path in files_changed]
        if isinstance(files_changed, list) and files_changed
        else ["- No files changed."]
    )

    high_risk_items = findings.get("high_risk_items") if isinstance(findings, dict) else []
    risk_lines = []
    if isinstance(high_risk_items, list) and high_risk_items:
        for item in high_risk_items:
            if not isinstance(item, dict):
                continue
            path = item.get("path") or "unknown"
            line = item.get("line") or "?"
            kind = item.get("kind") or "note"
            note = item.get("note") or ""
            detail = f"- `{path}:{line}` **{kind}**"
            if note:
                detail += f": {note}"
            risk_lines.append(detail)
    else:
        risk_lines.append("- No high-risk items detected.")

    blocker_lines = []
    if isinstance(blockers, list) and blockers:
        for blocker in blockers:
            if not isinstance(blocker, dict):
                continue
            code = blocker.get("code") or "BLOCKER"
            message = blocker.get("message") or ""
            fix = blocker.get("suggested_fix") or ""
            line = f"- **{code}**: {message}" if message else f"- **{code}**"
            if fix:
                line += f" (fix: {fix})"
            blocker_lines.append(line)
    else:
        blocker_lines.append("- No blockers reported.")

    return "\n".join(
        [
            "# Repo Orchestration Report",
            "",
            f"- **Run ID:** `{report_json.get('run_id')}`",
            f"- **Repo:** `{repo.get('url') or 'unknown'}`",
            f"- **Branch:** `{repo.get('branch') or 'default'}`",
            f"- **Outcome:** `{report_json.get('outcome')}`",
            "",
            "## Summary",
            summary.get("headline") or "Summary not available.",
            "",
            "### What happened",
            *_list(summary.get("what_happened"), "No summary details available."),
            "",
            "### Next actions",
            *_list(summary.get("next_actions"), "No next actions recorded."),
            "",
            "## Verification",
            *command_lines,
            "",
            "## Changes",
            f"- Patch: `{changes.get('patch_artifact') or 'none'}`",
            f"- Files changed: {len(files_changed) if isinstance(files_changed, list) else 0}",
            *files_changed_lines,
            "",
            "## Findings",
            f"- TODO count: {findings.get('todo_count', 0)}",
            f"- Placeholder count: {findings.get('placeholder_count', 0)}",
            f"- Findings artifact: `{findings.get('findings_artifact') or 'none'}`",
            *risk_lines,
            "",
            "## Blockers",
            *blocker_lines,
        ]
    )


def _guess_mime_type(path: pathlib.Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".md":
        return "text/markdown"
    if suffix == ".json":
        return "application/json"
    if suffix in (".diff", ".patch"):
        return "text/plain"
    if suffix in (".html", ".htm"):
        return "text/html"
    if suffix == ".zip":
        return "application/zip"
    return "application/octet-stream"


def _artifact_record(path: pathlib.Path, artifact_id: str) -> Dict[str, Any]:
    stat_info = path.stat()
    return {
        "artifactId": artifact_id,
        "fileName": path.name,
        "filePath": str(path),
        "mimeType": _guess_mime_type(path),
        "size": stat_info.st_size,
        "createdAt": datetime.datetime.utcfromtimestamp(stat_info.st_mtime).isoformat() + "Z",
    }


def _slugify_artifact_id(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "artifact"


def _write_patch_diff(run_dir: pathlib.Path, execution_result: Dict[str, Any]) -> Optional[pathlib.Path]:
    if not execution_result:
        return None
    tasks = execution_result.get("tasks", [])
    if not isinstance(tasks, list):
        return None
    diff_chunks: List[str] = []
    for task in tasks:
        if not isinstance(task, dict):
            continue
        artifacts = task.get("artifacts", {})
        diff_path = artifacts.get("diff")
        task_id = task.get("task_id")
        if diff_path and pathlib.Path(diff_path).exists():
            diff_text = pathlib.Path(diff_path).read_text(encoding="utf-8", errors="replace")
            diff_chunks.append(f"# Task {task_id}\n{diff_text}")
    if not diff_chunks:
        return None
    patch_path = run_dir / "PATCH.diff"
    patch_path.write_text("\n\n".join(diff_chunks), encoding="utf-8")
    return patch_path


def _write_evidence_index(
    run_dir: pathlib.Path,
    execution_result: Dict[str, Any],
    manifest_path: pathlib.Path,
    taskgraph_path: Optional[pathlib.Path],
) -> pathlib.Path:
    evidence_dir = run_dir / "EVIDENCE"
    evidence_dir.mkdir(parents=True, exist_ok=True)
    evidence_entries: List[Dict[str, Any]] = []

    evidence_entries.append({"label": "manifest", "path": str(manifest_path)})
    if taskgraph_path:
        evidence_entries.append({"label": "taskgraph", "path": str(taskgraph_path)})

    tasks = execution_result.get("tasks", []) if execution_result else []
    for task in tasks if isinstance(tasks, list) else []:
        if not isinstance(task, dict):
            continue
        artifacts = task.get("artifacts", {})
        for key in ("log", "findings", "diff", "violation"):
            if artifacts.get(key):
                evidence_entries.append({"label": f"task_{key}", "path": artifacts[key]})

    evidence_index = evidence_dir / "files.json"
    evidence_index.write_text(json.dumps(evidence_entries, indent=2), encoding="utf-8")
    return evidence_index


def _to_relpath(path: Optional[pathlib.Path], run_dir: pathlib.Path) -> Optional[str]:
    if not path:
        return None
    try:
        return path.relative_to(run_dir).as_posix()
    except Exception:
        return path.name


def _files_changed_from_patch(patch_path: Optional[pathlib.Path]) -> List[str]:
    if not patch_path or not patch_path.exists():
        return []
    try:
        diff_text = patch_path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return []
    files: List[str] = []
    seen: set[str] = set()
    for line in diff_text.splitlines():
        if not (line.startswith("+++ ") or line.startswith("--- ")):
            continue
        path = line[4:].strip()
        if not path or path == "/dev/null":
            continue
        if path.startswith("a/") or path.startswith("b/"):
            path = path[2:]
        if path not in seen:
            seen.add(path)
            files.append(path)
    return files


def _git_rev_parse(repo_path: Optional[pathlib.Path], ref: Optional[str]) -> Optional[str]:
    if not repo_path or not ref:
        return None
    try:
        proc = subprocess.run(
            ["git", "-C", str(repo_path), "rev-parse", ref],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except Exception:
        return None
    if proc.returncode != 0:
        return None
    return (proc.stdout or "").strip() or None


def _scan_placeholders(repo_path: Optional[pathlib.Path], run_dir: pathlib.Path) -> Tuple[Dict[str, Any], pathlib.Path]:
    scan_payload = {
        "todo_count": 0,
        "placeholder_count": 0,
        "high_risk_items": [],
        "scanned_files": 0,
    }
    scan_path = run_dir / "placeholder-scan.json"
    if not repo_path or not repo_path.exists():
        scan_path.write_text(json.dumps(scan_payload, indent=2), encoding="utf-8")
        return scan_payload, scan_path

    skip_dirs = {
        ".git",
        ".hg",
        ".svn",
        "node_modules",
        "dist",
        "build",
        "out",
        ".next",
        ".cache",
        ".pytest_cache",
        ".mypy_cache",
        ".venv",
        "venv",
        "__pycache__",
        ".uaitoolbox",
        "artifacts",
        "runs",
        "codex_runs",
    }
    todo_tokens = {"TODO", "FIXME", "HACK", "XXX"}
    placeholder_tokens = {"PLACEHOLDER", "TBD"}
    token_regex = re.compile(r"\\b(" + "|".join(sorted(todo_tokens | placeholder_tokens)) + r")\\b", re.IGNORECASE)

    high_risk_items: List[Dict[str, Any]] = []
    max_file_size = 1_000_000
    max_risk_items = 50
    max_files = 3000

    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in skip_dirs]
        for filename in files:
            if scan_payload["scanned_files"] >= max_files:
                break
            file_path = pathlib.Path(root) / filename
            try:
                if file_path.stat().st_size > max_file_size:
                    continue
            except Exception:
                continue
            try:
                with open(file_path, "rb") as handle:
                    sample = handle.read(2048)
                    if b"\\x00" in sample:
                        continue
                text = file_path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            if not text:
                continue
            scan_payload["scanned_files"] += 1
            rel_path = str(file_path.relative_to(repo_path))
            for idx, line in enumerate(text.splitlines(), start=1):
                for match in token_regex.finditer(line):
                    token = match.group(1).upper()
                    if token in todo_tokens:
                        scan_payload["todo_count"] += 1
                    if token in placeholder_tokens:
                        scan_payload["placeholder_count"] += 1
                    if token in todo_tokens and len(high_risk_items) < max_risk_items:
                        high_risk_items.append(
                            {
                                "path": rel_path,
                                "line": idx,
                                "kind": token,
                                "note": line.strip()[:240],
                            }
                        )
        if scan_payload["scanned_files"] >= max_files:
            break

    scan_payload["high_risk_items"] = high_risk_items
    scan_path.write_text(json.dumps(scan_payload, indent=2), encoding="utf-8")
    return scan_payload, scan_path


def _build_verification_commands(results: Optional[Dict[str, Any]], run_dir: pathlib.Path) -> List[Dict[str, Any]]:
    if not isinstance(results, dict):
        return []

    mapping = {
        "lint_result": "lint",
        "build_result": "build",
        "unit_test_result": "unit_tests",
        "smoke_test_result": "smoke_tests",
        "normalization_result": "normalization",
        "docker_compose_valid": "docker_compose",
    }
    commands: List[Dict[str, Any]] = []

    for key, name in mapping.items():
        value = results.get(key)
        if value is None:
            continue
        if isinstance(value, dict):
            explicit_status = str(value.get("status") or "").strip().lower()
            cmd = value.get("command") or value.get("executed") or value.get("cmd")
            exit_code = value.get("exit_code")
            if exit_code is None:
                if explicit_status == "skipped":
                    exit_code = None
                else:
                    exit_code = 0 if value.get("passed") else 1
            log_path = value.get("log_path")
            log_artifact = None
            if log_path:
                log_artifact = _to_relpath(pathlib.Path(log_path), run_dir)
            commands.append(
                {
                    "name": name,
                    "cmd": cmd,
                    "exit_code": exit_code,
                    "log_artifact": log_artifact,
                }
            )
        elif isinstance(value, bool):
            commands.append(
                {
                    "name": name,
                    "cmd": None,
                    "exit_code": 0 if value else 1,
                    "log_artifact": None,
                }
            )

    return commands


def _make_skipped_gate_result(summary: str) -> Dict[str, Any]:
    return {
        "status": "skipped",
        "summary": summary,
    }


def _summarize_app_production_gates(
    results: Optional[Dict[str, Any]],
    out_dir: pathlib.Path,
    app_dir: pathlib.Path,
) -> Dict[str, Any]:
    mapping = {
        "install_result": "install",
        "lint_result": "lint",
        "build_result": "build",
        "unit_test_result": "unit_tests",
        "smoke_test_result": "smoke_tests",
        "dev_server_result": "dev_server",
        "docker_compose_valid": "docker_compose",
    }

    checks: List[Dict[str, Any]] = []
    passed_count = 0
    failed_count = 0
    skipped_count = 0

    if not isinstance(results, dict):
        return {
            "status": "insufficient_evidence",
            "delivery_readiness": "insufficient_evidence",
            "app_dir": _to_relpath(app_dir, out_dir),
            "checks": checks,
            "passed_count": passed_count,
            "failed_count": failed_count,
            "skipped_count": skipped_count,
        }

    for key, name in mapping.items():
        value = results.get(key)
        check: Dict[str, Any] = {"name": name}

        if value is None:
            skipped_count += 1
            check.update(
                {
                    "status": "skipped",
                    "summary": "No applicable config or script was found for this check.",
                }
            )
            checks.append(check)
            continue

        if isinstance(value, dict):
            status_value = str(value.get("status") or "").strip().lower()
            if status_value == "skipped" or bool(value.get("skipped")):
                skipped_count += 1
                log_artifact = None
                if value.get("log_path"):
                    log_artifact = _to_relpath(pathlib.Path(str(value["log_path"])), out_dir)
                summary = str(value.get("summary") or value.get("output") or "Check skipped.").strip()
                if len(summary) > 240:
                    summary = summary[:240].rstrip() + "..."
                check.update(
                    {
                        "status": "skipped",
                        "summary": summary,
                        "command": value.get("command") or value.get("executed") or value.get("cmd"),
                        "exit_code": value.get("exit_code"),
                        "log_artifact": log_artifact,
                    }
                )
                checks.append(check)
                continue

            passed = bool(value.get("passed") if "passed" in value else value.get("success"))
            status_value = "passed" if passed else "failed"
            if passed:
                passed_count += 1
            else:
                failed_count += 1

            log_artifact = None
            if value.get("log_path"):
                log_artifact = _to_relpath(pathlib.Path(str(value["log_path"])), out_dir)

            summary = str(value.get("output") or value.get("report") or value.get("error") or "").strip()
            if len(summary) > 240:
                summary = summary[:240].rstrip() + "..."

            check.update(
                {
                    "status": status_value,
                    "summary": summary or ("Check passed." if passed else "Check failed."),
                    "command": value.get("command") or value.get("executed") or value.get("cmd"),
                    "exit_code": value.get("exit_code"),
                    "log_artifact": log_artifact,
                }
            )
            checks.append(check)
            continue

        if isinstance(value, bool):
            if value:
                passed_count += 1
            else:
                failed_count += 1
            check.update(
                {
                    "status": "passed" if value else "failed",
                    "summary": "Boolean gate result returned." if value else "Boolean gate result failed.",
                }
            )
            checks.append(check)
            continue

        skipped_count += 1
        check.update({"status": "skipped", "summary": "Gate result was not in a recognized format."})
        checks.append(check)

    has_executable_proof = any(
        check.get("name") in {"build", "unit_tests", "smoke_tests", "dev_server"} and check.get("status") == "passed"
        for check in checks
    )

    if failed_count > 0:
        status = "repair_needed"
        delivery_readiness = "repair_needed"
    elif has_executable_proof:
        status = "verified"
        delivery_readiness = "verified"
    else:
        status = "insufficient_evidence"
        delivery_readiness = "insufficient_evidence"

    return {
        "status": status,
        "delivery_readiness": delivery_readiness,
        "app_dir": _to_relpath(app_dir, out_dir),
        "checks": checks,
        "passed_count": passed_count,
        "failed_count": failed_count,
        "skipped_count": skipped_count,
    }


def _write_app_production_artifacts(
    out_dir: pathlib.Path,
    app_production: Dict[str, Any],
) -> Tuple[pathlib.Path, pathlib.Path]:
    json_path = out_dir / "generated_app_verification.json"
    md_path = out_dir / "generated_app_verification.md"
    json_path.write_text(json.dumps(app_production, indent=2), encoding="utf-8")

    lines = [
        "# Generated App Verification",
        "",
        f"- Status: `{app_production.get('status')}`",
        f"- Delivery readiness: `{app_production.get('delivery_readiness')}`",
        f"- App dir: `{app_production.get('app_dir')}`",
        f"- Passed: {app_production.get('passed_count', 0)}",
        f"- Failed: {app_production.get('failed_count', 0)}",
        f"- Skipped: {app_production.get('skipped_count', 0)}",
        "",
        "## Checks",
    ]

    for check in app_production.get("checks", []):
        if not isinstance(check, dict):
            continue
        status = check.get("status") or "unknown"
        summary = str(check.get("summary") or "").strip()
        command = check.get("command")
        lines.append(f"- **{check.get('name', 'check')}**: {status}")
        if command:
            lines.append(f"  - command: `{command}`")
        if summary:
            lines.append(f"  - summary: {summary}")
        if check.get("log_artifact"):
            lines.append(f"  - log: `{check['log_artifact']}`")

    md_path.write_text("\n".join(lines), encoding="utf-8")
    return json_path, md_path


def _derive_app_production_repair_plan(app_production: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(app_production, dict):
        return {"status": "not_needed", "items": []}

    checks = app_production.get("checks") if isinstance(app_production.get("checks"), list) else []
    failed_checks = [check for check in checks if isinstance(check, dict) and str(check.get("status") or "").lower() == "failed"]
    skipped_checks = [check for check in checks if isinstance(check, dict) and str(check.get("status") or "").lower() == "skipped"]

    guidance = {
        "install": {
            "agent": "Engineer",
            "priority": "high",
            "summary": "Repair the generated app dependency manifest and installation path before any downstream verification reruns.",
            "recommended_actions": [
                "Inspect package manager selection, lockfile consistency, and missing or incompatible dependencies.",
                "Fix package.json scripts or dependency declarations that prevent a deterministic install.",
            ],
        },
        "lint": {
            "agent": "Engineer",
            "priority": "medium",
            "summary": "Repair static analysis or configuration issues before rerunning quality gates.",
            "recommended_actions": [
                "Inspect the failing lint log and correct code style or configuration drift.",
                "Confirm lint scripts align with the generated stack and file layout.",
            ],
        },
        "build": {
            "agent": "Engineer",
            "priority": "high",
            "summary": "Repair compile-time or bundling failures blocking a runnable application artifact.",
            "recommended_actions": [
                "Inspect the failing build log and fix missing imports, syntax errors, or stack misconfiguration.",
                "Re-run the build gate after patching to confirm the app can compile cleanly.",
            ],
        },
        "unit_tests": {
            "agent": "Engineer",
            "priority": "medium",
            "summary": "Repair broken unit-test expectations or runtime assumptions in the generated app.",
            "recommended_actions": [
                "Inspect failing test cases and align implementation with the intended feature contract.",
                "Patch unstable or incorrect test setup only when the implementation is already correct.",
            ],
        },
        "smoke_tests": {
            "agent": "Engineer",
            "priority": "high",
            "summary": "Repair critical app behaviors that are failing coarse smoke validation.",
            "recommended_actions": [
                "Focus on the exact interaction or route reported in the smoke failure log.",
                "Prefer minimal targeted patches that restore the expected user path before broad refactors.",
            ],
        },
        "dev_server": {
            "agent": "Engineer",
            "priority": "high",
            "summary": "Repair launch/runtime configuration so the generated app can start and answer a local health probe.",
            "recommended_actions": [
                "Inspect startup logs for port, host, or runtime boot failures.",
                "Align dev/start scripts with the generated stack so the app can run under bounded local execution.",
            ],
        },
        "docker_compose": {
            "agent": "Engineer",
            "priority": "medium",
            "summary": "Repair container orchestration configuration so deployment packaging remains viable.",
            "recommended_actions": [
                "Inspect the compose validation output and fix invalid service, volume, or build settings.",
                "Keep compose changes aligned with the generated runtime contract instead of masking broken app behavior.",
            ],
        },
    }

    skipped_by_install = [
        str(check.get("name") or "").strip()
        for check in skipped_checks
        if "installation failed" in str(check.get("summary") or "").lower()
    ]

    items: List[Dict[str, Any]] = []
    for failed in failed_checks:
        gate = str(failed.get("name") or "gate").strip() or "gate"
        gate_guidance = guidance.get(gate, {
            "agent": "Engineer",
            "priority": "medium",
            "summary": "Repair the generated-app verification failure and rerun the affected gate.",
            "recommended_actions": [
                "Inspect the recorded evidence and patch the generated app accordingly.",
            ],
        })
        blocked_checks = skipped_by_install if gate == "install" else []
        items.append(
            {
                "id": f"app-production-{gate}",
                "gate": gate,
                "agent": gate_guidance["agent"],
                "priority": gate_guidance["priority"],
                "summary": gate_guidance["summary"],
                "failure_summary": str(failed.get("summary") or "").strip() or "Gate failed.",
                "command": failed.get("command"),
                "exit_code": failed.get("exit_code"),
                "log_artifact": failed.get("log_artifact"),
                "blocked_checks": blocked_checks,
                "recommended_actions": gate_guidance["recommended_actions"],
            }
        )

    return {
        "status": "actionable" if items else "not_needed",
        "items": items,
    }


def _write_app_production_repair_artifacts(
    out_dir: pathlib.Path,
    repair_plan: Dict[str, Any],
) -> Tuple[pathlib.Path, pathlib.Path]:
    json_path = out_dir / "generated_app_repairs.json"
    md_path = out_dir / "generated_app_repairs.md"
    json_path.write_text(json.dumps(repair_plan, indent=2), encoding="utf-8")

    lines = [
        "# Generated App Repair Routing",
        "",
        f"- Status: `{repair_plan.get('status')}`",
        f"- Repair targets: {len(repair_plan.get('items') or [])}",
        "",
        "## Targets",
    ]

    for item in repair_plan.get("items", []):
        if not isinstance(item, dict):
            continue
        lines.append(f"- **{item.get('gate', 'gate')}** -> `{item.get('agent', 'Engineer')}` ({item.get('priority', 'medium')})")
        if item.get("summary"):
            lines.append(f"  - summary: {item['summary']}")
        if item.get("failure_summary"):
            lines.append(f"  - failure: {item['failure_summary']}")
        if item.get("command"):
            lines.append(f"  - command: `{item['command']}`")
        if item.get("log_artifact"):
            lines.append(f"  - log: `{item['log_artifact']}`")
        blocked_checks = item.get("blocked_checks") if isinstance(item.get("blocked_checks"), list) else []
        if blocked_checks:
            lines.append(f"  - blocked checks: {', '.join(str(v) for v in blocked_checks)}")
        for action in item.get("recommended_actions", []) if isinstance(item.get("recommended_actions"), list) else []:
            lines.append(f"  - action: {action}")

    md_path.write_text("\n".join(lines), encoding="utf-8")
    return json_path, md_path


def _write_verification_artifacts(run_dir: pathlib.Path, commands: List[Dict[str, Any]]) -> Tuple[pathlib.Path, pathlib.Path]:
    verification_payload = {"commands": commands}
    verification_json_path = run_dir / "verification.json"
    verification_json_path.write_text(json.dumps(verification_payload, indent=2), encoding="utf-8")

    lines = [
        "# Verification",
        "",
        f"- Commands executed: {len(commands)}",
    ]
    if not commands:
        lines.append("")
        lines.append("No verification commands were executed in this run.")
    else:
        lines.append("")
        lines.append("## Commands")
        for cmd in commands:
            name = cmd.get("name") or "command"
            cmd_text = cmd.get("cmd") or ""
            exit_code = cmd.get("exit_code")
            log_artifact = cmd.get("log_artifact") or "n/a"
            detail = f"- **{name}**"
            if cmd_text:
                detail += f": `{cmd_text}`"
            if exit_code is not None:
                detail += f" (exit {exit_code})"
            detail += f" — log: `{log_artifact}`"
            lines.append(detail)

    verification_md_path = run_dir / "verification.md"
    verification_md_path.write_text("\n".join(lines), encoding="utf-8")
    return verification_json_path, verification_md_path


def _map_outcome(status: str, error_message: Optional[str], merge_status: Optional[str]) -> str:
    status_value = (status or "").lower()
    merge_value = (merge_status or "").lower()
    if merge_value == "no_changes" or status_value == "no_changes":
        return "no_changes_by_design"
    if merge_value in ("conflict", "validation_failed") or status_value in ("conflict", "validation_failed"):
        return "blocked"
    if status_value in ("merged", "complete", "completed", "success"):
        return "changes_applied"
    if status_value in ("cancelled", "canceled", "error", "failed"):
        return "failed"
    if error_message:
        return "failed"
    return "failed"

def _build_artifacts_index(
    run_dir: pathlib.Path,
    repo: str,
    branch: Optional[str],
    run_id: str,
    status: str,
    execution_result: Dict[str, Any],
    manifest_path: pathlib.Path,
    taskgraph_path: Optional[pathlib.Path],
    error_message: Optional[str] = None,
    base_branch: Optional[str] = None,
    integration_branch: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    codex_runs: List[str] = []
    tasks = execution_result.get("tasks", []) if execution_result else []
    for task in tasks if isinstance(tasks, list) else []:
        if isinstance(task, dict) and task.get("codex_run_id"):
            codex_runs.append(str(task["codex_run_id"]))

    synthesis_html: List[Dict[str, Any]] = []
    html_text: Optional[str] = None
    html_path: Optional[pathlib.Path] = None
    existing_report_json: Optional[Dict[str, Any]] = None
    existing_report_path = run_dir / "REPORT.json"
    if existing_report_path.exists():
        existing_report_json = safe_json_load(existing_report_path, default=None, context=f"report_json:{run_id}")

    for codex_run_id in codex_runs:
        candidate = run_dir / "codex_runs" / codex_run_id / "swarm-output" / "Final_Synthesis.html"
        entry = {"codex_run_id": codex_run_id, "path": str(candidate), "exists": candidate.exists()}
        synthesis_html.append(entry)
        if html_text is None and candidate.exists():
            html_path = candidate
            html_text = candidate.read_text(encoding="utf-8", errors="replace")

    manifest_data = safe_json_load(manifest_path, default={}, context=f"repo_manifest:{run_id}") or {}
    merge_info = manifest_data.get("merge") if isinstance(manifest_data.get("merge"), dict) else {}
    merge_status = merge_info.get("status") if isinstance(merge_info, dict) else None
    outcome = _map_outcome(status, error_message, merge_status)

    options = manifest_data.get("options") if isinstance(manifest_data.get("options"), dict) else {}
    branch_name = branch or options.get("branch") or merge_info.get("base_branch") or base_branch
    repo_path_value = manifest_data.get("clone_path")
    repo_path = pathlib.Path(repo_path_value) if repo_path_value else None
    integration_ref = integration_branch or merge_info.get("integration_branch") or manifest_data.get("integration_branch")
    if not integration_ref and run_id:
        integration_ref = f"{run_id}-integration"

    commit_before = _git_rev_parse(repo_path, base_branch or branch_name)
    commit_after = _git_rev_parse(repo_path, integration_ref) or _git_rev_parse(repo_path, "HEAD")

    html_sections = _build_report_from_html(html_text) if html_text else {}

    legacy_summary = ""
    legacy_findings: List[str] = []
    legacy_actions: List[str] = []
    legacy_next_steps: List[str] = []
    legacy_headline = ""
    if existing_report_json:
        if existing_report_json.get("schema_version"):
            summary = existing_report_json.get("summary") if isinstance(existing_report_json.get("summary"), dict) else {}
            if isinstance(summary, dict):
                legacy_headline = summary.get("headline") or ""
                legacy_findings = summary.get("what_happened") or []
                legacy_actions = summary.get("next_actions") or []
        else:
            legacy_summary = existing_report_json.get("summary") or ""
            legacy_findings = existing_report_json.get("keyFindings") or []
            legacy_actions = existing_report_json.get("recommendedActions") or []
            legacy_next_steps = existing_report_json.get("nextSteps") or []

    summary_text = html_sections.get("summary") or legacy_summary or error_message or ""
    key_findings = html_sections.get("key_findings") or legacy_findings or []
    recommended_actions = html_sections.get("recommended_actions") or legacy_actions or []
    next_steps = html_sections.get("next_steps") or legacy_next_steps or []
    if not isinstance(key_findings, list):
        key_findings = []
    if not isinstance(recommended_actions, list):
        recommended_actions = []
    if not isinstance(next_steps, list):
        next_steps = []

    gate_results: Optional[Dict[str, Any]] = None
    gates_report = run_dir / "REPO_GATES_REPORT.json"
    if gates_report.exists():
        gate_results = safe_json_load(gates_report, default=None, context=f"repo_gates:{run_id}")
    elif isinstance(manifest_data.get("repo_gates"), dict):
        gate_results = manifest_data.get("repo_gates", {}).get("results")

    verification_commands = _build_verification_commands(gate_results, run_dir)
    verification_json_path, verification_md_path = _write_verification_artifacts(run_dir, verification_commands)

    patch_path = _write_patch_diff(run_dir, execution_result)
    files_changed = _files_changed_from_patch(patch_path)

    findings_payload, findings_path = _scan_placeholders(repo_path, run_dir)

    blockers: List[Dict[str, Any]] = []
    error_detail = manifest_data.get("error_detail") if isinstance(manifest_data.get("error_detail"), dict) else None
    if error_detail:
        suggested_fix = None
        if isinstance(error_detail.get("suggestedFixes"), list) and error_detail.get("suggestedFixes"):
            suggested_fix = str(error_detail["suggestedFixes"][0])
        blockers.append(
            {
                "code": error_detail.get("code") or error_detail.get("error_code") or "ERROR",
                "message": error_detail.get("userMessage") or error_detail.get("message") or error_message or "Run failed",
                "suggested_fix": suggested_fix,
            }
        )
    if merge_status == "conflict":
        blockers.append(
            {
                "code": "MERGE_CONFLICT",
                "message": f"Merge conflict on task {merge_info.get('failed_task')}",
                "suggested_fix": "Resolve the conflict and re-run the orchestration.",
            }
        )
    if merge_status == "validation_failed":
        blockers.append(
            {
                "code": "VALIDATION_FAILED",
                "message": f"Validation failed on task {merge_info.get('failed_task')}",
                "suggested_fix": "Inspect validation artifacts and address failures.",
            }
        )
    if error_message and not blockers:
        blockers.append({"code": "ERROR", "message": error_message, "suggested_fix": None})

    def _dedupe(items: List[str]) -> List[str]:
        seen: set[str] = set()
        result: List[str] = []
        for item in items:
            if not item:
                continue
            if item not in seen:
                seen.add(item)
                result.append(item)
        return result

    what_happened: List[str] = []
    if summary_text:
        what_happened.append(summary_text)
    if merge_info.get("message"):
        what_happened.append(str(merge_info.get("message")))
    if tasks and isinstance(tasks, list):
        what_happened.append(f"Tasks executed: {len(tasks)}")
    if verification_commands:
        passed = len([c for c in verification_commands if c.get("exit_code") == 0])
        failed = len([c for c in verification_commands if c.get("exit_code") not in (None, 0)])
        what_happened.append(f"Verification: {len(verification_commands)} commands ({passed} passed, {failed} failed)")
    if patch_path and files_changed:
        what_happened.append(f"Patch generated with {len(files_changed)} files changed.")
    if outcome == "no_changes_by_design":
        what_happened.append("No changes were produced between base and integration branches.")
    if error_message and error_message not in what_happened:
        what_happened.append(error_message)
    if key_findings:
        what_happened.extend(key_findings)
    what_happened = _dedupe(what_happened)

    next_actions: List[str] = []
    next_actions.extend(recommended_actions)
    next_actions.extend(next_steps)
    if patch_path:
        next_actions.append("Review PATCH.diff for change details.")
    if blockers:
        next_actions.append("Resolve blockers and re-run the orchestration.")
    if verification_commands and any(cmd.get("exit_code") not in (None, 0) for cmd in verification_commands):
        next_actions.append("Review verification logs for failed commands.")
    if outcome == "no_changes_by_design":
        next_actions.append("Confirm scope or expand instructions if changes were expected.")
    next_actions = _dedupe(next_actions)

    headline = legacy_headline or summary_text or (
        "No changes produced" if outcome == "no_changes_by_design" else "Repo orchestration completed"
    )

    report_json = {
        "schema_version": "1.0",
        "run_id": run_id,
        "repo": {
            "url": repo,
            "branch": branch_name,
            "commit_before": commit_before,
            "commit_after": commit_after,
        },
        "outcome": outcome,
        "summary": {
            "headline": headline,
            "what_happened": what_happened,
            "next_actions": next_actions,
        },
        "verification": {"commands": verification_commands},
        "changes": {
            "files_changed": files_changed,
            "patch_artifact": _to_relpath(patch_path, run_dir),
        },
        "findings": {
            "todo_count": findings_payload.get("todo_count", 0),
            "placeholder_count": findings_payload.get("placeholder_count", 0),
            "high_risk_items": findings_payload.get("high_risk_items", []),
            "findings_artifact": _to_relpath(findings_path, run_dir),
        },
        "blockers": blockers,
        "artifacts": {
            "report_md": "REPORT.md",
            "verification_md": _to_relpath(verification_md_path, run_dir),
            "verification_json": _to_relpath(verification_json_path, run_dir),
        },
    }

    report_md = _report_md_from_json(report_json)

    report_md_path = run_dir / "REPORT.md"
    report_md_path.write_text(report_md, encoding="utf-8")

    report_json_path = run_dir / "REPORT.json"
    report_json_path.write_text(json.dumps(report_json, indent=2), encoding="utf-8")
    evidence_index = _write_evidence_index(run_dir, execution_result, manifest_path, taskgraph_path)

    artifacts: List[Dict[str, Any]] = []
    used_ids: set[str] = set()

    def _add_artifact(path: pathlib.Path, preferred_id: str) -> None:
        artifact_id = _slugify_artifact_id(preferred_id)
        counter = 1
        while artifact_id in used_ids:
            counter += 1
            artifact_id = f"{_slugify_artifact_id(preferred_id)}-{counter}"
        used_ids.add(artifact_id)
        artifacts.append(_artifact_record(path, artifact_id))

    _add_artifact(report_md_path, "report-md")
    _add_artifact(report_json_path, "report-json")
    _add_artifact(verification_md_path, "verification-md")
    _add_artifact(verification_json_path, "verification-json")
    if findings_path.exists():
        _add_artifact(findings_path, "placeholder-scan")
    if patch_path and patch_path.exists():
        _add_artifact(patch_path, "patch-diff")
    if evidence_index.exists():
        _add_artifact(evidence_index, "evidence-files")
    if html_path and html_path.exists():
        _add_artifact(html_path, "final-synthesis-html")
    if blockers:
        blockers_path = run_dir / "BLOCKERS.md"
        blockers_lines = ["# Blockers", ""]
        for blocker in blockers:
            if not isinstance(blocker, dict):
                continue
            code = blocker.get("code") or "BLOCKER"
            message = blocker.get("message") or ""
            fix = blocker.get("suggested_fix") or ""
            line = f"- **{code}**: {message}" if message else f"- **{code}**"
            if fix:
                line += f" (fix: {fix})"
            blockers_lines.append(line)
        blockers_path.write_text("\n".join(blockers_lines), encoding="utf-8")
        _add_artifact(blockers_path, "blockers-md")

    gates_report = run_dir / "REPO_GATES_REPORT.json"
    if gates_report.exists():
        _add_artifact(gates_report, "repo-gates-report")
    gates_summary = run_dir / "REPO_GATES_SUMMARY.md"
    if gates_summary.exists():
        _add_artifact(gates_summary, "repo-gates-summary")

    return artifacts, {"codex_runs": codex_runs, "synthesis_html": synthesis_html}


def _parse_owner_repo(repo: str) -> Tuple[str, str]:
    candidate = repo.strip()
    parsed = urlparse(candidate)
    parts = [p for p in parsed.path.split("/") if p] if parsed.scheme else [p for p in candidate.split("/") if p]
    if len(parts) < 2:
        raise ValueError("Unable to parse repository identifier")
    owner, name = parts[-2], parts[-1]
    if name.endswith(".git"):
        name = name[:-4]
    return owner, name


def _materialize_task_branches(
    repo_path: pathlib.Path,
    base_branch: str,
    run_id: str,
    task_results: List[Dict[str, Any]],
) -> Dict[str, str]:
    branches: Dict[str, str] = {}
    for task in task_results:
        task_id = task.get("task_id")
        diff_path_str = (task.get("artifacts") or {}).get("diff")
        if not task_id or not diff_path_str:
            continue
        diff_path = pathlib.Path(diff_path_str)
        if not diff_path.exists():
            continue
        try:
            diff_text = diff_path.read_text(encoding="utf-8")
        except Exception:
            continue
        if not diff_text.strip():
            continue

        branch_name = f"{run_id}-{task_id}"
        checkout_base = subprocess.run(
            ["git", "-C", str(repo_path), "checkout", base_branch],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if checkout_base.returncode != 0:
            raise MergeCoordinatorError(f"Failed to checkout {base_branch}: {checkout_base.stderr}")

        branch_create = subprocess.run(
            ["git", "-C", str(repo_path), "checkout", "-B", branch_name, base_branch],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if branch_create.returncode != 0:
            raise MergeCoordinatorError(f"Failed to create branch {branch_name}: {branch_create.stderr}")

        apply_proc = subprocess.run(
            ["git", "-C", str(repo_path), "apply", str(diff_path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if apply_proc.returncode != 0:
            raise MergeCoordinatorError(
                f"Failed to apply patch for {task_id}: {apply_proc.stderr or apply_proc.stdout}"
            )

        status_proc = subprocess.run(
            ["git", "-C", str(repo_path), "status", "--porcelain"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if status_proc.stdout.strip():
            git_env = os.environ.copy()
            git_env.setdefault("GIT_COMMITTER_NAME", "repo-orchestrator")
            git_env.setdefault("GIT_COMMITTER_EMAIL", "repo-orchestrator@example.com")
            git_env.setdefault("GIT_AUTHOR_NAME", git_env["GIT_COMMITTER_NAME"])
            git_env.setdefault("GIT_AUTHOR_EMAIL", git_env["GIT_COMMITTER_EMAIL"])
            subprocess.run(["git", "-C", str(repo_path), "add", "-A"], check=True)
            subprocess.run(
                ["git", "-C", str(repo_path), "commit", "-m", f"Task {task_id} changes"],
                check=True,
                env=git_env,
            )
            branches[task_id] = branch_name

        # Reset back to base branch for the next iteration
        subprocess.run(["git", "-C", str(repo_path), "checkout", base_branch], check=False)
    return branches


@app.post("/orchestrate/repo", response_class=StreamingResponse)
async def start_repo_orchestration(
    req: RepoOrchestrationRequest,
    request: Request,
    execution_token: Optional[str] = Header(default=None, alias="X-Execution-Token"),
    admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    """Start a repository-first orchestration workflow with streaming progress."""
    _require_execution_access(execution_token or admin_token)

    if (
        GitHubCloneService is None
        or RepoIntakeService is None
        or SupervisorPlanner is None
        or TaskExecutor is None
        or CodexSwarmService is None
    ):
        raise HTTPException(status_code=503, detail="orchestration bridge components are unavailable")

    run_suffix = uuid.uuid4().hex[:6]
    safe_slug = sanitize_run_id(req.goal or req.repo)[:40]
    run_id = f"repo-{safe_slug}-{run_suffix}"
    run_dir = BRIDGE_RUN_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "run_id": run_id,
        "repo": req.repo,
        "goal": req.goal,
        "options": _redact_options(req.options.model_dump()),
        "status": "accepted",
        "requested_at": now_iso(),
    }
    _persist_repo_state(_repo_manifest_path(run_id), manifest)

    event_queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue()
    loop = asyncio.get_event_loop()
    cancel_event = asyncio.Event()
    try:
        codex_service = CodexSwarmService(
            codex_script_path=pathlib.Path(CODEX_SWARM_PS1),
            output_dir=run_dir / "codex_runs",
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    async with _repo_state_lock:
        _repo_orchestration_state[run_id] = {
            "cancel_event": cancel_event,
            "codex_service": codex_service,
            "codex_runs": set(),
        }

    def _enqueue_sync(payload: Dict[str, Any]) -> None:
        payload.setdefault("run_id", run_id)
        loop.call_soon_threadsafe(event_queue.put_nowait, payload)

    async def _enqueue(payload: Dict[str, Any]) -> None:
        payload.setdefault("run_id", run_id)
        await event_queue.put(payload)

    async def _pipeline() -> None:
        manifest_path = _repo_manifest_path(run_id)
        execution_result: Dict[str, Any] = {}
        taskgraph_path: Optional[pathlib.Path] = None
        merge_result: Dict[str, Any] = {}
        try:
            await _enqueue({"type": "status", "message": "accepted"})
            orchestration_token = req.options.github_token or os.environ.get("GITHUB_TOKEN")
            clone_service = GitHubCloneService(
                github_token=orchestration_token,
                clone_base_dir=run_dir,
            )

            def _on_clone_progress(progress: Dict[str, Any]) -> None:
                safe_progress = dict(progress)
                if isinstance(safe_progress.get("message"), str):
                    safe_progress["message"] = safe_progress["message"][:200]
                _enqueue_sync({"type": "clone_progress", "progress": safe_progress})

            clone_path = await asyncio.to_thread(
                clone_service.clone_repository,
                req.repo,
                req.options.branch,
                _on_clone_progress,
                run_id,
            )
            manifest.update({"clone_path": str(clone_path), "status": "cloned"})
            _persist_repo_state(manifest_path, manifest)
            await _enqueue({"type": "cloned", "repo_path": str(clone_path)})

            if cancel_event.is_set():
                raise TaskExecutionError("cancelled")

            intake_service = RepoIntakeService(
                github_token=orchestration_token,
                runs_dir=BRIDGE_RUN_DIR,
            )

            def _on_intake_progress(progress: Dict[str, Any]) -> None:
                payload = dict(progress)
                payload_type = payload.pop("stage", "repo_context")
                message = str(payload.pop("message", "Repo context progress"))
                _enqueue_sync({"type": payload_type, "message": message, "progress": payload})

            intake = await asyncio.to_thread(
                intake_service.run_intake,
                req.repo,
                run_id,
                req.options.branch,
                clone_path,
                _on_intake_progress,
            )
            manifest.update({"intake": intake, "status": "intake_complete"})
            _persist_repo_state(manifest_path, manifest)
            await _enqueue({"type": "intake_complete", "artifacts": intake.get("artifacts")})

            planner = SupervisorPlanner(runs_dir=BRIDGE_RUN_DIR)
            constraints = {
                "allowed_paths": req.options.allowed_paths,
                "max_parallel": req.options.max_parallel,
                "risk_posture": req.options.risk_posture,
                "model": req.options.model,
            }
            taskgraph = planner.generate_taskgraph(
                run_id=run_id,
                intake=intake,
                user_goal=req.goal,
                constraints=constraints,
            )
            taskgraph_path = pathlib.Path(taskgraph["artifacts"]["taskgraph_json"])
            manifest.update({"taskgraph": taskgraph, "status": "planned"})
            _persist_repo_state(manifest_path, manifest)
            await _enqueue({"type": "planned", "taskgraph": taskgraph["artifacts"]})

            if cancel_event.is_set():
                raise TaskExecutionError("cancelled")

            executor = TaskExecutor(runs_dir=BRIDGE_RUN_DIR, codex_service=codex_service)

            def _on_task_progress(event: Dict[str, Any]) -> None:
                if event.get("event") == "codex_run_started" and event.get("codex_run_id"):
                    async def _record_codex():
                        async with _repo_state_lock:
                            state = _repo_orchestration_state.get(run_id, {})
                            runs = state.get("codex_runs", set())
                            runs.add(event["codex_run_id"])
                            state["codex_runs"] = runs
                            _repo_orchestration_state[run_id] = state
                    asyncio.run_coroutine_threadsafe(_record_codex(), loop)
                event_type = (
                    str(event.get("event"))
                    if event.get("event") in {"codex_run_started", "codex_summary", "task_failed"}
                    else "task_progress"
                )
                _enqueue_sync({"type": event_type, **event})

            execution_result = await asyncio.to_thread(
                executor.execute_taskgraph,
                repo_path=clone_path,
                run_id=run_id,
                taskgraph_path=taskgraph_path,
                progress_callback=_on_task_progress,
                cancel_event=cancel_event,
            )
            manifest.update({"tasks": execution_result, "status": "executed"})
            _persist_repo_state(manifest_path, manifest)
            await _enqueue({"type": "tasks_complete", "tasks": execution_result})

            task_results = execution_result.get("tasks") or []
            failed_tasks = [
                task for task in task_results if str(task.get("status") or "").lower() not in {"completed", "success"}
            ]
            if failed_tasks:
                failed_ids = [str(task.get("task_id") or "<unknown>") for task in failed_tasks]
                raise TaskExecutionError(f"task execution failed for: {', '.join(failed_ids)}")

            if cancel_event.is_set():
                raise TaskExecutionError("cancelled")

            repo_gates_enabled = os.environ.get("REPO_ORCHESTRATION_GATES", "false").lower() == "true"
            repo_gates_strict = os.environ.get("REPO_ORCHESTRATION_GATES_STRICT", "false").lower() == "true"
            repo_gates_normalize = os.environ.get("REPO_ORCHESTRATION_GATES_NORMALIZE", "false").lower() == "true"
            if repo_gates_enabled:
                if not ORCHESTRATOR_LOGGING_AVAILABLE:
                    logger.warning("Repo gates requested but OrchestratorVerifier is unavailable")
                else:
                    gate_logs_dir = run_dir / "gate-logs"
                    verifier = OrchestratorVerifier(clone_path, log_dir=gate_logs_dir)
                    if repo_gates_normalize:
                        gate_results = verifier.run_all_verifications()
                    else:
                        gate_results = {
                            "lint_result": verifier.verify_lint(),
                            "build_result": verifier.verify_build(),
                            "unit_test_result": verifier.verify_unit_tests(),
                            "smoke_test_result": verifier.verify_smoke_tests(),
                            "docker_compose_valid": verifier.verify_docker_compose(),
                            "paths_to_full_logs": [],
                        }
                        log_paths = []
                        for key in ["lint_result", "build_result", "unit_test_result", "smoke_test_result"]:
                            result = gate_results.get(key)
                            if result and isinstance(result, dict) and result.get("log_path"):
                                log_paths.append(result["log_path"])
                        gate_results["paths_to_full_logs"] = log_paths

                    gate_summary = _summarize_repo_gates(gate_results)
                    gate_report_path = run_dir / "REPO_GATES_REPORT.json"
                    gate_report_path.write_text(json.dumps(gate_results, indent=2), encoding="utf-8")
                    gate_summary_path = run_dir / "REPO_GATES_SUMMARY.md"
                    gate_summary_lines = [
                        "# Repo Gates Summary",
                        "",
                        f"- Run ID: `{run_id}`",
                        f"- Repo: `{req.repo}`",
                        f"- Branch: `{req.options.branch or 'default'}`",
                        f"- Failed: {gate_summary['failed_count']}",
                        f"- Passed: {gate_summary['passed_count']}",
                        f"- Skipped: {gate_summary['skipped_count']}",
                        "",
                        "## Checks",
                    ]
                    for name, meta in gate_summary["checks"].items():
                        gate_summary_lines.append(f"- **{name}**: {meta['status']}")
                    gate_summary_path.write_text("\n".join(gate_summary_lines), encoding="utf-8")

                    manifest.update(
                        {
                            "repo_gates": {
                                "enabled": True,
                                "strict": repo_gates_strict,
                                "normalize": repo_gates_normalize,
                                "report": str(gate_report_path),
                                "summary": str(gate_summary_path),
                                "results": gate_results,
                            }
                        }
                    )
                    _persist_repo_state(manifest_path, manifest)
                    await _enqueue(
                        {
                            "type": "repo_gates_complete",
                            "summary": gate_summary,
                            "report": str(gate_report_path),
                        }
                    )

                    if repo_gates_strict and gate_summary["failed_count"] > 0:
                        raise TaskExecutionError("repo gates failed")

            coordinator = MergeCoordinator(github_token=orchestration_token, runs_dir=BRIDGE_RUN_DIR)
            base_branch = req.options.base_branch or coordinator._detect_default_branch(clone_path)  # type: ignore[attr-defined]
            integration_branch = req.options.integration_branch or f"{run_id}-integration"
            branch_map = _materialize_task_branches(
                repo_path=clone_path,
                base_branch=base_branch,
                run_id=run_id,
                task_results=execution_result.get("tasks", []),
            )
            if branch_map:
                tg_data = safe_json_load(taskgraph_path, default={}, context=f"taskgraph:{run_id}")
                for task in tg_data.get("tasks", []):
                    task_id = task.get("id")
                    if task_id in branch_map:
                        task["branch"] = branch_map[task_id]
                taskgraph_path.write_text(json.dumps(tg_data, indent=2), encoding="utf-8")

            repo_owner, repo_name = _parse_owner_repo(req.repo)
            merge_result = coordinator.merge_taskgraph(
                repo_path=clone_path,
                run_id=run_id,
                repo_owner=repo_owner,
                repo_name=repo_name,
                base_branch=base_branch,
                integration_branch=integration_branch,
                taskgraph_path=taskgraph_path,
                pr_title=req.options.pr_title,
                pr_body=req.options.pr_body,
                push_integration=True,
            )
            manifest.update({"merge": merge_result, "status": merge_result.get("status")})
            _persist_repo_state(manifest_path, manifest)
            await _enqueue({"type": "merged", "merge": merge_result})

            artifacts_index, synthesis_payload = _build_artifacts_index(
                run_dir=run_dir,
                repo=req.repo,
                branch=req.options.branch,
                run_id=run_id,
                status=merge_result.get("status", "unknown"),
                execution_result=execution_result,
                manifest_path=manifest_path,
                taskgraph_path=taskgraph_path,
                base_branch=base_branch,
                integration_branch=integration_branch,
            )

            result_payload = {
                "run_id": run_id,
                "status": merge_result.get("status", "unknown"),
                "pr_url": (merge_result.get("pr") or {}).get("pr_url"),
                "artifacts": {
                    "run_dir": str(run_dir),
                    "manifest": str(manifest_path),
                    "result": str(_repo_result_path(run_id)),
                    **synthesis_payload,
                    "index": artifacts_index,
                },
                "artifacts_index": artifacts_index,
            }
            manifest.update({"artifacts_index": artifacts_index})
            _persist_repo_state(manifest_path, manifest)
            _persist_repo_state(_repo_result_path(run_id), result_payload)
            await _enqueue({"type": "complete", "final": True, "result": result_payload})
        except RepositoryCloneError as exc:
            error_msg = str(exc)
            manifest.update({"status": "error", "error": error_msg})
            if getattr(exc, "payload", None):
                manifest["error_detail"] = exc.payload
            _persist_repo_state(manifest_path, manifest)
            artifacts_index, synthesis_payload = _build_artifacts_index(
                run_dir=run_dir,
                repo=req.repo,
                branch=req.options.branch,
                run_id=run_id,
                status="error",
                execution_result=execution_result,
                manifest_path=manifest_path,
                taskgraph_path=taskgraph_path,
                error_message=error_msg,
            )
            result_payload = {
                "run_id": run_id,
                "status": "error",
                "error": error_msg,
                "error_detail": getattr(exc, "payload", None),
                "artifacts": {
                    "run_dir": str(run_dir),
                    "manifest": str(manifest_path),
                    "result": str(_repo_result_path(run_id)),
                    **synthesis_payload,
                    "index": artifacts_index,
                },
                "artifacts_index": artifacts_index,
            }
            manifest.update({"artifacts_index": artifacts_index})
            _persist_repo_state(manifest_path, manifest)
            _persist_repo_state(_repo_result_path(run_id), result_payload)
            await _enqueue(
                {
                    "type": "error",
                    "message": getattr(exc, "payload", {}).get("userMessage") if getattr(exc, "payload", None) else error_msg,
                    "error": getattr(exc, "payload", None),
                    "final": True,
                    "result": result_payload,
                }
            )
        except TaskExecutionError as exc:
            error_msg = "cancelled" if str(exc) == "cancelled" else str(exc)
            manifest.update({"status": "cancelled" if str(exc) == "cancelled" else "error", "error": error_msg})
            _persist_repo_state(manifest_path, manifest)
            artifacts_index, synthesis_payload = _build_artifacts_index(
                run_dir=run_dir,
                repo=req.repo,
                branch=req.options.branch,
                run_id=run_id,
                status="cancelled" if str(exc) == "cancelled" else "error",
                execution_result=execution_result,
                manifest_path=manifest_path,
                taskgraph_path=taskgraph_path,
                error_message=error_msg,
            )
            result_payload = {
                "run_id": run_id,
                "status": "cancelled" if str(exc) == "cancelled" else "error",
                "error": error_msg,
                "artifacts": {
                    "run_dir": str(run_dir),
                    "manifest": str(manifest_path),
                    "result": str(_repo_result_path(run_id)),
                    **synthesis_payload,
                    "index": artifacts_index,
                },
                "artifacts_index": artifacts_index,
            }
            manifest.update({"artifacts_index": artifacts_index})
            _persist_repo_state(manifest_path, manifest)
            _persist_repo_state(_repo_result_path(run_id), result_payload)
            await _enqueue({"type": "error", "message": error_msg, "final": True, "result": result_payload})
        except Exception as exc:
            manifest.update({"status": "error", "error": str(exc)})
            _persist_repo_state(manifest_path, manifest)
            artifacts_index, synthesis_payload = _build_artifacts_index(
                run_dir=run_dir,
                repo=req.repo,
                branch=req.options.branch,
                run_id=run_id,
                status="error",
                execution_result=execution_result,
                manifest_path=manifest_path,
                taskgraph_path=taskgraph_path,
                error_message=str(exc),
            )
            result_payload = {
                "run_id": run_id,
                "status": "error",
                "error": str(exc),
                "artifacts": {
                    "run_dir": str(run_dir),
                    "manifest": str(manifest_path),
                    "result": str(_repo_result_path(run_id)),
                    **synthesis_payload,
                    "index": artifacts_index,
                },
                "artifacts_index": artifacts_index,
            }
            manifest.update({"artifacts_index": artifacts_index})
            _persist_repo_state(manifest_path, manifest)
            _persist_repo_state(_repo_result_path(run_id), result_payload)
            await _enqueue({"type": "error", "message": str(exc), "final": True, "result": result_payload})
        finally:
            async with _repo_state_lock:
                _repo_orchestration_state.pop(run_id, None)

    asyncio.create_task(_pipeline())

    async def event_generator():
        while True:
            try:
                payload = await event_queue.get()
            except asyncio.CancelledError:
                break
            yield f"data: {json.dumps(payload)}\n\n"
            if payload.get("final"):
                break
            if await request.is_disconnected():
                cancel_event.set()
                break

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=headers)


@app.get("/orchestrate/repo/{run_id}")
def get_repo_orchestration(run_id: str):
    manifest_path = _repo_manifest_path(run_id)
    if not manifest_path.exists():
        raise HTTPException(status_code=404, detail="Run not found")
    data = safe_json_load(manifest_path, default={}, context=f"repo_manifest:{run_id}") or {}
    result_path = _repo_result_path(run_id)
    if result_path.exists():
        data["result"] = safe_json_load(result_path, default={}, context=f"repo_result:{run_id}")
    if data.get("result") and not data["result"].get("artifacts_index"):
        artifacts = (data["result"].get("artifacts") or {}).get("index")
        if artifacts:
            data["result"]["artifacts_index"] = artifacts
    return data


@app.get("/orchestrate/repo")
def list_repo_orchestrations(limit: int = Query(50, ge=1, le=200)):
    runs: List[Dict[str, Any]] = []
    for run_dir in BRIDGE_RUN_DIR.iterdir():
        if not run_dir.is_dir():
            continue
        manifest_path = run_dir / "repo-orchestration.json"
        if not manifest_path.exists():
            continue
        manifest = safe_json_load(manifest_path, default={}, context=f"repo_manifest:{run_dir.name}") or {}
        report_path = run_dir / "REPORT.json"
        report_summary = None
        if report_path.exists():
            report = safe_json_load(report_path, default=None, context=f"report_json:{run_dir.name}")
            if isinstance(report, dict) and report.get("schema_version") == "1.0":
                summary = report.get("summary") if isinstance(report.get("summary"), dict) else {}
                report_summary = {
                    "outcome": report.get("outcome"),
                    "headline": summary.get("headline") if isinstance(summary, dict) else None,
                    "patch": bool((report.get("changes") or {}).get("patch_artifact")),
                    "commands_executed": len((report.get("verification") or {}).get("commands") or []),
                }

        run_entry = {
            "run_id": manifest.get("run_id") or run_dir.name,
            "repo": manifest.get("repo"),
            "branch": (manifest.get("options") or {}).get("branch") if isinstance(manifest.get("options"), dict) else None,
            "status": manifest.get("status"),
            "requested_at": manifest.get("requested_at"),
            "report_summary": report_summary,
        }
        runs.append(run_entry)

    def _sort_key(item: Dict[str, Any]) -> str:
        return str(item.get("requested_at") or "")

    runs.sort(key=_sort_key, reverse=True)
    return {"runs": runs[:limit]}


@app.get("/orchestrate/repo/{run_id}/synthesis/{codex_run_id}")
def get_repo_synthesis_html(run_id: str, codex_run_id: str):
    if any(sep in run_id for sep in ("/", "\\")) or any(sep in codex_run_id for sep in ("/", "\\")):
        raise HTTPException(status_code=400, detail="Invalid run identifier")

    synthesis_path = (
        BRIDGE_RUN_DIR
        / run_id
        / "codex_runs"
        / codex_run_id
        / "swarm-output"
        / "Final_Synthesis.html"
    )
    if not synthesis_path.exists():
        raise HTTPException(status_code=404, detail="Final synthesis not found")

    html = synthesis_path.read_text(encoding="utf-8", errors="replace")
    return Response(content=html, media_type="text/html")


def _load_artifacts_index(run_id: str) -> List[Dict[str, Any]]:
    result_path = _repo_result_path(run_id)
    if not result_path.exists():
        return []
    data = safe_json_load(result_path, default={}, context=f"repo_result:{run_id}") or {}
    artifacts_index = data.get("artifacts_index")
    if artifacts_index:
        return artifacts_index
    artifacts = (data.get("artifacts") or {}).get("index")
    return artifacts or []


@app.get("/orchestrate/repo/{run_id}/artifacts")
def list_repo_artifacts(run_id: str):
    artifacts_index = _load_artifacts_index(run_id)
    if not artifacts_index:
        raise HTTPException(status_code=404, detail="No artifacts found for run")
    return {"run_id": run_id, "artifacts": artifacts_index}


@app.get("/orchestrate/repo/{run_id}/artifacts/{artifact_id}")
def get_repo_artifact(run_id: str, artifact_id: str):
    artifacts_index = _load_artifacts_index(run_id)
    match = None
    for artifact in artifacts_index:
        if artifact.get("artifactId") == artifact_id:
            match = artifact
            break
    if not match:
        raise HTTPException(status_code=404, detail="Artifact not found")

    path = pathlib.Path(match["filePath"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Artifact file missing")

    run_dir = BRIDGE_RUN_DIR / run_id
    try:
        if not str(path.resolve()).startswith(str(run_dir.resolve())):
            raise HTTPException(status_code=403, detail="Artifact path not allowed")
    except Exception:
        raise HTTPException(status_code=403, detail="Artifact path not allowed")

    content = path.read_text(encoding="utf-8", errors="replace")
    return Response(content=content, media_type=match.get("mimeType") or "text/plain")


@app.get("/orchestrate/repo/{run_id}/artifacts.zip")
def download_repo_artifacts_zip(run_id: str):
    artifacts_index = _load_artifacts_index(run_id)
    if not artifacts_index:
        raise HTTPException(status_code=404, detail="No artifacts found for run")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zipf:
        for artifact in artifacts_index:
            path = pathlib.Path(artifact["filePath"])
            if not path.exists():
                continue
            arcname = pathlib.Path(artifact["fileName"]).name
            zipf.write(path, arcname=arcname)

    buffer.seek(0)
    headers = {"Content-Disposition": f"attachment; filename={run_id}-artifacts.zip"}
    return Response(content=buffer.getvalue(), media_type="application/zip", headers=headers)


@app.post("/orchestrate/repo/{run_id}/cancel")
async def cancel_repo_orchestration(
    run_id: str,
    execution_token: Optional[str] = Header(default=None, alias="X-Execution-Token"),
    admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    _require_execution_access(execution_token or admin_token)

    async with _repo_state_lock:
        state = _repo_orchestration_state.get(run_id)
    if not state:
        raise HTTPException(status_code=404, detail="Run not active or already finished")
    cancel_event: asyncio.Event = state.get("cancel_event")  # type: ignore[assignment]
    cancel_event.set()
    codex_service = state.get("codex_service")
    for codex_run_id in list(state.get("codex_runs", [])):
        try:
            await codex_service.cancel_run(codex_run_id)  # type: ignore[operator]
        except Exception:
            continue
    return {"run_id": run_id, "cancelled": True}

class RunFeedbackRequest(BaseModel):
    """Request model for submitting run feedback (from Supervisor)."""
    run_id: str
    quality_score: float = Field(..., ge=0, le=10)
    feedback: List[str] = Field(default_factory=list)
    insights: List[str] = Field(default_factory=list)
    agent_scores: Dict[str, float] = Field(default_factory=dict)


class RunFeedbackResponse(BaseModel):
    """Response model for run feedback."""
    id: int
    run_id: str
    quality_score: float
    created_at: str


@app.post("/orchestrate/run/{run_id}/feedback", response_model=RunFeedbackResponse)
def submit_run_feedback(run_id: str, feedback: RunFeedbackRequest):
    """
    Submit feedback for a completed orchestration run.
    This is typically called by the Supervisor agent to record quality assessments.
    """
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        now = now_iso()
        
        # Insert feedback
        c.execute("""
            INSERT INTO run_feedback 
            (run_id, quality_score, feedback_json, insights_json, agent_scores_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            run_id,
            feedback.quality_score,
            json.dumps(feedback.feedback),
            json.dumps(feedback.insights),
            json.dumps(feedback.agent_scores),
            now
        ))
        
        feedback_id = c.lastrowid
        conn.commit()
        
        return RunFeedbackResponse(
            id=feedback_id,
            run_id=run_id,
            quality_score=feedback.quality_score,
            created_at=now
        )


@app.get("/orchestrate/run/{run_id}/feedback")
def get_run_feedback(run_id: str):
    """Get feedback for a specific orchestration run."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        c.execute("""
            SELECT id, run_id, quality_score, feedback_json, insights_json, 
                   agent_scores_json, created_at
            FROM run_feedback
            WHERE run_id = ?
            ORDER BY created_at DESC
        """, (run_id,))
        
        rows = c.fetchall()
        
        feedback_list = []
        for row in rows:
            feedback_list.append({
                "id": row["id"],
                "run_id": row["run_id"],
                "quality_score": row["quality_score"],
                "feedback": json.loads(row["feedback_json"]) if row["feedback_json"] else [],
                "insights": json.loads(row["insights_json"]) if row["insights_json"] else [],
                "agent_scores": json.loads(row["agent_scores_json"]) if row["agent_scores_json"] else {},
                "created_at": row["created_at"]
            })
        
        return {"run_id": run_id, "feedback": feedback_list}


@app.get("/orchestrate/feedback/recent")
def get_recent_feedback(limit: int = Query(10, ge=1, le=100)):
    """Get recent run feedback across all runs."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        c.execute("""
            SELECT id, run_id, quality_score, feedback_json, insights_json,
                   agent_scores_json, created_at
            FROM run_feedback
            ORDER BY created_at DESC
            LIMIT ?
        """, (limit,))
        
        rows = c.fetchall()
        
        feedback_list = []
        for row in rows:
            feedback_list.append({
                "id": row["id"],
                "run_id": row["run_id"],
                "quality_score": row["quality_score"],
                "feedback": json.loads(row["feedback_json"]) if row["feedback_json"] else [],
                "insights": json.loads(row["insights_json"]) if row["insights_json"] else [],
                "agent_scores": json.loads(row["agent_scores_json"]) if row["agent_scores_json"] else {},
                "created_at": row["created_at"]
            })
        
        return {"feedback": feedback_list}


@app.get("/orchestrate/learning/patterns")
def get_learning_patterns(pattern_type: Optional[str] = None, limit: int = Query(20, ge=1, le=100)):
    """Get learned patterns from successful runs."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        if pattern_type:
            c.execute("""
                SELECT id, pattern_type, pattern_data, source_run_ids, quality_score,
                       usage_count, success_rate, created_at, last_used_at
                FROM learning_patterns
                WHERE pattern_type = ?
                ORDER BY quality_score DESC, usage_count DESC
                LIMIT ?
            """, (pattern_type, limit))
        else:
            c.execute("""
                SELECT id, pattern_type, pattern_data, source_run_ids, quality_score,
                       usage_count, success_rate, created_at, last_used_at
                FROM learning_patterns
                ORDER BY quality_score DESC, usage_count DESC
                LIMIT ?
            """, (limit,))
        
        rows = c.fetchall()
        
        patterns = []
        for row in rows:
            patterns.append({
                "id": row["id"],
                "pattern_type": row["pattern_type"],
                "pattern_data": json.loads(row["pattern_data"]) if row["pattern_data"] else {},
                "source_run_ids": json.loads(row["source_run_ids"]) if row["source_run_ids"] else [],
                "quality_score": row["quality_score"],
                "usage_count": row["usage_count"],
                "success_rate": row["success_rate"],
                "created_at": row["created_at"],
                "last_used_at": row["last_used_at"]
            })
        
        return {"patterns": patterns}


class CloneProgressResponse(BaseModel):
    """Response model for clone progress."""
    clone_id: str
    repo_url: str
    status: str
    progress_percent: float
    message: str
    clone_path: Optional[str] = None
    start_time: str
    end_time: Optional[str] = None
    error: Optional[str] = None
    size_mb: Optional[float] = None
    file_count: Optional[int] = None
    branches: Optional[List[str]] = None


@app.post("/github/search", response_model=List[GitHubRepoInfo])
def search_github_repositories(request: GitHubSearchRequest):
    """
    Search for repositories on GitHub.
    
    Args:
        request: Search request with query and max results
        
    Returns:
        List of repository information
    """
    try:
        cloner = get_github_cloner()
        repos = cloner.search_repositories(request.query, request.max_results)
        return repos
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/github/repo/{owner}/{repo_name}", response_model=GitHubRepoInfo)
def get_repository_info(owner: str, repo_name: str):
    """
    Get detailed information about a specific repository.
    
    Args:
        owner: Repository owner
        repo_name: Repository name
        
    Returns:
        Repository information
    """
    try:
        cloner = get_github_cloner()
        info = cloner.get_repository_info(owner, repo_name)
        return info
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/github/clone", response_model=CloneProgressResponse)
def clone_repository(request: CloneRequest):
    """
    Clone a GitHub repository.
    
    Args:
        request: Clone request with repo URL and optional branch/depth
        
    Returns:
        Clone progress response with clone ID
    """
    try:
        cloner = get_github_cloner()
        clone_id = cloner.clone_repository(
            repo_url=request.repo_url,
            branch=request.branch,
            depth=request.depth
        )
        
        # Get initial progress
        progress = cloner.get_progress(clone_id)
        if not progress:
            raise HTTPException(status_code=500, detail="Failed to start clone")
        
        return CloneProgressResponse(
            clone_id=clone_id,
            repo_url=progress.repo_url,
            status=progress.status.value,
            progress_percent=progress.progress_percent,
            message=progress.message,
            clone_path=progress.clone_path,
            start_time=progress.start_time.isoformat(),
            end_time=progress.end_time.isoformat() if progress.end_time else None,
            error=progress.error,
            size_mb=progress.size_mb,
            file_count=progress.file_count,
            branches=progress.branches
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/github/clone/{clone_id}/progress", response_model=CloneProgressResponse)
def get_clone_progress(clone_id: str):
    """
    Get the progress of a clone operation.
    
    Args:
        clone_id: Clone operation ID
        
    Returns:
        Clone progress information
    """
    cloner = get_github_cloner()
    progress = cloner.get_progress(clone_id)
    
    if not progress:
        raise HTTPException(status_code=404, detail="Clone operation not found")
    
    return CloneProgressResponse(
        clone_id=clone_id,
        repo_url=progress.repo_url,
        status=progress.status.value,
        progress_percent=progress.progress_percent,
        message=progress.message,
        clone_path=progress.clone_path,
        start_time=progress.start_time.isoformat(),
        end_time=progress.end_time.isoformat() if progress.end_time else None,
        error=progress.error,
        size_mb=progress.size_mb,
        file_count=progress.file_count,
        branches=progress.branches
    )


@app.get("/github/clone/{clone_id}/tree")
def get_file_tree(clone_id: str, max_depth: int = Query(3, ge=1, le=10)):
    """
    Get the file tree of a cloned repository.
    
    Args:
        clone_id: Clone operation ID
        max_depth: Maximum depth to traverse
        
    Returns:
        File tree as nested JSON
    """
    cloner = get_github_cloner()
    tree = cloner.get_file_tree(clone_id, max_depth)
    
    if tree is None:
        raise HTTPException(status_code=404, detail="Clone not found or not completed")
    
    return tree


@app.delete("/github/clone/{clone_id}")
def cleanup_clone(clone_id: str):
    """
    Clean up a cloned repository.
    
    Args:
        clone_id: Clone operation ID
        
    Returns:
        Success message
    """
    cloner = get_github_cloner()
    success = cloner.cleanup_clone(clone_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Clone not found or cleanup failed")
    
    return {"message": "Clone cleaned up successfully"}


@app.get("/github/clones", response_model=List[CloneProgressResponse])
def list_clones():
    """
    List all tracked clone operations.
    
    Returns:
        List of clone progress information
    """
    cloner = get_github_cloner()
    clones = cloner.list_clones()
    
    return [
        CloneProgressResponse(
            clone_id=f"{int(progress.start_time.timestamp())}_{hash(progress.repo_url)}",
            repo_url=progress.repo_url,
            status=progress.status.value,
            progress_percent=progress.progress_percent,
            message=progress.message,
            clone_path=progress.clone_path,
            start_time=progress.start_time.isoformat(),
            end_time=progress.end_time.isoformat() if progress.end_time else None,
            error=progress.error,
            size_mb=progress.size_mb,
            file_count=progress.file_count,
            branches=progress.branches
        )
        for progress in clones
    ]


def _is_port_available(port: int, host: str = "0.0.0.0") -> bool:
    """Check if a port is available for binding.

    Does NOT set SO_REUSEADDR so that the check reflects the real bind state
    (SO_REUSEADDR can return false-positives, especially on Windows where it
    allows multiple listeners on the same port).
    """
    import socket
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind((host, port))
            return True
    except OSError:
        return False


def _get_port_owner(port: int) -> str:
    """Return a human-readable description of the process listening on *port*.

    Tries ``psutil`` first (cross-platform), then falls back to platform-native
    CLI tools (``ss``/``lsof`` on POSIX, ``netstat``/``tasklist`` on Windows).
    Returns ``"unknown process"`` when the owner cannot be determined.
    """
    # -- psutil path (preferred) ------------------------------------------
    try:
        import psutil  # type: ignore[import]
        for conn in psutil.net_connections(kind="inet"):
            if conn.laddr.port == port and conn.status == "LISTEN":
                try:
                    proc = psutil.Process(conn.pid)
                    return f"{proc.name()} (PID {conn.pid})"
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    if conn.pid:
                        return f"PID {conn.pid}"
    except ImportError:
        pass

    # -- CLI fallback -------------------------------------------------------
    try:
        if sys.platform == "win32":
            result = subprocess.run(
                ["netstat", "-ano"],
                capture_output=True, text=True, timeout=5,
            )
            for line in result.stdout.splitlines():
                if f":{port}" in line and "LISTENING" in line:
                    parts = line.split()
                    if parts:
                        pid = parts[-1]
                        r2 = subprocess.run(
                            ["tasklist", "/FI", f"PID eq {pid}", "/NH", "/FO", "CSV"],
                            capture_output=True, text=True, timeout=5,
                        )
                        for row in r2.stdout.splitlines():
                            if pid in row:
                                name = row.split(",")[0].strip('"')
                                return f"{name} (PID {pid})"
                        return f"PID {pid}"
        else:
            # Try ss (iproute2) first
            result = subprocess.run(
                ["ss", "-tlnp", f"sport = :{port}"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0:
                for line in result.stdout.splitlines():
                    if f":{port}" in line:
                        m = re.search(r'users:\(\("([^"]+)",pid=(\d+)', line)
                        if m:
                            return f"{m.group(1)} (PID {m.group(2)})"
            # Fallback: lsof
            result = subprocess.run(
                ["lsof", "-ti", f":{port}"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0 and result.stdout.strip():
                pid = result.stdout.strip().split("\n")[0]
                r2 = subprocess.run(
                    ["ps", "-p", pid, "-o", "comm="],
                    capture_output=True, text=True, timeout=5,
                )
                if r2.returncode == 0 and r2.stdout.strip():
                    return f"{r2.stdout.strip()} (PID {pid})"
                return f"PID {pid}"
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        pass

    return "unknown process"


def _find_available_port(start_port: int, max_attempts: int = 10, host: str = "0.0.0.0") -> int:
    """Find an available port starting from *start_port*.

    Emits a warning (to stderr) for each busy port encountered, including the
    name of the process holding it where determinable.
    """
    for offset in range(max_attempts):
        port = start_port + offset
        if _is_port_available(port, host):
            return port
        owner = _get_port_owner(port)
        print(
            f"WARNING: Port {port} is in use by {owner} — skipping.",
            file=sys.stderr,
        )
    raise RuntimeError(
        f"No available port found in range {start_port}–{start_port + max_attempts - 1}"
    )


if __name__ == "__main__":
    requested_port = int(os.environ.get("PROMPT_API_PORT", "8000"))
    host = os.environ.get("PROMPT_API_HOST", "127.0.0.1")

    # Determine whether to enable auto-reload (development only).
    # Reload uses a file-watcher subprocess which is not suitable for production.
    _debug_mode = os.environ.get("APP_ENV", "development").lower() in ("development", "dev", "local")
    _reload = _debug_mode and os.environ.get("UVICORN_RELOAD", "1") not in ("0", "false", "no")

    # Check if requested port is available; fall back to next free port.
    if _is_port_available(requested_port, host):
        port = requested_port
    else:
        owner = _get_port_owner(requested_port)
        print(
            f"WARNING: Port {requested_port} is already in use by {owner}. "
            "Searching for the next available port…",
            file=sys.stderr,
        )
        try:
            port = _find_available_port(requested_port + 1, max_attempts=10, host=host)
            print(f"INFO: Using alternative port {port}.", file=sys.stderr)
        except RuntimeError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            print(
                f"Please free port {requested_port} or set PROMPT_API_PORT to an available port.",
                file=sys.stderr,
            )
            sys.exit(1)

    log_level = os.environ.get("UVICORN_LOG_LEVEL", "info").lower()
    _keep_alive_raw = os.environ.get("UVICORN_KEEP_ALIVE", "30")
    try:
        _keep_alive = int(_keep_alive_raw)
    except ValueError:
        print(
            f"WARNING: UVICORN_KEEP_ALIVE='{_keep_alive_raw}' is not a valid integer; "
            "defaulting to 30 seconds.",
            file=sys.stderr,
        )
        _keep_alive = 30
    print(f"Starting Prompt API on {host}:{port} (reload={_reload}, log_level={log_level})")
    uvicorn.run(
        "app:app",
        host=host,
        port=port,
        reload=_reload,
        log_level=log_level,
        timeout_keep_alive=_keep_alive,
        access_log=True,
    )
### END FILE



