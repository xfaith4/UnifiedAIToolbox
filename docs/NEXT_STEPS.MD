# What's good and what to boost #

You’re already building the *right kind* of thing: not “prompt → code,” but “prompt → **deliverable** with visibility, costs, and gates.” The market is crowded with app-gen tools (e.g., Replit’s Agent, Cursor + Model Context Protocol), but there’s still a big gap between “it generated code” and “it shipped safely.” ([Replit Docs][1])

Below are **high-leverage boosts** that stay on-topic (App Factory / Prompt+Agent Library / Milestones) and are genuinely marketable—followed by likely **blind spots**.

---

## 1 Make “buildable” a product feature, not a hope ##

### Boost: **Deterministic Build & Test Gates** ###

Turn every run into an explicit CI-like contract:

* **Build Gate:** project compiles (language-aware)
* **Test Gate:** unit tests run, with *minimum coverage / minimum assertions*
* **Run Gate:** app boots and the primary workflow executes in a smoke test
* **Artifact Gate:** output zip contains *only* runnable files (no fenced code blocks, placeholder dirs, etc.)

Why this is unique: many systems generate impressive repos that still fail to build/tests (a common complaint in the agentic coding world). ([Hacker News][2])

**Implementation idea:** add a permanent **Verifier** agent + an “execution harness” that runs `dotnet build`, `npm test`, `pytest`, etc., and writes results back into the run graph as first-class nodes. Even if you can’t execute code in-prod initially, the harness can be a local runner plugin.

---

## 2 Safety + governance as a differentiator (and a selling point) ##

### Boost: **Guardrails that prevent “agent oops” disasters** ##

Autonomous code tools have had very public failures (including destructive actions + misleading behavior). ([Business Insider][3])
So: ship guardrails that you can brag about.

Add an explicit **Change Safety Model**:

* **Read-only by default** (agents propose diffs, not direct writes)
* **Write permission tokens** (agent must “request escalation” for destructive actions)
* **Blast-radius limits** (no deleting databases, no editing prod configs, no rotating secrets without explicit approval)
* **Immutable provenance** (every file in the zip points to: which agent + which task + which sources)

This sells well to teams. It also makes your system *feel enterprise*.

---

## 3 Your Prompt & Agent Library: evolve it from “storage” to “compiler” ##

### Boost: **Prompt Contracts + Static Analysis** ###

You’re sitting on a gold mine: prompts and agents can be treated like code.

Add:

* **Schemas** for prompt outputs (JSON schema / YAML contracts)
* **Linting**: detect ambiguous requirements (“fast,” “scalable,” “secure” without criteria)
* **Auto-suggestions**: “Your request lacks acceptance checks; add X/Y/Z”
* **Regression tests for prompts**: same prompt against multiple models → compare build success + test pass rate + token cost.

This becomes a real moat: everyone has prompts; almost nobody has **prompt CI**.

---

## 4 Milestones: upgrade from a timeline to an evidence-driven dashboard ##

### Boost: **Outcome Telemetry** ###

Give Milestones a “truth layer”:

* % of runs that produced **buildable** artifacts
* mean time-to-green (iterations until build/test pass)
* cost-per-green-build
* defect density (lint errors, failing tests, vulnerability findings)
* “most common failure reasons” across runs (missing csproj, deps drift, namespace drift)

This makes your Milestone dashboard not just project management—it's **manufacturing yield**.

---

## 5 The “unique sauce”: automatic artifact normalization ##

### Boost: **Repo Normalizer / Scaffold Synthesizer** ###

This is *exactly* the thing that bit you in your earlier artifact: good content, not a repo.

Build a universal “Repo Normalizer” stage that can:

* strip markdown fences from code files
* generate missing `.sln/.csproj/package.json/pyproject.toml`
* reconcile namespaces/import paths
* dedupe duplicate modules
* enforce standard repo layout templates
* produce a single clean zip

This is surprisingly rare in open tooling—and incredibly valuable.

---

## 6) Integration & ecosystem: treat MCP/connectors as production plumbing

### Boost: **Pluggable toolchain and context**

A lot of app-gen capability depends on context and tools (e.g., Cursor’s MCP ecosystem). ([Cursor][4])

Differentiate by supporting:

* “context packs” per stack: **React+Node**, **.NET WPF**, **Python+Streamlit**, etc.
* connectors: GitHub repo context, OpenAPI specs, DB schemas, design system tokens
* safe secrets handling (never leak secrets into logs/artifacts)

---

# Your likely blind spots

These are the holes that tend to show up only after the honeymoon phase 😄

## A) “It generated code” ≠ “It shipped safely”

Blind spot: assuming codegen success implies user value.

Fix: promote **build/test/run** to top-tier KPIs.

## B) Evaluation is missing (you can’t improve what you can’t measure)

Blind spot: no consistent scoring harness across runs.

Fix: the Yield Dashboard + regression tests for prompts.

## C) IP/licensing + dependency supply chain

Blind spot: generated repos may pull in risky licenses or vulnerable packages.

Fix:

* SBOM generation (software bill of materials)
* license policy checks
* vulnerability scans
* “allowed dependency list” per template

## D) Secrets + data handling

Blind spot: agents accidentally echo secrets into logs, prompts, artifacts.

Fix: redaction filters + secret scanners + “never persist secrets” policy enforcement.

## E) UX scaling: graph becomes unreadable at “huge run” sizes

You already noticed this.

Fix ideas:

* collapsible “agent swarms” into a single node with rollup stats
* filter by phase / stack / failure
* “only show critical path”
* search + “jump to agent”

---

# If you want a single *marketable* headline feature

**“Green Build Guarantee Mode”**
Runs are not “done” until the artifact is verifiably buildable and the smoke test passes, with a traceable provenance trail and safety limits.

That’s a message that lands with engineers *and* leaders.

---

If you keep leaning into “factory yield” (build/test gating, provenance, safety, telemetry), you’ll be in a different category than the typical prompt-to-repo generators—and you’ll have the dashboard to prove it.

[1]: https://docs.replit.com/replitai/agent?utm_source=chatgpt.com "Replit Agent"
[2]: https://news.ycombinator.com/item?id=46691243&utm_source=chatgpt.com "Do you have any evidence that agentic coding works?"
[3]: https://www.businessinsider.com/replit-ceo-apologizes-ai-coding-tool-delete-company-database-2025-7?utm_source=chatgpt.com "Replit's CEO apologizes after its AI agent wiped a company's code base in a test run and lied about it"
[4]: https://cursor.com/docs/context/mcp?utm_source=chatgpt.com "Model Context Protocol (MCP) | Cursor Docs"
