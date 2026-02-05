 Add an Artifact Normalizer + Verifier stage to the orchestration tool

### Objective

Modify the orchestration tool so that **every generated ZIP artifact is automatically normalized into a runnable, correctly structured repository** before the final output is returned.

The normalization should replicate these assessment and cleanup behaviors:

1. **Strip Markdown code fences** accidentally included inside code files (e.g., files starting with `python / `tsx / `yaml and ending with `).
2. **Detect and relocate “orphan / weirdly named” files** (e.g., filenames like `s`, `not financial advice`, `watchlists, default timeframes`, etc.) into appropriate folders with safe filenames.
3. **Detect “bundled multi-file blobs”** where one file contains multiple sections like `File: backend/Dockerfile`, `File: deploy/nginx/default.conf`, etc. Split into discrete files.
4. **Create missing scaffolding** required for basic build/run (not full production polish):

   * Frontend: `package.json`, `vite.config.*`, `tsconfig.json`, `index.html` if missing (minimum viable Vite + React + TS setup).
   * Backend: `requirements.txt` or `pyproject.toml` (choose one), ensure importable packages (add `__init__.py` where required).
5. **Rewrite docker-compose into a valid compose file** (if it’s been produced as a blob or invalid YAML).
6. **Run lightweight sanity checks** to verify the output is “runnable-shaped”:

   * Python: syntax compile check (`python -m compileall`).
   * Node: ensure `package.json` exists and `npm run build` can be invoked (optional if dependencies aren’t installed; but validate scripts + structure).
   * YAML parse validation for `docker-compose.yml` and `openapi.yaml`.
7. Produce an **Acceptance Report (post-normalization)** that explicitly states:

   * what was changed
   * what was inferred (and why)
   * what remains uncertain / TODO
   * hard failures that prevent “runnable-shaped” output

### Constraints / Style

* Do **not** change application logic unless needed to make the repo runnable (the normalizer’s job is hygiene + structure, not feature development).
* All transformations must be **deterministic and logged**.
* Never discard content silently:

  * If a file can’t be confidently classified, move it to `orphaned/` and record it in the report.
* Preserve line endings as best as possible; minimize diffs beyond normalization.
* Add unit tests for the normalizer.

### Required Deliverables

1. **New pipeline stage**: `NormalizeArtifactStage` (or similar) that runs after generation and before final packaging.
2. **Implementation** of a normalization module/library, e.g. `src/normalize/` with:

   * `stripCodeFences(fileText, fileExt)`
   * `isProbablyCodeFenceWrapped(fileText)`
   * `splitBundledMultiFileBlob(fileText)`
   * `sanitizeFilename(name)`
   * `classifyOrphan(content, name)` -> suggested destination path
   * `ensureFrontendScaffold(tree)`
   * `ensureBackendScaffold(tree)`
   * `validateOutputs(tree)` -> returns pass/warn/fail + diagnostics
3. **Post-normalization report**: `normalization_report.md` appended or linked into your existing `acceptance_report.md`.
4. **Tests**: fixtures for each failure mode and expected normalized output.
5. **Config switches**:

   * `NORMALIZE_ARTIFACTS=true|false`
   * `NORMALIZE_STRICT=true|false` (strict = fail output if unresolved critical issues remain)

### How the normalizer should work (algorithmic spec)

#### Step A — Load + index

* Unzip generated artifact to a temp workspace.
* Build an inventory: file paths, sizes, extensions, first/last lines, detect binary vs text.

#### Step B — Strip Markdown fences in code-ish files

For each text file:

* If first non-empty line matches /^`[a-zA-Z0-9_-]*\s*$/ and a closing ` exists near end:

  * Remove the opening fence line and the closing fence line.
  * Keep content in-between exactly as-is.
* Apply only to plausible code extensions: `.py .ts .tsx .js .jsx .json .yml .yaml .md? (only if it’s clearly code) .sql .ps1 .sh .dockerfile`
  (For `.md`, only strip if it’s “pure code” wrapped.)

Log each transformation: path + “stripped fences”.

#### Step C — Detect bundled multi-file blobs

If a file contains repeated markers like:

* `File: path/to/file`
* `--- filename ---`
* `### BEGIN FILE: path`
  then:
* Split into discrete files at those markers.
* Write each extracted block to the declared path.
* Replace the original blob with a short stub note or move it to `orphaned/` (configurable).
  Log: source blob -> extracted files list.

#### Step D — Orphan/weird filename handling

Identify suspicious filenames:

* no extension AND short or punctuation-heavy
* contains commas, “e.g.”, spaces-only names, “not financial advice”, etc.

For each:

* If content begins with a clear header like `# Title` or looks like markdown spec -> move to `docs/notes/<sanitized>.md`
* If content looks like code -> infer extension via heuristics:

  * `import`/`def` -> `.py`
  * `export default`/`tsx` -> `.tsx`
  * `openapi:` -> `.yaml`
  * `CREATE TABLE` -> `.sql`
* If still unclear -> `orphaned/<sanitized>.txt`
  Log: original path -> new path + reason.

#### Step E — Ensure minimal scaffolding

**Frontend**

* If `frontend/` exists and has `src/` but no `package.json`, create one:

  * Vite + React + TS minimal scripts: dev/build/preview/test (if tests exist)
* Ensure `vite.config.ts` exists.
* Ensure `index.html` exists at `frontend/index.html`.
* Ensure `tsconfig.json` exists.
* If there are Playwright tests, add `@playwright/test` devDependency and a `test:e2e` script.

**Backend**

* If `backend/` exists and has `.py` files but no dependency manifest:

  * Create `backend/requirements.txt` (FastAPI, uvicorn, pydantic, httpx, pytest, etc.) based on imports detected.
* Ensure package folders have `__init__.py` where imports imply packages.
* If there’s an `openapi.yaml`, keep it at repo root or `backend/openapi.yaml` but ensure consistency.

#### Step F — Compose + YAML correctness

* Validate `docker-compose.yml` parses as YAML and has required fields (`services:`).
* If the compose file is actually a blob:

  * Extract sections into `backend/Dockerfile`, `frontend/Dockerfile`, `deploy/nginx/default.conf`.
  * Generate a clean compose referencing those.
* Validate `openapi.yaml` parses.

#### Step G — Sanity checks

Run “no-install” structural checks (fast, deterministic):

* Python: `python -m compileall backend` (or repo root).
* Node: validate presence of `package.json` and scripts; don’t require `npm install` but do ensure it’s internally coherent.
* Report any remaining critical blockers as FAIL in `normalization_report.md`.

#### Step H — Repackage

* Zip the normalized repo as final output artifact.
* Ensure the report is included.

### Acceptance criteria (must pass)

* No code file in final output begins with a Markdown fence line.
* No file named `docker-compose.yml` contains multiple unrelated “File:” sections.
* Frontend folder is build-scaffolded enough that a developer can `npm install` then `npm run dev` without discovering missing root config files.
* Backend folder is structured enough that a developer can create a venv and `pip install -r requirements.txt` then run uvicorn entrypoint (even if external API keys are needed).
* A `normalization_report.md` exists and lists every transformation with counts and paths.

### What to change in the orchestration tool

* Insert stage into pipeline: `Generate -> Normalize -> Verify -> Package`.
* Add config flags and default them to ON in CI.
* Add tests + fixtures and run them in CI.

### Output requested from you (the agent)

1. The code changes implementing the stage + module.
2. Test suite + fixtures.
3. Updated documentation: how normalization works and how to disable/strict-mode it.

---

## Implementation hint (to keep the agent honest)

Tell the agent to include a **“transform log”** (JSON) like `normalize_log.json` with entries:

* `action`, `path_before`, `path_after`, `reason`, `hash_before`, `hash_after`

That one feature prevents 90% of “mysterious” normalizers.

---

If you run this prompt against your orchestration tool, you’ll effectively be embedding a “repo hygiene robot” into the pipeline—so the model can still be creative in generation, but the output gets snapped back into the physical laws of build systems.
