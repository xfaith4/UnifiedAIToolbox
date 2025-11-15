"""
Sensor Monitor Service
----------------------

Continuously evaluates sensor profiles (adapted from the Sensor-Reward framework)
and reports normalized rewards + runbooks to the Prompt API so orchestration dashboards
stay aware of infrastructure/business signals.
"""

from __future__ import annotations

import json
import subprocess
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class MonitorSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SENSOR_", env_file=".env", extra="ignore")

    data_dir: Path = Path(__file__).resolve().parent / "data"
    profile_path: Path = Path(__file__).resolve().parent / "sensor_profiles" / "default.json"
    prompt_api_base: str = "http://localhost:5050"
    poll_interval: int = 300


settings = MonitorSettings()
RUNBOOK_DIR = settings.data_dir / "runbooks"
RUNBOOK_DIR.mkdir(parents=True, exist_ok=True)


class SensorProfile(BaseModel):
    name: str
    description: Optional[str] = None
    command: List[str]
    min: float
    max: float
    invert: bool = False
    prompt_id: str
    threshold: float = Field(0.7, ge=0.0, le=1.0)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize(value: float, minimum: float, maximum: float, invert: bool) -> float:
    if maximum == minimum:
        return 0.0
    normalized = (value - minimum) / (maximum - minimum)
    normalized = max(0.0, min(1.0, normalized))
    if invert:
        normalized = 1.0 - normalized
    return round(normalized, 4)


def _run_command(cmd: List[str]) -> float:
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    output = result.stdout.strip()
    return float(output)


def _prompt_api_client() -> httpx.Client:
    return httpx.Client(base_url=settings.prompt_api_base.rstrip("/"), timeout=15)


def _log_review(profile: SensorProfile, measurement: float, reward: float, runbook: Dict[str, Any]) -> None:
    payload = {
        "status": "approved" if reward >= profile.threshold else "needs_changes",
        "reviewers": ["SensorMonitor"],
        "notes": f"{profile.name} measured {measurement:.2f} (reward={reward}).",
        "manifest": runbook.get("runbook_path"),
        "runbook": runbook,
    }
    try:
        with _prompt_api_client() as client:
            client.post(f"/prompts/{profile.prompt_id}/reviews", json=payload)
    except Exception:
        pass


def _write_runbook(profile: SensorProfile, measurement: float, reward: float) -> Dict[str, Any]:
    runbook = {
        "sensor": profile.name,
        "prompt_id": profile.prompt_id,
        "timestamp": _now_iso(),
        "summary": f"{profile.name} measured {measurement:.2f} (reward={reward:.2f}).",
        "references": [
            {"type": "sensor_profile", "value": str(settings.profile_path)},
        ],
        "reasoning": [
            profile.description or "Sensor executed via Sensor Monitor.",
            f"Captured measurement {measurement:.2f} and normalized with range [{profile.min}, {profile.max}] (invert={profile.invert}).",
            f"Calculated reward {reward:.2f} and compared against threshold {profile.threshold}.",
        ],
        "next_steps": [
            "Investigate upstream systems if reward falls below threshold.",
            "Review prompt guidance associated with this sensor in Prompt Hub.",
        ],
        "measurement": measurement,
        "reward": reward,
        "threshold": profile.threshold,
    }
    file_name = f"{profile.name}-{uuid.uuid4().hex}.sensor.json"
    path = RUNBOOK_DIR / file_name
    path.write_text(json.dumps(runbook, indent=2), encoding="utf-8")
    runbook["runbook_path"] = str(path)
    return runbook


def load_profiles() -> List[SensorProfile]:
    raw = json.loads(settings.profile_path.read_text(encoding="utf-8"))
    return [SensorProfile(**item) for item in raw]


def run_monitor() -> None:
    profiles = load_profiles()
    if not profiles:
        raise RuntimeError("No sensor profiles configured.")
    print(f"[sensor-monitor] loaded {len(profiles)} profiles from {settings.profile_path}")

    while True:
        for profile in profiles:
            try:
                measurement = _run_command(profile.command)
            except Exception as exc:
                print(f"[sensor-monitor] failed to run {profile.name}: {exc}")
                continue

            reward = _normalize(measurement, profile.min, profile.max, profile.invert)
            runbook = _write_runbook(profile, measurement, reward)
            _log_review(profile, measurement, reward, runbook)
            print(
                f"[sensor-monitor] {profile.name}: measurement={measurement:.2f} reward={reward:.2f} threshold={profile.threshold}"
            )
        time.sleep(settings.poll_interval)


if __name__ == "__main__":
    run_monitor()
