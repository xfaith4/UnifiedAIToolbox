"""
Lightweight orchestration bridge CLI.

Pairs the prompt registry with orchestration workflows by:
1. Listing prompts that require automated reviews (`review_policy: critical`).
2. Generating run manifests that downstream workers (PowerShell refiner, multi-agent critics)
   can consume.
3. Emitting placeholder telemetry files so we can demo the orchestration loop before the
   full FastAPI/queue service is online.
"""

from __future__ import annotations

import argparse
import json
import os
import requests
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml

# Resolve repository roots
BRIDGE_ROOT = Path(__file__).resolve().parent
REPO_ROOT = BRIDGE_ROOT.parents[1]
REGISTRY_SRC = REPO_ROOT / "packages" / "prompt-registry" / "src"

if str(REGISTRY_SRC) not in sys.path:
    sys.path.insert(0, str(REGISTRY_SRC))

from prompt_registry import PromptSpec, find_prompt_by_id, list_prompts  # noqa: E402


def safe_json_load(file_path: Path, default: Any = None, context: str = "") -> Any:
    """
    Safely load JSON from a file with enhanced error reporting.
    
    Args:
        file_path: Path to the JSON file
        default: Default value to return on error (None by default)
        context: Context string for error messages
    
    Returns:
        Parsed JSON data or default value on error
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


RUNS_DIR = BRIDGE_ROOT / "runs"
RUNS_DIR.mkdir(exist_ok=True)
RUNBOOK_DIR = BRIDGE_ROOT / "runbooks"
RUNBOOK_DIR.mkdir(exist_ok=True)
STATE_DIR = BRIDGE_ROOT / "state"
STATE_DIR.mkdir(exist_ok=True)
STATE_PATH = STATE_DIR / "bridge_state.json"
PS_REFINER = BRIDGE_ROOT / "OpenAI_Refiner.ps1"
PROMPT_API_URL = os.environ.get("PROMPT_API_URL", "http://localhost:8000")
SUPERVISOR_QUEUE_DIR = BRIDGE_ROOT / "supervisor_tasks"
SUPERVISOR_QUEUE_DIR.mkdir(exist_ok=True)
CODEX_SCRIPT = REPO_ROOT / "Orchestration" / "AI-Orchestration" / "codex-multiagent-swarm" / "Orchestrate-Codex.ps1"
CODEX_OUT_DIR = RUNS_DIR / "codex_swarm"
CODEX_OUT_DIR.mkdir(parents=True, exist_ok=True)


def find_critical_prompts() -> List[PromptSpec]:
    critical: List[PromptSpec] = []
    for spec in list_prompts():
        integrations = spec.raw.get("integrations") or {}
        orchestration = integrations.get("orchestration") or {}
        if orchestration.get("review_policy") == "critical":
            critical.append(spec)
    return critical


def cmd_list(args: argparse.Namespace) -> int:
    prompts = find_critical_prompts()
    if not prompts:
        print("[bridge] No prompts marked review_policy=critical.")
        return 0

    for spec in prompts:
        print(f"- {spec.id} (version {spec.version}) [{spec.path}]")
    return 0


def _load_state() -> Dict[str, Dict[str, str]]:
    if not STATE_PATH.exists():
        return {}
    try:
        return safe_json_load(STATE_PATH, default={}, context="bridge_state")
    except Exception as e:
        print(f"[bridge] Failed to load state: {e}", file=sys.stderr)
        return {}


def _save_state(data: Dict[str, Dict[str, str]]) -> None:
    STATE_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_runbook_entry(
    spec: PromptSpec,
    manifest: Path,
    reviewers: List[str],
    notes: Optional[str],
) -> Dict[str, Any]:
    timestamp = _now_iso()
    summary = notes or f"Automated validation for {spec.id} (v{spec.version}) completed at {timestamp}."
    return {
        "prompt_id": spec.id,
        "version": spec.version,
        "timestamp": timestamp,
        "summary": summary,
        "reviewers": reviewers,
        "references": [
            {"type": "manifest", "value": str(manifest)},
            {"type": "prompt_yaml", "value": str(spec.path)},
        ],
        "reasoning": [
            "Reviewed scheduling window for review_policy=critical.",
            "Generated an orchestration manifest and invoked the refiner worker.",
            "Logged telemetry and run status back into the prompt registry.",
        ],
        "next_steps": [
            "Share the runbook summary with stakeholders.",
            "Queue another review after the configured interval or when inputs change.",
        ],
    }


def _write_runbook(entry: Dict[str, Any]) -> Path:
    file_name = f"{entry['prompt_id'].replace('.', '_')}-{entry['timestamp'].replace(':', '_')}.runbook.json"
    target = RUNBOOK_DIR / file_name
    target.write_text(json.dumps(entry, indent=2), encoding="utf-8")
    return target


class BridgeService:
    """Background worker that continuously drives orchestrated reviews."""

    def __init__(
        self,
        poll_interval: int = 60,
        review_interval_hours: int = 24,
        invoke_refiner: bool = True,
        dry_run: bool = False,
        codex_enabled: bool = False,
        codex_max_parallel: int = 3,
        auto_review_enabled: bool = False,
    ):
        self.poll_interval = poll_interval
        self.review_interval_hours = review_interval_hours
        self.invoke_refiner = invoke_refiner
        self.dry_run = dry_run
        self.codex_enabled = codex_enabled
        self.codex_max_parallel = codex_max_parallel
        self.auto_review_enabled = auto_review_enabled
        self.state = _load_state()

    def start(self) -> None:
        print(
            f"[bridge] service started (poll={self.poll_interval}s, review_interval={self.review_interval_hours}h, refiner={self.invoke_refiner})"
        )
        try:
            while True:
                if self.auto_review_enabled:
                    self._process_critical_prompts()
                self._process_supervisor_queue()
                _save_state(self.state)
                time.sleep(self.poll_interval)
        except KeyboardInterrupt:
            print("[bridge] service stopped by user.")

    def _process_critical_prompts(self) -> None:
        for spec in find_critical_prompts():
            if not self._should_review(spec):
                continue
            manifest = _write_run_manifest(spec)
            print(f"[bridge] manifest ready for {spec.id} -> {manifest}")
            if self.invoke_refiner:
                run_refiner(spec, manifest, dry_run=self.dry_run)
            reviewers = ["BridgeService"]
            notes = f"Automated bridge review completed at {_now_iso()}"
            runbook = _build_runbook_entry(spec, manifest, reviewers, notes)
            self._maybe_run_codex_swarm(spec, runbook)
            runbook_path = _write_runbook(runbook)
            update_telemetry(spec, "approved", notes, reviewers, str(manifest))
            self._post_review(spec, reviewers, notes, manifest, runbook)
            self.state[spec.id] = {
                "last_reviewed": runbook["timestamp"],
                "runbook_path": str(runbook_path),
            }

    def _should_review(self, spec: PromptSpec) -> bool:
        telemetry = (spec.raw.get("telemetry") or {}).get("audit") or {}
        last = telemetry.get("last_validated")
        state_entry = self.state.get(spec.id, {})
        candidate = last or state_entry.get("last_reviewed")
        if not candidate:
            return True
        try:
            last_dt = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
        except ValueError:
            return True
        hours = (datetime.now(timezone.utc) - last_dt).total_seconds() / 3600
        return hours >= self.review_interval_hours

    def _post_review(
        self,
        spec: PromptSpec,
        reviewers: List[str],
        notes: Optional[str],
        manifest: Path,
        runbook: Dict[str, Any],
    ) -> None:
        try:
            response = requests.post(
                f"{PROMPT_API_URL.rstrip('/')}/prompts/{spec.id}/reviews",
                json={
                    "status": "approved",
                    "reviewers": reviewers,
                    "notes": notes,
                    "manifest": str(manifest),
                    "runbook": runbook,
                },
                timeout=15,
            )
            response.raise_for_status()
        except Exception as exc:
            print(f"[bridge] failed to post review to API: {exc}")

    def _process_supervisor_queue(self) -> None:
        # Only process tasks with status "queued" to avoid re-executing completed tasks
        args = argparse.Namespace(source="api", status_filter="queued")
        cmd_run_supervisor(args)

    def _maybe_run_codex_swarm(self, spec: PromptSpec, runbook: Dict[str, Any]) -> None:
        if not self.codex_enabled:
            return
        orchestration = (spec.raw.get("integrations") or {}).get("orchestration") or {}
        if orchestration.get("cascade") != "codex":
            return
        if not CODEX_SCRIPT.exists():
            print(f"[bridge] codex swarm script missing: {CODEX_SCRIPT}")
            return

        workdir = CODEX_OUT_DIR / spec.id.replace(".", "_")
        workdir.mkdir(parents=True, exist_ok=True)
        log_path = workdir / f"codex_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.log"
        cmd = [
            "powershell" if os.name == "nt" else "pwsh",
            "-File",
            str(CODEX_SCRIPT),
            "-RepoRoot",
            str(REPO_ROOT),
            "-WorkDir",
            str(workdir),
            "-MaxParallel",
            str(self.codex_max_parallel),
        ]
        if self.dry_run:
            print(f"[bridge] DRY RUN codex swarm: {' '.join(cmd)}")
            runbook["reasoning"].append("Codex swarm review planned (dry-run mode).")
            return
        try:
            with log_path.open("w", encoding="utf-8") as log_handle:
                subprocess.run(cmd, cwd=str(REPO_ROOT), stdout=log_handle, stderr=subprocess.STDOUT, check=True)
            runbook["references"].append({"type": "codex_swarm_log", "value": str(log_path)})
            runbook["reasoning"].append("Executed Codex multi-agent swarm review cascade.")
            runbook["next_steps"].append("Inspect codex swarm findings/branch for recommended fixes.")
        except subprocess.CalledProcessError as exc:
            runbook["references"].append({"type": "codex_swarm_log", "value": str(log_path)})
            runbook["reasoning"].append(f"Codex swarm failed: {exc}. See log for details.")


def _write_run_manifest(spec: PromptSpec) -> Path:
    timestamp = datetime.now(timezone.utc).isoformat()
    manifest = {
        "prompt_id": spec.id,
        "version": spec.version,
        "source_path": str(spec.path),
        "requested_at": timestamp,
        "review_policy": "critical",
        "status": "queued",
    }
    target = RUNS_DIR / f"{spec.id.replace('.', '_')}.{spec.version}.json"
    target.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return target


def cmd_queue(args: argparse.Namespace) -> int:
    prompts = find_critical_prompts()
    if args.prompt_id:
        prompts = [p for p in prompts if p.id == args.prompt_id]

    if not prompts:
        print("[bridge] No matching critical prompts found.")
        return 1

    for spec in prompts:
        manifest_path = _write_run_manifest(spec)
        print(f"[bridge] queued {spec.id} -> {manifest_path}")
        if args.invoke_refiner:
            run_refiner(spec, manifest_path, dry_run=args.dry_run)
    return 0


def run_refiner(spec: PromptSpec, manifest: Path, dry_run: bool = False) -> None:
    if not PS_REFINER.exists():
        print(f"[bridge] refiner script missing: {PS_REFINER}")
        return

    cmd = [
        "pwsh" if os.name != "nt" else "powershell",
        "-File",
        str(PS_REFINER),
        "-PromptPath",
        str(spec.path),
        "-Manifest",
        str(manifest),
    ]
    if dry_run:
        print(f"[bridge] DRY RUN: {' '.join(cmd)}")
        return

    print(f"[bridge] invoking PowerShell refiner for {spec.id}")
    subprocess.run(cmd, check=False)


def update_telemetry(
    spec: PromptSpec,
    status: str,
    notes: Optional[str],
    reviewers: List[str],
    manifest: Optional[str],
) -> None:
    try:
        payload = {
            "status": status,
            "reviewers": reviewers,
            "notes": notes,
            "manifest": manifest,
        }
        resp = requests.post(
            f"{PROMPT_API_URL.rstrip('/')}/prompts/{spec.id}/reviews",
            json=payload,
            timeout=10,
        )
        resp.raise_for_status()
        print(f"[bridge] recorded review via API for {spec.id}")
        return
    except Exception as exc:
        print(f"[bridge] API review record failed ({exc}); falling back to YAML edit.")

    data = yaml.safe_load(spec.path.read_text(encoding="utf-8"))
    telemetry = data.setdefault("telemetry", {})
    audit = telemetry.setdefault("audit", {})
    timestamp = datetime.now(timezone.utc).isoformat()
    audit["last_validated"] = timestamp
    runs = audit.setdefault("runs", [])
    runs.append(
        {
            "timestamp": timestamp,
            "status": status,
            "reviewers": reviewers,
            "notes": notes,
            "manifest": manifest,
        }
    )
    spec.path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")
    print(f"[bridge] updated telemetry for {spec.id}")


def cmd_record_review(args: argparse.Namespace) -> int:
    spec = find_prompt_by_id(args.prompt_id)
    if not spec:
        print(f"[bridge] prompt not found: {args.prompt_id}")
        return 1
    reviewers = [r.strip() for r in (args.reviewers or "").split(",") if r.strip()]
    update_telemetry(
        spec=spec,
        status=args.status,
        notes=args.notes,
        reviewers=reviewers,
        manifest=args.manifest,
    )
    return 0


def _write_supervisor_task(payload: dict) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    safe_name = payload.get("task", "task").lower().replace(" ", "_")
    target = SUPERVISOR_QUEUE_DIR / f"{safe_name}.{timestamp}.json"
    target.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return target


def cmd_ingest_supervisor(args: argparse.Namespace) -> int:
    try:
        manifest = safe_json_load(Path(args.manifest), context="supervisor_manifest")
    except Exception as exc:
        print(f"[bridge] failed to read manifest: {exc}")
        return 1

    manifest.setdefault("id", manifest.get("task") or f"task-{datetime.now(timezone.utc).timestamp()}")
    manifest.setdefault("status", "queued")
    manifest.setdefault("received_at", datetime.now(timezone.utc).isoformat())

    try:
        payload = {
            "supervisor": manifest,
            "agents": manifest.get("agents", []),
            "prompts": manifest.get("prompts", []),
        }
        resp = requests.post(
            f"{PROMPT_API_URL.rstrip('/')}/orchestrator/tasks",
            json=payload,
            timeout=10,
        )
        resp.raise_for_status()
        print(f"[bridge] supervisor manifest sent to API ({payload['supervisor']['id']})")
        return 0
    except Exception as exc:
        print(f"[bridge] API ingest failed ({exc}); writing to local spool.")
        local_path = _write_supervisor_task(manifest)
        print(f"[bridge] supervisor manifest spooled to {local_path}")
    return 0


def _get_task_queue() -> List[Tuple[dict, Path]]:
    queue: List[Tuple[dict, Path]] = []
    for path in SUPERVISOR_QUEUE_DIR.glob("*.json"):
        try:
            payload = safe_json_load(path, context=f"task_queue:{path.name}")
            queue.append((payload, path))
        except Exception as exc:
            print(f"[bridge] failed to read local task {path}: {exc}")
    return queue


def _pull_remote_tasks() -> List[dict]:
    try:
        resp = requests.get(f"{PROMPT_API_URL.rstrip('/')}/orchestrator/tasks", timeout=10)
        resp.raise_for_status()
        payload = resp.json()
        if isinstance(payload, list):
            return payload
        return []
    except Exception as exc:
        print(f"[bridge] failed to retrieve tasks from API: {exc}")
        return []


def _find_powershell() -> Tuple[Optional[str], List[str]]:
    """
    Find an available PowerShell executable.
    
    Tries pwsh first (PowerShell 7+, cross-platform), then falls back to
    powershell (Windows PowerShell 5.1) on Windows.
    
    Returns a tuple of (executable_name, detection_log) where:
      - executable_name is the found executable or None
      - detection_log is a list of diagnostic messages for debugging
    """
    detection_log: List[str] = []
    
    # Prefer pwsh (PowerShell 7+) on all platforms
    candidates = ["pwsh"]
    if os.name == "nt":
        # On Windows, also try Windows PowerShell as fallback
        candidates.append("powershell")
    
    detection_log.append(f"os.name={os.name}, candidates={candidates}")
    
    for candidate in candidates:
        # Use shutil.which for reliable cross-platform executable detection
        path = shutil.which(candidate)
        if path:
            detection_log.append(f"{candidate}: found at {path}")
            return candidate, detection_log
        else:
            detection_log.append(f"{candidate}: not found in PATH")
    
    detection_log.append("No PowerShell executable found")
    return None, detection_log


def _execute_run_manifest(manifest_path: Path) -> bool:
    """
    Execute a run manifest by invoking the orchestrator script or simulating execution.
    
    Returns True if execution completed successfully, False otherwise.
    """
    try:
        manifest = safe_json_load(manifest_path, context=f"run_manifest:{manifest_path.name}")
        
        # Update status to running
        manifest["status"] = "running"
        manifest["started_at"] = _now_iso()
        manifest.setdefault("events", []).append({
            "ts": manifest["started_at"],
            "type": "status",
            "message": "running"
        })
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        
        # Resolve orchestrator script path
        orch_script = REPO_ROOT / "Orchestration" / "AI-Orchestration" / "scripts" / "POF.ps1"
        log_path = manifest_path.with_suffix(".log")
        
        # Find available PowerShell executable (pwsh preferred, powershell fallback on Windows)
        ps_exe, ps_detection_log = _find_powershell()
        
        # Add diagnostic event for debugging path/PowerShell detection
        script_exists = orch_script.exists()
        manifest["events"].append({
            "ts": _now_iso(),
            "type": "debug",
            "message": f"Detection: orch_script={orch_script}, exists={script_exists}, ps_exe={ps_exe}, ps_log={ps_detection_log}"
        })
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        
        if script_exists and ps_exe:
            manifest["mode"] = "executed"
            manifest["events"].append({
                "ts": _now_iso(),
                "type": "info",
                "message": f"Executing {orch_script.name} via {ps_exe}"
            })
            manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            
            # Get goal text from manifest - prefer goal field, fall back to prompt_id
            goal_text = manifest.get("goal") or manifest.get("prompt_id", "")
            
            # POF.ps1 takes -Goal parameter directly and -OutputRoot for run output directory
            run_output_dir = manifest_path.parent / f"run_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
            run_output_dir.mkdir(parents=True, exist_ok=True)
            
            args = [ps_exe, "-File", str(orch_script), "-Goal", goal_text, "-OutputRoot", str(run_output_dir)]
            with open(log_path, "w", encoding="utf-8") as logf:
                result = subprocess.run(args, stdout=logf, stderr=logf)
            
            if result.returncode != 0:
                raise RuntimeError(f"Orchestrator exited with code {result.returncode}")
        else:
            # Simulate execution if script or PowerShell is missing
            manifest["mode"] = "simulated"
            reason = []
            if not script_exists:
                reason.append(f"script not found at {orch_script}")
            if not ps_exe:
                reason.append("no PowerShell executable available")
            manifest["events"].append({
                "ts": _now_iso(),
                "type": "warn",
                "message": f"Simulated run: {'; '.join(reason)}"
            })
            manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            time.sleep(1)  # Brief simulation delay
        
        # Mark as completed
        manifest["status"] = "completed"
        manifest["completed_at"] = _now_iso()
        manifest["events"].append({
            "ts": manifest["completed_at"],
            "type": "status",
            "message": "completed"
        })
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return True
        
    except Exception as exc:
        try:
            manifest = safe_json_load(manifest_path, default={}, context=f"run_error:{manifest_path.name}")
            manifest["status"] = f"error:{exc}"
            manifest["completed_at"] = _now_iso()
            manifest["error_detail"] = str(exc)
            manifest["last_step"] = "orchestrator execution"
            manifest.setdefault("events", []).append({
                "ts": manifest["completed_at"],
                "type": "error",
                "message": str(exc),
                "error_detail": str(exc),
                "traceback": str(type(exc).__name__)
            })
            manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        except Exception as e:
            print(f"[bridge] Failed to write error state to manifest: {e}", file=sys.stderr)
        print(f"[bridge] execution failed: {exc}", file=sys.stderr)
        return False


def _execute_supervisor_task(task: dict) -> None:
    """
    Execute a supervisor orchestration task.
    
    Processes prompts and agents specified in the task, generating artifacts,
    executing the orchestration logic, and logging results.
    """
    supervisor = task.get("supervisor", {})
    task_name = supervisor.get("task", "unnamed")
    objective = supervisor.get("objective", "")
    prompts = task.get("prompts", [])
    agents = task.get("agents", [])
    
    print(f"[bridge] processing task: {task_name}")
    if objective:
        print(f"[bridge] objective: {objective}")
    
    executed_count = 0
    failed_count = 0
    
    # Process each prompt in the task
    for prompt_ref in prompts:
        prompt_id = prompt_ref.get("id") if isinstance(prompt_ref, dict) else str(prompt_ref)
        if not prompt_id:
            continue
            
        print(f"[bridge] processing prompt: {prompt_id}")
        try:
            spec = find_prompt_by_id(prompt_id)
            if spec:
                # Generate a manifest for the prompt
                manifest_path = _write_run_manifest(spec)
                print(f"[bridge] created manifest for {prompt_id}: {manifest_path}")
                
                # Execute the manifest
                if _execute_run_manifest(manifest_path):
                    print(f"[bridge] successfully executed {prompt_id}")
                    executed_count += 1
                else:
                    print(f"[bridge] failed to execute {prompt_id}")
                    failed_count += 1
            else:
                print(f"[bridge] warning: prompt {prompt_id} not found in registry")
        except Exception as exc:
            print(f"[bridge] error processing prompt {prompt_id}: {exc}")
            failed_count += 1
    
    # Log agent references
    for agent_ref in agents:
        agent_id = agent_ref.get("agentId") if isinstance(agent_ref, dict) else str(agent_ref)
        if agent_id:
            print(f"[bridge] task references agent: {agent_id}")
    
    # Record execution timestamp
    execution_time = datetime.now(timezone.utc).isoformat()
    print(f"[bridge] task execution completed at {execution_time}")
    print(f"[bridge] results: {executed_count} succeeded, {failed_count} failed")


def cmd_run_supervisor(args: argparse.Namespace) -> int:
    tasks: List[dict] = []

    if args.source in ("api", "both"):
        tasks.extend({"origin": "api", "task": t, "path": None} for t in _pull_remote_tasks())
    if args.source in ("local", "both"):
        tasks.extend({"origin": "local", "task": payload, "path": path} for payload, path in _get_task_queue())

    if not tasks:
        print("[bridge] no supervisor tasks found.")
        return 0

    for item in tasks:
        task = item["task"]
        if args.status_filter and task.get("status") not in args.status_filter.split(","):
            continue

        task_id = task.get("id", "unknown")
        print(f"[bridge] executing supervisor task {task_id} ({task.get('supervisor', {}).get('task')})")
        try:
            # Execute supervisor orchestration task
            _execute_supervisor_task(task)

            if item["origin"] == "api":
                try:
                    requests.patch(
                        f"{PROMPT_API_URL.rstrip('/')}/orchestrator/tasks/{task_id}",
                        json={"status": "completed", "notes": "Processed by bridge worker."},
                        timeout=10,
                    )
                except Exception as exc:
                    print(f"[bridge] failed to update task {task_id}: {exc}")
            else:
                task_path: Optional[Path] = item.get("path")
                if task_path and task_path.exists():
                    try:
                        task_path.unlink()
                    except Exception as exc:
                        print(f"[bridge] failed to delete local task {task_path}: {exc}")
        except Exception as exc:
            print(f"[bridge] task {task_id} failed: {exc}")
            if item["origin"] == "api":
                try:
                    requests.patch(
                        f"{PROMPT_API_URL.rstrip('/')}/orchestrator/tasks/{task_id}",
                        json={"status": "failed", "notes": str(exc)},
                        timeout=10,
                    )
                except Exception:
                    pass
            continue

    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="orchestration-bridge",
        description="Kickstart orchestration jobs for critical prompts.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    list_parser = sub.add_parser("list-critical", help="List prompts flagged for orchestration reviews.")
    list_parser.set_defaults(func=cmd_list)

    queue_parser = sub.add_parser("queue", help="Generate run manifests (optionally invoke refiner).")
    queue_parser.add_argument("--prompt-id", help="Queue a single prompt by ID.")
    queue_parser.add_argument(
        "--invoke-refiner",
        action="store_true",
        help="Call OpenAI_Refiner.ps1 for each queued manifest.",
    )
    queue_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the PowerShell command without executing (when invoking refiner).",
    )
    queue_parser.set_defaults(func=cmd_queue)

    record_parser = sub.add_parser(
        "record-review",
        help="Append orchestration results back into YAML telemetry.",
    )
    record_parser.add_argument("prompt_id", help="Prompt identifier.")
    record_parser.add_argument(
        "--status",
        required=True,
        choices=["approved", "rejected", "needs_changes"],
        help="Review outcome.",
    )
    record_parser.add_argument("--notes", help="Reviewer notes / summary.")
    record_parser.add_argument(
        "--reviewers",
        help="Comma-separated reviewer names / agents.",
    )
    record_parser.add_argument("--manifest", help="Path to run manifest (optional).")
    record_parser.set_defaults(func=cmd_record_review)

    ingest_parser = sub.add_parser(
        "ingest-supervisor", help="Submit a supervisor manifest (JSON) to the API or local spool."
    )
    ingest_parser.add_argument("manifest", help="Path to the supervisor manifest JSON file.")
    ingest_parser.set_defaults(func=cmd_ingest_supervisor)

    run_parser = sub.add_parser(
        "run-supervisor",
        help="Process supervisor tasks (either from Prompt API, local spool, or both).",
    )
    run_parser.add_argument(
        "--source",
        choices=["api", "local", "both"],
        default="api",
        help="Where to pull supervisor tasks from.",
    )
    run_parser.add_argument(
        "--status-filter",
        help="Comma-separated status values to process (default: all).",
    )
    run_parser.set_defaults(func=cmd_run_supervisor)

    serve_parser = sub.add_parser("serve", help="Run the persistent bridge worker.")
    serve_parser.add_argument(
        "--poll-interval",
        type=int,
        default=int(os.environ.get("BRIDGE_POLL_SECONDS", "60")),
        help="Seconds between polling cycles (default: 60).",
    )
    serve_parser.add_argument(
        "--review-interval-hours",
        type=int,
        default=int(os.environ.get("BRIDGE_REVIEW_INTERVAL_HOURS", "24")),
        help="Hours between automated reviews for each critical prompt (default: 24).",
    )
    serve_parser.add_argument(
        "--skip-refiner",
        action="store_true",
        help="Skip invoking the PowerShell refiner during automated runs.",
    )
    serve_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Log actions without executing external workers.",
    )
    serve_parser.add_argument(
        "--enable-codex-swarm",
        action="store_true",
        help="Invoke Codex multi-agent swarm for prompts that set cascade=codex.",
    )
    serve_parser.add_argument(
        "--enable-critical-reviews",
        action="store_true",
        help="Allow the bridge to auto-run prompts marked review_policy=critical.",
    )
    serve_parser.add_argument(
        "--codex-max-parallel",
        type=int,
        default=3,
        help="Max parallel Codex agents (see Orchestrate-Codex.ps1).",
    )
    serve_parser.set_defaults(func=cmd_serve)

    return parser


def cmd_serve(args: argparse.Namespace) -> int:
    service = BridgeService(
        poll_interval=args.poll_interval,
        review_interval_hours=args.review_interval_hours,
        invoke_refiner=not args.skip_refiner,
        dry_run=args.dry_run,
        codex_enabled=args.enable_codex_swarm,
        codex_max_parallel=args.codex_max_parallel,
        auto_review_enabled=args.enable_critical_reviews,
    )
    service.start()
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
