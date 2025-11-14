"""
Sample script that converts every canonical YAML prompt into the simplified
JSON payload used by the Prompt Hub UI. The aggregated output is written to
`demos/out_roundtrip.json` so downstream tools can inspect the data without
touching the registry internals.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parents[1]
SRC_DIR = PACKAGE_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from prompt_registry import list_prompts  # noqa: E402

OUTPUT_PATH = Path(__file__).with_name("out_roundtrip.json")


def main() -> None:
    payloads = {}
    for spec in list_prompts():
        payloads[spec.id] = spec.to_ui_payload()

    OUTPUT_PATH.write_text(
        json.dumps(payloads, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"[export_roundtrip] wrote {len(payloads)} prompts to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
