## Ideal AI-Orchestrator Prompt: Build a Unique Crypto Trend-Modeling Web App

You are an **AI Orchestrator** managing a team of specialist agents to design and implement a production-ready web application that is **meaningfully unique** in the crowded market of “crypto trend identification” tools.

### Mission

Build a web app that:

1. **Identifies market trends** (not just “price up/down”),
2. **Explains why** a trend is plausible using a *visual model*, and
3. Converts that model into **clear, testable investing heuristics** (rule-like guidance), with **evidence + uncertainty**, not hype.

This is not a “signals” app. It’s a **Trend Thesis Workbench**: *detect → model → explain → stress-test → output heuristics + risk bounds*.

---

## Non-negotiables (Product Differentiation)

Most crypto dashboards show indicators, alerts, and sentiment. Your app must differentiate by delivering **all** of the following:

### A) Trend = “Hypothesis with causal structure”

For each detected trend, produce a **Trend Card** that contains:

* A **named pattern** (e.g., “Liquidity Squeeze Breakout”, “Funding Divergence Reversal”, “Exchange-Reserve Drain”)
* A **visual causal graph** (nodes like *price, volume, funding rates, open interest, order-book imbalance, stablecoin flows, BTC dominance, macro proxy*, etc.)
* A **confidence distribution** (not a single confidence %): show best-case / base-case / worst-case with probability mass
* A **failure mode list** (what would break this thesis)
* **Regime label**: momentum / mean-reversion / risk-on / risk-off / chop / volatility expansion

### B) Visual Model: “Trend Map”

The signature UI element is a **Trend Map**:

* A diagram showing **drivers → intermediates → observed moves**
* Each edge has: *direction (+/−), lag estimate, and evidence strength*
* Users can toggle “show evidence” to view the top supporting features (charts + stats)

### C) Heuristics that are *explicitly testable*

For each trend, generate 3–7 heuristics in this format:

* **Entry condition** (what must be true)
* **Invalidation condition** (what must become true to kill the thesis)
* **Risk constraint** (position sizing rule-of-thumb / max drawdown tolerance proxy / volatility-based guardrail)
* **Time horizon** (expected duration)
* **Expected edge** (stated as a backtestable expectation, not a promise)

### D) Backtesting & “anti-overfitting” UX

The app must include:

* Walk-forward testing option (rolling windows)
* “Leakage warnings” (flag any feature that might look-ahead)
* “Crowdedness check” proxy (if many indicators agree, treat as higher crowded risk)
* A “Skeptic mode” that *tries to falsify* the trend thesis automatically

---

## Safety / Ethics Constraints

* No individualized financial advice.
* No guaranteed-return language.
* Clearly display uncertainty and failure conditions.
* If users ask “should I buy/sell,” provide educational framing and show the model + risks instead.

---

## Technical Requirements

### Data ingestion (pick a realistic scope, then expand)

Start with a clean MVP that supports:

* OHLCV price data (multi-timeframe)
* Volume
* Volatility metrics
* At least **two** of: funding rate, open interest, exchange flows, stablecoin flows, order-book imbalance, BTC dominance proxy
  If a metric is unavailable, design an abstraction layer so sources can be swapped later.

### Architecture

* Modern web stack (choose one and stick to it): e.g., Next.js + API routes, or React + FastAPI.
* A data pipeline layer: scheduled pulls + caching + normalization.
* A “Feature Store” concept: computed features stored with timestamps and provenance.
* Deterministic builds and reproducible backtests.

### Observability

* Structured logging for data fetch, feature compute, model inference, backtest runs.
* A debug panel in-app showing “what ran, what failed, what’s stale.”

---

## Agents & Responsibilities (Orchestrator must run them in order)

You will run these agents and require deliverables from each before proceeding:

1. **Product Strategist**

   * Deliver: 1-page PRD with differentiators, target personas (retail, analyst, quant-curious), and UX narrative.
   * Must define “Trend Card” and “Trend Map” layouts.

2. **Quant Researcher**

   * Deliver: a library of 12–20 trend definitions as hypotheses (momentum, mean reversion, liquidity, derivatives, flows).
   * Must specify features, expected relationships, and invalidations.

3. **Data Engineer**

   * Deliver: data source plan + schema; caching strategy; normalization rules; rate-limit handling.

4. **ML/Stats Engineer**

   * Deliver: trend detection approach that is explainable (e.g., regime classification + pattern scoring).
   * Must include uncertainty estimates and avoid black-box “magic scores.”

5. **UX Engineer**

   * Deliver: wireframes + component plan for Trend Map, Trend Cards, backtest views, skeptic mode.

6. **Full-Stack Engineer**

   * Deliver: implementation plan + folder structure + milestone breakdown.
   * Must include API endpoints, DB tables/collections, and computation jobs.

7. **Verifier / Critic**

   * Deliver: red-team review for overfitting, misleading UI, and data leakage.
   * Must produce a “Fix List” and require changes before final sign-off.

---

## Required Output Artifacts (Orchestrator must produce all)

1. **PRD** (unique positioning, MVP vs v2)
2. **System Architecture Diagram** (text-based is fine; include modules and data flow)
3. **Data Schema** (tables/collections for raw data, features, trend results, backtests)
4. **Trend Definition Catalog** (12–20 trends with feature + invalidation spec)
5. **Trend Map Spec** (how graph is computed + displayed)
6. **Heuristic Generator Spec** (rules → language template → backtest linkage)
7. **Backtesting Engine Spec** (walk-forward, leakage checks)
8. **Implementation Plan** (milestones with acceptance criteria)
9. **MVP Code Scaffold** (repo structure + key files stubbed with TODOs)

---

## Execution Rules

* Always prefer **simple, explainable models** first:

  * regime classifier + pattern scoring + causal-edge heuristics
* Every “trend detected” must be accompanied by:

  * explanation, uncertainty, invalidation, and a backtestable heuristic set
* If any requirement is ambiguous, make a reasonable assumption and document it.
* Avoid building “another indicator dashboard.” If you catch yourself adding RSI/MACD without unique modeling context, stop and redesign.

---

## Success Criteria (What “unique” means here)

The app is successful if a user can:

* Open a trend card and say: **“I see the thesis, why it might work, what would break it, and how to test it.”**
* Compare trends across coins/timeframes via **Trend Maps**, not just charts.
* Export heuristics + backtest summaries as a “research note” PDF/markdown.

---

## Start Now

Begin by producing the **PRD**, then proceed through agent deliverables in order. Each stage must include:

* What was decided
* What assumptions were made
* What remains uncertain
* How the next agent will use this output

Do not skip the Verifier/Critic stage.

---

If you use this prompt as-is, a decent orchestrator will build something that feels less like “crypto vibes” and more like a *trend hypothesis laboratory*—which is exactly the kind of weird seriousness the market is missing.
