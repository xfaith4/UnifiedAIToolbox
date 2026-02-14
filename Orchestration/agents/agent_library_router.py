# ### BEGIN FILE: Orchestration/agents/agent_library_router.py
"""
Agents SDK multi-agent pipeline for enriching an agent-library JSON file.

Key changes vs the earlier MCP/Codex-based version:
- No MCP/Codex dependency (avoids "codex/event" notification validation issues).
- Deterministic *sequential* multi-agent run:
  Analyst -> Researcher -> Engineer -> Critic -> Synthesizer -> ValidationAuditor -> Commissioner -> Supervisor
  (so you never end up with “only File Analyst ran” again).
- Strict, typed JSON outputs per agent (Pydantic models) for robustness.
- Safe file IO tools + backup + JSON validation + checksum coercion.
- Local trace capture (trace.export()) written to output dir for observability.

Prereqs:
- OPENAI_API_KEY set in environment (recommended) or whatever auth your Agents SDK is configured for.
- Optional: set OPENAI_MODEL to a supported model name, or pass --model.

Run (direct):
  python Orchestration/agents/agent_library_router.py --agent-library path --target-file path

Run (via your PS wrapper) should continue to work as long as it calls this script.
"""

from __future__ import annotations

import argparse
import asyncio
import datetime as _dt
import hashlib
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple, TYPE_CHECKING

from pydantic import BaseModel, Field

try:
    from orchestration_mcp_middleware import OrchestrationMCPMiddleware
except ImportError:  # pragma: no cover - optional integration path
    OrchestrationMCPMiddleware = None  # type: ignore

if TYPE_CHECKING:
    from agents import Agent as _Agent  # pragma: no cover


# -----------------------------
# Output schemas (strict JSON)
# -----------------------------

class AnalystOutput(BaseModel):
    observations: str
    issues: List[str]
    opportunities: List[str]
    missing_fields_by_agent: Dict[str, List[str]]


class ResearcherOutput(BaseModel):
    best_practices: List[str]
    suggested_fields: List[str]
    risks: List[str]
    citations: List[str]


class EngineerOutput(BaseModel):
    updated_file_text: str
    change_log: List[str]
    warnings: List[str]


class CriticOutput(BaseModel):
    passed: bool
    issues: List[str]
    required_fixes: List[str]
    suggested_improvements: List[str]


class SynthesizerOutput(BaseModel):
    run_report_md: str
    diff_summary: str
    artifacts_written: List[str]


class ValidationAuditOutput(BaseModel):
    overall_status: str  # "pass" | "needs_refinement"
    stubouts: List[str]
    placeholders: List[str]
    unfinished_tasks: List[str]
    audit_summary: str


class CommissionerOutput(BaseModel):
    recommendation: str  # "go" | "no-go" | "conditional"
    value_score: float
    rationale: str
    concerns: List[str]


class SupervisorOutput(BaseModel):
    overall_score: float
    agent_scores: Dict[str, float]
    next_actions: List[str]
    notes: str


# -----------------------------
# Agents SDK import (lazy)
# -----------------------------

@dataclass(frozen=True)
class AgentsSdk:
    Agent: Any
    Runner: Any
    function_tool: Any
    trace: Any
    add_trace_processor: Any
    TracingProcessor: Any


def _import_agents_sdk() -> AgentsSdk:
    """
    Lazily import the OpenAI Agents SDK so CLI argument parsing and basic IO checks
    happen before the (potentially slow) dependency import on Windows.
    """
    from agents import Agent, Runner, function_tool, trace  # type: ignore
    from agents.tracing import add_trace_processor  # type: ignore
    from agents.tracing.processor_interface import TracingProcessor  # type: ignore

    return AgentsSdk(
        Agent=Agent,
        Runner=Runner,
        function_tool=function_tool,
        trace=trace,
        add_trace_processor=add_trace_processor,
        TracingProcessor=TracingProcessor,
    )


# -----------------------------
# Orchestration context + tools
# -----------------------------

@dataclass(frozen=True)
class OrchestrationContext:
    repo_root: Path
    agent_library_path: Path
    target_file_path: Path
    output_dir: Path
    run_id: str
    model: Optional[str]


def _is_within_root(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except Exception:
        return False


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _safe_json_loads(text: str) -> Any:
    return json.loads(text)


def _json_dumps_pretty(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2) + "\n"


def _sha256(text: str) -> str:
    h = hashlib.sha256()
    h.update(text.encode("utf-8"))
    return h.hexdigest()


def _extract_json_object(text: str) -> str:
    """
    Best-effort: if the model returns extra prose, try to extract the first top-level JSON object.
    """
    text = text.strip()
    if text.startswith("{") and text.endswith("}"):
        return text

    # common: fenced code block
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1).strip()

    # fallback: find first '{' and attempt to match braces
    start = text.find("{")
    if start < 0:
        raise ValueError("No JSON object found in output.")
    s = text[start:]
    depth = 0
    for i, ch in enumerate(s):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return s[: i + 1].strip()
    raise ValueError("Unbalanced braces while extracting JSON.")


# Tools are available for agents if you want them to reference file content.
# The pipeline also performs writes itself after validating output.

def read_file(path: str) -> str:
    p = Path(path)
    if not p.exists():
        return json.dumps({"error": f"File not found: {path}"})
    return p.read_text(encoding="utf-8")


def compute_sha256(text: str) -> str:
    return _sha256(text)


def execute_mcp_tool_with_enforcement(
    runtime_context: Dict[str, Any],
    invocation: Dict[str, Any],
    execute_fn: Callable[[], Dict[str, Any]],
) -> Dict[str, Any]:
    """Execute an MCP tool call with optional runtime governance enforcement."""
    if OrchestrationMCPMiddleware is None:
        return execute_fn()

    middleware = OrchestrationMCPMiddleware.from_environment(
        audit_log_dir=str(Path(__file__).resolve().parents[2] / "data" / "audit")
    )
    return middleware.execute_tool_call(runtime_context, invocation, execute_fn)


# -----------------------------
# Agent builders
# -----------------------------

def _base_system_rules() -> str:
    return (
        "You are part of a multi-agent pipeline. "
        "Return ONLY valid JSON matching the provided output schema. "
        "Do not wrap JSON in markdown fences. "
        "If you cannot comply, still return a JSON object that matches the schema and explain in fields."
    )


def _mk_agents(sdk: AgentsSdk, model: Optional[str]) -> Dict[str, Any]:
    model_arg = {"model": model} if model else {}
    read_file_tool = sdk.function_tool(read_file)
    compute_sha256_tool = sdk.function_tool(compute_sha256)

    analyst = sdk.Agent(
        name="FileAnalyst",
        instructions=_base_system_rules()
        + "\nTask: Inspect the target agent-library JSON file content. Identify missing/weak fields, schema inconsistencies, "
          "and opportunities to improve cross-agent coordination (handoffs, IO contracts, playbooks, tooling hints). "
          "Be concrete: list missing fields per agent name.",
        output_type=AnalystOutput,
        tools=[read_file_tool],
        **model_arg,
    )

    researcher = sdk.Agent(
        name="Researcher",
        instructions=_base_system_rules()
        + "\nTask: Provide best practices for agent-library design and multi-agent orchestration (handoffs, contracts, observability). "
          "If you cannot browse, still provide general best practices and leave citations empty.",
        output_type=ResearcherOutput,
        **model_arg,
    )

    engineer = sdk.Agent(
        name="Engineer",
        instructions=_base_system_rules()
        + "\nTask: Produce an UPDATED version of the target JSON file text. "
          "Rules:\n"
          "1) Preserve existing meaning; enhance by filling empty fields where sensible.\n"
          "2) Keep it valid JSON. Prefer stable structures.\n"
          "3) Ensure checksum fields are strings (or regenerate as string sha256 of each agent object minus checksum).\n"
          "4) Do not invent tools that the runtime cannot support—if you add a 'desired tools:' note, label it clearly.\n"
          "5) Output updated_file_text as the entire new file content (pretty-printed JSON).\n",
        output_type=EngineerOutput,
        tools=[compute_sha256_tool],
        **model_arg,
    )

    critic = sdk.Agent(
        name="Critic",
        instructions=_base_system_rules()
        + "\nTask: Review the updated JSON for correctness, consistency, and maintainability. "
          "Flag schema drift, ambiguous IO references, contradictory constraints, runaway verbosity, and type issues. "
          "If issues are severe, set passed=false and list required_fixes.",
        output_type=CriticOutput,
        **model_arg,
    )

    synthesizer = sdk.Agent(
        name="Synthesizer",
        instructions=_base_system_rules()
        + "\nTask: Create a concise run report in Markdown describing what changed, why it improves collaboration, "
          "and what artifacts were written. Also produce a short diff summary (human-readable).",
        output_type=SynthesizerOutput,
        **model_arg,
    )

    validation_auditor = sdk.Agent(
        name="ValidationAuditor",
        instructions=_base_system_rules()
        + "\nTask: Audit the proposed implementation for stub-outs, placeholders, and unfinished tasks. "
          "Look for TODO/TBD/FIXME markers, not-implemented notes, mock-only paths, and deferred critical work. "
          "Produce concise evidence lists that Commissioner and Supervisor can use for final review.",
        output_type=ValidationAuditOutput,
        **model_arg,
    )

    commissioner = sdk.Agent(
        name="Commissioner",
        instructions=_base_system_rules()
        + "\nTask: Provide a go/no-go/conditional recommendation for adopting these agent-library changes. "
          "Consider ROI, risk, and operational clarity. Give a value_score 0-10.",
        output_type=CommissionerOutput,
        **model_arg,
    )

    supervisor = sdk.Agent(
        name="Supervisor",
        instructions=_base_system_rules()
        + "\nTask: Score the run (overall_score 0-10) and score each agent (0-10). "
          "List next_actions to improve this orchestration pipeline and/or agent-library quality.",
        output_type=SupervisorOutput,
        **model_arg,
    )

    return {
        "analyst": analyst,
        "researcher": researcher,
        "engineer": engineer,
        "critic": critic,
        "synthesizer": synthesizer,
        "validation_auditor": validation_auditor,
        "commissioner": commissioner,
        "supervisor": supervisor,
    }


# -----------------------------
# Pipeline execution
# -----------------------------

async def _run_one_with_sdk(sdk: AgentsSdk, agent: Any, prompt: str, out_path: Path) -> Tuple[Any, str]:
    """
    Run an agent and persist both raw output and parsed JSON.
    Returns (parsed_obj, raw_text).
    """
    result = await sdk.Runner.run(agent, prompt)
    raw = result.final_output

    # final_output may be a Pydantic model if output_type is set; normalize to dict + raw
    if isinstance(raw, BaseModel):
        parsed = raw.model_dump()
        raw_text = json.dumps(parsed, ensure_ascii=False, indent=2)
    elif isinstance(raw, dict):
        parsed = raw
        raw_text = json.dumps(parsed, ensure_ascii=False, indent=2)
    else:
        raw_text = str(raw)
        # Try to parse as JSON object if it’s a string
        try:
            parsed_text = _extract_json_object(raw_text)
            parsed = json.loads(parsed_text)
        except Exception:
            parsed = {"_unparsed": True, "raw": raw_text}

    out_path.parent.mkdir(parents=True, exist_ok=True)
    _write_text(out_path, raw_text + "\n")
    _write_text(out_path.with_suffix(".parsed.json"), _json_dumps_pretty(parsed))
    return parsed, raw_text


def _backup_file(target: Path, output_dir: Path) -> Path:
    ts = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = output_dir / f"backup_{target.name}.{ts}.bak"
    backup.parent.mkdir(parents=True, exist_ok=True)
    backup.write_text(target.read_text(encoding="utf-8"), encoding="utf-8")
    return backup


def _coerce_checksums_to_str(agent_list: Any) -> Tuple[Any, List[str]]:
    """
    If the JSON is a list of agent objects (or dict containing one),
    ensure checksum fields are strings. Returns (updated_obj, warnings).
    """
    warnings: List[str] = []

    def coerce_one(obj: dict) -> None:
        if "checksum" in obj and obj["checksum"] is not None and not isinstance(obj["checksum"], str):
            warnings.append(f"Coerced checksum to string for agent name={obj.get('name')!r}")
            obj["checksum"] = str(obj["checksum"])

    if isinstance(agent_list, list):
        for obj in agent_list:
            if isinstance(obj, dict):
                coerce_one(obj)
        return agent_list, warnings

    if isinstance(agent_list, dict):
        # common patterns
        if isinstance(agent_list.get("agents"), list):
            for obj in agent_list["agents"]:
                if isinstance(obj, dict):
                    coerce_one(obj)
            return agent_list, warnings

    return agent_list, warnings


async def main() -> None:
    ap = argparse.ArgumentParser(description="Agents SDK multi-agent agent-library enricher")
    ap.add_argument("--agent-library", required=True, help="Path to agent-library JSON (used as input artifact reference)")
    ap.add_argument("--target-file", required=True, help="Path to file to update (often same as agent-library)")
    ap.add_argument("--output-dir", default=None, help="Directory for artifacts (defaults to Orchestration/artifacts/agents-sdk)")
    ap.add_argument("--repo-root", default=None, help="Repo root (defaults to CWD)")
    default_prompt = (
        "Update and enhance this file. Populate each field where it makes sense that would enhance this team of agents ability "
        "to work more effectively together and produce even higher quality output."
    )
    ap.add_argument("--prompt", dest="prompt", default=default_prompt,
                    help="User goal/prompt")
    ap.add_argument("--user-prompt", dest="prompt", default=argparse.SUPPRESS, help="Alias for --prompt (used by the PS wrapper)")
    ap.add_argument("--model", dest="model", default=os.getenv("OPENAI_MODEL") or None, help="Model name (optional)")
    ap.add_argument("--agents-model", dest="model", default=argparse.SUPPRESS, help="Alias for --model (used by the PS wrapper)")
    ap.add_argument("--trace-file", default=None, help="Write trace JSONL to this file (optional, used by the PS wrapper)")
    ap.add_argument("--no-trace", action="store_true", help="Disable tracing export")
    ap.add_argument("--dry-run", action="store_true", help="Do not write target file; still produce artifacts")
    args = ap.parse_args()

    repo_root = Path(args.repo_root).resolve() if args.repo_root else Path.cwd().resolve()
    agent_library_path = Path(args.agent_library).expanduser().resolve()
    target_file_path = Path(args.target_file).expanduser().resolve()

    # Default output dir under repo root for consistency with your toolbox layout
    output_dir = (
        Path(args.output_dir).expanduser().resolve()
        if args.output_dir
        else (repo_root / "Orchestration" / "artifacts" / "agents-sdk")
    )
    output_dir.mkdir(parents=True, exist_ok=True)

    run_id = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")

    ctx = OrchestrationContext(
        repo_root=repo_root,
        agent_library_path=agent_library_path,
        target_file_path=target_file_path,
        output_dir=output_dir,
        run_id=run_id,
        model=args.model,
    )

    # Hard safety: don’t let writes escape repo root unless user explicitly points outside.
    # (You *can* relax this if your repo has symlinks or special layout.)
    if not _is_within_root(ctx.target_file_path, ctx.repo_root):
        raise SystemExit(
            f"Refusing to operate: target file is outside repo root.\n"
            f"  repo_root={ctx.repo_root}\n"
            f"  target_file={ctx.target_file_path}"
        )

    if not ctx.target_file_path.exists():
        raise SystemExit(f"Target file not found: {ctx.target_file_path}")

    original_text = _read_text(ctx.target_file_path)

    # Delay the heavy Agents SDK import until we know the input is sane.
    print("Loading OpenAI Agents SDK (this can take a bit on Windows)...", flush=True)
    sdk = _import_agents_sdk()

    # Tracing (local export)
    if not args.no_trace:
        trace_path = Path(args.trace_file).expanduser().resolve() if args.trace_file else (output_dir / "trace.jsonl")
        span_path = trace_path.with_name("spans.jsonl")

        class LocalJsonTraceProcessor(sdk.TracingProcessor):  # type: ignore[misc]
            """
            Minimal tracing processor that writes trace.export() to a JSONL file.
            Also writes spans to spans.jsonl for quick grepping.
            """

            def __init__(self, trace_path_: Path, span_path_: Path):
                self.trace_path = trace_path_
                self.span_path = span_path_

            def _append_jsonl(self, path: Path, payload: dict) -> None:
                path.parent.mkdir(parents=True, exist_ok=True)
                with path.open("a", encoding="utf-8") as f:
                    f.write(json.dumps(payload, ensure_ascii=False) + "\n")

            def on_trace_start(self, trace_obj: Any) -> None:
                data = trace_obj.export()
                if data is not None:
                    self._append_jsonl(self.trace_path, {"event": "trace_start", "trace": data})

            def on_trace_end(self, trace_obj: Any) -> None:
                data = trace_obj.export()
                if data is not None:
                    self._append_jsonl(self.trace_path, {"event": "trace_end", "trace": data})

            def on_span_start(self, span: Any) -> None:
                exp = span.export()
                if exp is not None:
                    self._append_jsonl(self.span_path, {"event": "span_start", "span": exp})

            def on_span_end(self, span: Any) -> None:
                exp = span.export()
                if exp is not None:
                    self._append_jsonl(self.span_path, {"event": "span_end", "span": exp})

            def shutdown(self) -> None:
                return

            def force_flush(self) -> None:
                return

        sdk.add_trace_processor(LocalJsonTraceProcessor(trace_path, span_path))

    agents = _mk_agents(sdk, ctx.model)

    # Prompts include file content inline for determinism (no hidden tool calls needed)
    analyst_prompt = (
        f"User goal:\n{args.prompt}\n\n"
        f"Target file path:\n{ctx.target_file_path}\n\n"
        f"Target file content:\n{original_text}\n"
    )

    researcher_prompt = (
        f"User goal:\n{args.prompt}\n\n"
        f"Context: This is an agent-library JSON schema used to coordinate multi-agent orchestration.\n"
        f"Provide best practices for multi-agent routing, IO contracts, and observability.\n"
    )

    # The engineer receives the file + outputs from Analyst/Researcher
    # (we fill these after running them)

    report_index = output_dir / f"run_{run_id}_index.json"
    artifacts_written: List[str] = []

    with sdk.trace(
        "AgentsSDK AgentLibrary Pipeline",
        group_id=f"agentlib_{run_id}",
        metadata={
            "repo_root": str(ctx.repo_root),
            "agent_library": str(ctx.agent_library_path),
            "target_file": str(ctx.target_file_path),
            "output_dir": str(ctx.output_dir),
            "model": ctx.model or "default",
            "dry_run": args.dry_run,
        },
    ):
        print("[1/8] Running Analyst...", flush=True)
        analyst_out, _ = await _run_one_with_sdk(sdk, agents["analyst"], analyst_prompt, output_dir / f"{run_id}_01_analyst.json")
        artifacts_written.append(f"{run_id}_01_analyst.json")

        print("[2/8] Running Researcher...", flush=True)
        researcher_out, _ = await _run_one_with_sdk(sdk, agents["researcher"], researcher_prompt, output_dir / f"{run_id}_02_researcher.json")
        artifacts_written.append(f"{run_id}_02_researcher.json")

        engineer_prompt = (
            f"User goal:\n{args.prompt}\n\n"
            f"Original target file path:\n{ctx.target_file_path}\n\n"
            f"Original file content:\n{original_text}\n\n"
            f"Analyst output (JSON):\n{json.dumps(analyst_out, ensure_ascii=False, indent=2)}\n\n"
            f"Researcher output (JSON):\n{json.dumps(researcher_out, ensure_ascii=False, indent=2)}\n"
        )

        print("[3/8] Running Engineer...", flush=True)
        engineer_out, _ = await _run_one_with_sdk(sdk, agents["engineer"], engineer_prompt, output_dir / f"{run_id}_03_engineer.json")
        artifacts_written.append(f"{run_id}_03_engineer.json")

        updated_text = str(engineer_out.get("updated_file_text", "")).strip()
        if not updated_text:
            raise SystemExit("Engineer did not produce updated_file_text.")

        # Validate JSON and coerce checksum types to string if needed (belt + suspenders)
        try:
            updated_obj = _safe_json_loads(updated_text)
        except Exception as e:
            _write_text(output_dir / f"{run_id}_updated_invalid.json.txt", updated_text + "\n")
            raise SystemExit(f"Updated content is not valid JSON: {e}")

        updated_obj, checksum_warnings = _coerce_checksums_to_str(updated_obj)
        if checksum_warnings:
            # rewrite updated_text with coercions applied
            updated_text = _json_dumps_pretty(updated_obj)
            artifacts_written.append(f"{run_id}_checksum_coercions_applied")

        backup_path = _backup_file(ctx.target_file_path, output_dir)
        artifacts_written.append(str(backup_path.name))

        if not args.dry_run:
            _write_text(ctx.target_file_path, updated_text)
            artifacts_written.append(str(ctx.target_file_path.name))
        else:
            _write_text(output_dir / f"{run_id}_DRYRUN_updated_target.json", updated_text)
            artifacts_written.append(f"{run_id}_DRYRUN_updated_target.json")

        critic_prompt = (
            f"User goal:\n{args.prompt}\n\n"
            f"Original file (for context):\n{original_text}\n\n"
            f"Updated file:\n{updated_text}\n"
        )
        print("[4/8] Running Critic...", flush=True)
        critic_out, _ = await _run_one_with_sdk(sdk, agents["critic"], critic_prompt, output_dir / f"{run_id}_04_critic.json")
        artifacts_written.append(f"{run_id}_04_critic.json")

        # One automatic repair loop if Critic fails (keeps runs productive without needing manual reruns)
        if not bool(critic_out.get("passed", False)):
            repair_prompt = (
                f"User goal:\n{args.prompt}\n\n"
                f"Current updated file (must revise):\n{updated_text}\n\n"
                f"Critic required fixes:\n{json.dumps(critic_out.get('required_fixes', []), ensure_ascii=False, indent=2)}\n\n"
                f"Critic issues:\n{json.dumps(critic_out.get('issues', []), ensure_ascii=False, indent=2)}\n"
            )
            engineer2_out, _ = await _run_one_with_sdk(sdk, agents["engineer"], repair_prompt, output_dir / f"{run_id}_05_engineer_repair.json")
            artifacts_written.append(f"{run_id}_05_engineer_repair.json")

            updated_text2 = str(engineer2_out.get("updated_file_text", "")).strip()
            if not updated_text2:
                raise SystemExit("Repair Engineer did not produce updated_file_text.")

            # Validate + coerce
            updated_obj2 = _safe_json_loads(updated_text2)
            updated_obj2, _ = _coerce_checksums_to_str(updated_obj2)
            updated_text2 = _json_dumps_pretty(updated_obj2)

            if not args.dry_run:
                _write_text(ctx.target_file_path, updated_text2)
                artifacts_written.append(str(ctx.target_file_path.name))
            else:
                _write_text(output_dir / f"{run_id}_DRYRUN_updated_target_repair.json", updated_text2)
                artifacts_written.append(f"{run_id}_DRYRUN_updated_target_repair.json")

            # Re-run critic once
            critic_prompt2 = (
                f"User goal:\n{args.prompt}\n\n"
                f"Updated file (after repair):\n{updated_text2}\n"
            )
            critic_out, _ = await _run_one_with_sdk(sdk, agents["critic"], critic_prompt2, output_dir / f"{run_id}_06_critic_recheck.json")
            artifacts_written.append(f"{run_id}_06_critic_recheck.json")

            updated_text = updated_text2

        # Summaries / governance
        synthesizer_prompt = (
            f"User goal:\n{args.prompt}\n\n"
            f"Analyst:\n{json.dumps(analyst_out, ensure_ascii=False, indent=2)}\n\n"
            f"Researcher:\n{json.dumps(researcher_out, ensure_ascii=False, indent=2)}\n\n"
            f"Critic:\n{json.dumps(critic_out, ensure_ascii=False, indent=2)}\n\n"
            f"Artifacts written so far:\n{json.dumps(artifacts_written, ensure_ascii=False, indent=2)}\n"
        )
        print("[5/8] Running Synthesizer...", flush=True)
        synth_out, _ = await _run_one_with_sdk(sdk, agents["synthesizer"], synthesizer_prompt, output_dir / f"{run_id}_07_synthesizer.json")
        artifacts_written.append(f"{run_id}_07_synthesizer.json")

        validation_prompt = (
            f"User goal:\n{args.prompt}\n\n"
            f"Updated file candidate:\n{updated_text}\n\n"
            f"Engineer change log:\n{json.dumps(engineer_out.get('change_log', []), ensure_ascii=False, indent=2)}\n\n"
            f"Critic findings:\n{json.dumps(critic_out, ensure_ascii=False, indent=2)}\n\n"
            f"Synthesizer summary:\n{json.dumps({'diff_summary': synth_out.get('diff_summary', '')}, ensure_ascii=False, indent=2)}\n"
        )
        print("[6/8] Running ValidationAuditor...", flush=True)
        validation_out, _ = await _run_one_with_sdk(
            sdk,
            agents["validation_auditor"],
            validation_prompt,
            output_dir / f"{run_id}_08_validation_auditor.json",
        )
        artifacts_written.append(f"{run_id}_08_validation_auditor.json")

        commissioner_prompt = (
            f"User goal:\n{args.prompt}\n\n"
            f"Diff summary:\n{synth_out.get('diff_summary','')}\n\n"
            f"Critic status:\n{json.dumps(critic_out, ensure_ascii=False, indent=2)}\n\n"
            f"Validation audit:\n{json.dumps(validation_out, ensure_ascii=False, indent=2)}\n"
        )
        print("[7/8] Running Commissioner...", flush=True)
        comm_out, _ = await _run_one_with_sdk(sdk, agents["commissioner"], commissioner_prompt, output_dir / f"{run_id}_09_commissioner.json")
        artifacts_written.append(f"{run_id}_09_commissioner.json")

        supervisor_prompt = (
            f"User goal:\n{args.prompt}\n\n"
            f"Outputs:\n"
            f"- Analyst: {json.dumps(analyst_out, ensure_ascii=False)}\n"
            f"- Researcher: {json.dumps(researcher_out, ensure_ascii=False)}\n"
            f"- Engineer: change_log={json.dumps(engineer_out.get('change_log', []), ensure_ascii=False)}\n"
            f"- Critic: {json.dumps(critic_out, ensure_ascii=False)}\n"
            f"- Synthesizer: {json.dumps({'diff_summary': synth_out.get('diff_summary','')}, ensure_ascii=False)}\n"
            f"- ValidationAuditor: {json.dumps(validation_out, ensure_ascii=False)}\n"
            f"- Commissioner: {json.dumps(comm_out, ensure_ascii=False)}\n\n"
            f"Artifacts written:\n{json.dumps(artifacts_written, ensure_ascii=False, indent=2)}\n"
        )
        print("[8/8] Running Supervisor...", flush=True)
        sup_out, _ = await _run_one_with_sdk(sdk, agents["supervisor"], supervisor_prompt, output_dir / f"{run_id}_10_supervisor.json")
        artifacts_written.append(f"{run_id}_10_supervisor.json")

    # Write a human-facing markdown report (from Synthesizer), plus an index JSON.
    run_report_md = str(synth_out.get("run_report_md", "")).strip()
    if run_report_md:
        _write_text(output_dir / f"{run_id}_RUN_REPORT.md", run_report_md + "\n")
        artifacts_written.append(f"{run_id}_RUN_REPORT.md")
        _write_text(output_dir / "run_report.md", run_report_md + "\n")
        artifacts_written.append("run_report.md")

    index_payload = {
        "run_id": run_id,
        "timestamp": _dt.datetime.now().isoformat(),
        "repo_root": str(repo_root),
        "agent_library": str(agent_library_path),
        "target_file": str(target_file_path),
        "output_dir": str(output_dir),
        "model": ctx.model or "default",
        "dry_run": args.dry_run,
        "artifacts_written": artifacts_written,
        "critic_passed": bool(critic_out.get("passed", False)),
        "validation_status": str(validation_out.get("overall_status", "")).strip(),
        "validation_issue_count": int(
            len(validation_out.get("stubouts", []))
            + len(validation_out.get("placeholders", []))
            + len(validation_out.get("unfinished_tasks", []))
        ),
    }
    _write_text(report_index, _json_dumps_pretty(index_payload))

    # console-friendly final line
    print(f"OK: run_id={run_id}")
    print(f"Artifacts: {output_dir}")
    print(f"Index: {report_index}")


if __name__ == "__main__":
    asyncio.run(main())

# ### END FILE
