"""
Guards against pricing drift between the canonical backend pricing source
(config/model_costs.json) and the webapp estimate table
(apps/unifiedtoolbox.webapp/src/lib/config/modelPricing.ts).

config/model_costs.json is canonical. The webapp table mirrors it for
client-side estimates; this test fails if model names or prices diverge.
"""
import json
import pathlib
import re

import pytest


BACKEND_CONFIG = pathlib.Path(__file__).parent.parent / "config" / "model_costs.json"
# tests/ -> prompt-api -> services -> UnifiedPromptApp -> apps
WEBAPP_PRICING = (
    pathlib.Path(__file__).parents[4]
    / "unifiedtoolbox.webapp"
    / "src"
    / "lib"
    / "config"
    / "modelPricing.ts"
)


def _load_backend_prices() -> dict[str, dict[str, float]]:
    config = json.loads(BACKEND_CONFIG.read_text(encoding="utf-8"))
    prices: dict[str, dict[str, float]] = {}
    for name, model in config.get("models", {}).items():
        entry = {
            "input": float(model["input_price_per_million"]),
            "output": float(model["output_price_per_million"]),
        }
        if "cached_input_price_per_million" in model:
            entry["cached"] = float(model["cached_input_price_per_million"])
        prices[name] = entry
    return prices


def _extract_model_pricing_block(source: str) -> str:
    """Return just the body of the `MODEL_PRICING` object literal."""
    start = source.index("MODEL_PRICING")
    brace = source.index("{", start)
    depth = 0
    for i in range(brace, len(source)):
        if source[i] == "{":
            depth += 1
        elif source[i] == "}":
            depth -= 1
            if depth == 0:
                return source[brace : i + 1]
    raise AssertionError("Could not find end of MODEL_PRICING block")


_FIELD_PATTERNS = {
    "input": re.compile(r"inputPerMillion:\s*([0-9.]+)"),
    "output": re.compile(r"outputPerMillion:\s*([0-9.]+)"),
    "cached": re.compile(r"cachedInputPerMillion:\s*([0-9.]+)"),
}
_ENTRY_RE = re.compile(r"'([^']+)':\s*\{([^}]*)\}")


def _load_webapp_prices() -> dict[str, dict[str, float]]:
    source = WEBAPP_PRICING.read_text(encoding="utf-8")
    block = _extract_model_pricing_block(source)
    prices: dict[str, dict[str, float]] = {}
    for name, body in _ENTRY_RE.findall(block):
        entry: dict[str, float] = {}
        for field, pattern in _FIELD_PATTERNS.items():
            match = pattern.search(body)
            if match:
                entry[field] = float(match.group(1))
        prices[name] = entry
    return prices


def test_pricing_files_exist():
    assert BACKEND_CONFIG.exists(), f"Missing backend config: {BACKEND_CONFIG}"
    assert WEBAPP_PRICING.exists(), f"Missing webapp pricing: {WEBAPP_PRICING}"


def test_webapp_models_are_known_to_backend():
    """Every webapp-priced model must exist in the canonical backend source."""
    backend = _load_backend_prices()
    webapp = _load_webapp_prices()

    unknown = sorted(set(webapp) - set(backend))
    assert not unknown, (
        "Webapp modelPricing.ts prices models absent from the canonical "
        f"model_costs.json: {unknown}"
    )


def test_shared_models_have_matching_prices():
    """Prices for models present in both files must agree exactly."""
    backend = _load_backend_prices()
    webapp = _load_webapp_prices()

    mismatches: list[str] = []
    for name in sorted(set(backend) & set(webapp)):
        b, w = backend[name], webapp[name]
        if b["input"] != w.get("input"):
            mismatches.append(f"{name}.input backend={b['input']} webapp={w.get('input')}")
        if b["output"] != w.get("output"):
            mismatches.append(f"{name}.output backend={b['output']} webapp={w.get('output')}")
        # Cached price only compared when the backend defines one.
        if "cached" in b and b["cached"] != w.get("cached"):
            mismatches.append(f"{name}.cached backend={b['cached']} webapp={w.get('cached')}")

    assert not mismatches, "Pricing drift between backend and webapp:\n" + "\n".join(mismatches)
