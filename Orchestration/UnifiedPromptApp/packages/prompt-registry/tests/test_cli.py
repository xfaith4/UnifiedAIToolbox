import json
import os
import subprocess
import sys
from pathlib import Path

from prompt_registry.cli import perform_roundtrip

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PACKAGE_ROOT / "src"


def test_perform_roundtrip_includes_known_prompt():
    checked = perform_roundtrip()
    assert "analytics.divisions.performance.summary" in checked


def test_cli_export_ui_payload(tmp_path):
    output_file = tmp_path / "prompt.json"
    cmd = [
        sys.executable,
        "-m",
        "prompt_registry.cli",
        "export",
        "analytics.divisions.performance.summary",
        "--format",
        "ui",
        "--output",
        str(output_file),
    ]
    env = os.environ.copy()
    env["PYTHONPATH"] = (
        f"{SRC_ROOT}{os.pathsep}{env['PYTHONPATH']}" if env.get("PYTHONPATH") else str(SRC_ROOT)
    )
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=PACKAGE_ROOT, env=env)
    assert result.returncode == 0, result.stderr
    data = json.loads(output_file.read_text(encoding="utf-8"))
    assert data["id"] == "analytics.divisions.performance.summary"
