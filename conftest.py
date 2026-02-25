from __future__ import annotations

import sys
from pathlib import Path

PROMPT_API_DIR = Path(__file__).resolve().parent / "apps" / "UnifiedPromptApp" / "services" / "prompt-api"
if PROMPT_API_DIR.exists():
    sys.path.insert(0, str(PROMPT_API_DIR))
