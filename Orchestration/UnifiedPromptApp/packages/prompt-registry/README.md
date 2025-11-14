# Prompt Registry Package

Home for the canonical YAML schema, validators, and render helpers that originated in `Prompt Library Projects/Ideal-Prompt-Library`.

## Current Layout

- `prompts/` – All YAML prompt specs from the Ideal Prompt Library (`prompts/catalog/...`).
- `schemas/` – Canonical JSON Schemas referenced by prompts and tooling.
- `tooling/` – PowerShell render + lint modules (existing scripts still work, paths will be updated as services move in).
- `policies/`, `demos/` – Governance collateral and sample payloads.
- `src/prompt_registry/` – Python package that loads YAML specs and exposes simplified JSON payloads.
- `tests/` – Pytest suite that validates round-tripping + ID lookups.
- `pyproject.toml` – Defines dependencies (`PyYAML`, optional `pytest`).

## Deliverables

1. CLI: `prompt-registry lint` / `uv run validate-prompts` to enforce the canonical schema.
2. Library: `from prompt_registry import PromptSpec` for Python services. *(Implemented in `src/prompt_registry/__init__.py`.)*
3. Metadata exporter for the React app's simplified JSON view. *(See `PromptSpec.to_ui_payload()`.)*
4. Schema generator: `uv run generate-prompt-schema -- --output schemas/prompt.schema.json`.
5. Automated tests: run `./scripts/Test-PromptRegistry.ps1` (defaults to `C:\Python313\python.exe`) or pass `-PythonExe` to point at any interpreter. This script wires up `PYTHONPATH` automatically before calling `pytest`.

## Quickstart

```bash
# List all prompt IDs
python -m prompt_registry.cli list

# Export the simplified JSON payload for a given prompt
python -m prompt_registry.cli export analytics.divisions.performance.summary --format ui

# Validate every prompt round-trips through PromptSpec.to_ui_payload
python -m prompt_registry.cli roundtrip --verbose

# Validate canonical schema compliance (fails non-zero on errors)
uv run validate-prompts

# Regenerate the JSON Schema file
uv run generate-prompt-schema -- --output schemas/prompt.schema.json

# Generate a demo payload snapshot (writes demos/out_roundtrip.json)
python demos/export_roundtrip.py
```

## Schema & Validation Tooling

- **Generate schema:** `uv run generate-prompt-schema -- --output schemas/prompt.schema.json` or `prompt-registry schema --output <path>` to keep the on-disk contract synced with the canonical definition in `docs/consolidation/02_canonical_schema.md`.
- **Editor-friendly lint:** `prompt-registry lint` performs the same validation as the CI job but emits errors inline; `uv run validate-prompts` runs the standalone entry point wired to `jsonschema`.
- **PowerShell wrapper:** `./tools/Validate-Prompts.ps1` locates the package, prefers `uv run validate-prompts`, and falls back to `python -m prompt_registry.cli lint`, making it easy to run in Windows shells or CI.
- **CI hook:** Add the wrapper to your pipeline before building downstream services so schema drift is caught early:

  ```yaml
  - pwsh: ./tools/Validate-Prompts.ps1
    displayName: Validate canonical prompt schema
  ```

The `validation` module caches the generated schema on disk (`schemas/prompt.schema.json`). Regenerating the file and running the wrapper ensures IDEs, pre-commit hooks, and hosted runners all agree on the same contract.

## Publishing & Distribution

Build artifacts live in `dist/` (sdist + wheel). Use the helper script to create and optionally publish a release:

```powershell
# Build only (drops artifacts in dist/)
pwsh ./scripts/Publish-PromptRegistry.ps1 -BuildOnly

# Build + publish to a custom feed using uv (token pulled from UV_PUBLISH_TOKEN)
pwsh ./scripts/Publish-PromptRegistry.ps1 `
    -FeedUrl https://pkgs.example.com/simple `
    -ApiToken $env:UNIFIED_PROMPT_FEED_TOKEN
```

Behind the scenes the script prefers `uv build`/`uv publish`; if `uv` is not installed it falls back to `python -m build`. For manual publishing, run `uv build` followed by `uv publish --index <feed>` (or upload the `dist/` artifacts with Twine/GitHub Packages). Downstream repos can then `pip install prompt-registry==<version>` or add it to their `uv.lock`.

## Migrating legacy prompt libraries

The `scripts/import_legacy_prompts.py` utility codifies the migration path for every legacy source under `Prompt Library Projects/*`. Each sub-command emits canonical `.prompt.yaml` files under `prompts/catalog/<subdir>` and automatically validates them against `schemas/prompt.schema.json`.

### Ideal Prompt Library

These prompts already follow the canonical schema. Mirror them straight into this package:

```pwsh
python scripts/import_legacy_prompts.py ideal `
    --prompts-root ..\..\Prompt Library Projects\Ideal-Prompt-Library\prompts `
    --catalog-subdir ideal `
    --tag legacy
```

### React Prompt Library (`prompt-library.json`)

Exports from the Vite app live in `PromptLibrary/prompt-library.json`. Convert them (IDs are normalized, variables inferred, provenance stamped):

```pwsh
python scripts/import_legacy_prompts.py prompt-library `
    --json ..\..\Prompt Library Projects\PromptLibrary\prompt-library.json `
    --catalog-subdir imported\prompt-library `
    --default-version 1.0.0 `
    --id-prefix promptlibrary `
    --category "Prompt Library" `
    --tags prompt-library react
```

### PromptService templates (`templates/*.yaml`)

Legacy FastAPI templates (used by the Workbench) are consolidated like so:

```pwsh
python scripts/import_legacy_prompts.py prompt-service `
    --templates ..\..\Prompt Library Projects\PromptService\templates `
    --catalog-subdir imported\prompt-service `
    --review-policy critical `
    --category "Operations" `
    --tags genesys ops `
    --models gpt-4o-mini gpt-4o
```

The importer derives IDs (`agent_webrtc_disconnect_v1.0.0` → `agent.webrtc.disconnect` + `version=1.0.0`), preserves dataset/output contracts as rich instructions, and injects placeholder variables (`role`, `input_data`, etc.) so every prompt passes schema validation. Use `--include pattern` to selectively migrate template filenames.

### PromptGenerationLibrary / ad-hoc HTML tools

These projects don’t persist prompts directly. Export your prompts to JSON (the output structure matches the React prompt library format) and feed the resulting file into the `prompt-library` sub-command. This keeps all legacy authoring paths aligned on a single import workflow.

### Validating the result

Every import run fails fast on schema violations. For belt-and-suspenders checks, rerun the package lint:

```pwsh
pwsh ./scripts/Test-PromptRegistry.ps1
```
