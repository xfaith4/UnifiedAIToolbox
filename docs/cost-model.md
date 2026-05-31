# Cost Model — Orchestration Run Estimates

This document explains how orchestration run cost and human-equivalent value are
estimated. These are transparent, configurable estimates — not billing-grade figures.

---

## Purpose

The cost model gives each run a set of rough, explainable numbers:

- How much did this run cost to execute?
- What would equivalent human effort have cost?
- What was the approximate environmental footprint?

The goal is honest telemetry, not accounting. All values are estimates.

---

## Configuration

Cost parameters live in `config/costs.json` (your local, gitignored overrides)
or `config/costs.example.json` (the committed reference values).

Resolution order at runtime:

1. `COST_CONFIG_PATH` environment variable (highest precedence; absolute path to any JSON file).
2. `config/costs.json` — local overrides, not committed.
3. `config/costs.example.json` — reference values, committed.
4. Built-in hardcoded defaults (same values as the example file).

To set your own values without modifying the example file:

```bash
cp config/costs.example.json config/costs.json
# Edit config/costs.json
```

---

## Cost Categories

### 1. API Token Cost

Estimated from token counts reported by the orchestration run.

**Preferred (schema v2):** Use the `token_pricing` block for model-specific rates:

```json
{
  "token_pricing": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "input_price_per_million_tokens_usd": 0.15,
    "output_price_per_million_tokens_usd": 0.60,
    "cached_input_price_per_million_tokens_usd": null,
    "source": "provider_pricing_page",
    "last_verified": "2025-01-01"
  }
}
```

Formula (cached input tokens are a **subset** of `tokens_in`, not extra tokens —
the cached portion is billed at the cached rate, the remainder at the full input
rate, and `cached_tokens_in` is clamped to `tokens_in`):

```
cached_in   = min(cached_tokens_in, tokens_in)   # only when a cached rate is set
uncached_in = tokens_in - cached_in

api_cost = (uncached_in       / 1_000_000) * input_price_per_million
         + (cached_in         / 1_000_000) * cached_input_price_per_million
         + (tokens_out        / 1_000_000) * output_price_per_million
```

When no `cached_input_price_per_million_tokens_usd` is set, all of `tokens_in`
is priced at the full input rate (cached pricing is skipped). This matches the
backend `model_costs.py` and webapp `modelPricing.ts` calculators.

**Legacy fallback:** If no `token_pricing` block is present, the legacy
`api_cost_per_1k_tokens_usd` field is used as a blended estimate over all tokens.
The run report will label the result `legacy_blended_estimate`.

**Disclaimer:** Token prices vary by model, provider, input/output ratio, caching,
batch mode, tool use, and any platform wrapper markup. Prices change without notice.
Always verify against the provider's current pricing page.

### 2. Compute Runtime Cost

Estimated from CPU/GPU seconds and hourly rates:

```
compute_cost = (cpu_seconds / 3600) * cpu_cost_per_hour
             + (gpu_seconds / 3600) * gpu_cost_per_hour
```

Relevant config keys: `cpu_cost_per_hour_usd`, `gpu_cost_per_hour_usd`.

### 3. Storage Cost

```
storage_cost = storage_gb * storage_cost_per_gb_month_usd
```

Relevant config key: `storage_cost_per_gb_month_usd`.

### 4. Total Cost

```
total_usd = api_cost_usd + compute_cost_usd + storage_cost_usd
```

The run report shows the breakdown and total separately. Do not treat the total
as a precise invoice line.

---

## Environmental Estimates

### Energy

```
energy_kwh = ((avg_cpu_power_watts + avg_gpu_power_watts) * duration_seconds) / 3_600_000
```

### Water

```
water_liters = energy_kwh * water_intensity_l_per_kwh
```

**Disclaimer:** Environmental impact depends on datacenter region, energy mix,
cooling method, workload density, and provider efficiency. These figures are
rough approximations useful for trend tracking, not auditable sustainability
reporting.

---

## Human-Equivalent Value

The human-equivalent value is a **business-value proxy**, not a true cost:

```
estimated_hours_if_human = max(baseline_hours_per_orchestration_run, actual_duration_hours * 10)
estimated_cost_if_human  = estimated_hours_if_human * human_equivalent_hourly_rate_usd
```

**Preferred config keys (schema v2):**
- `human_equivalent_hourly_rate_usd` — fully-loaded labor-value proxy for the type
  of work being assisted or compressed.
- `baseline_hours_per_orchestration_run` — human work-hours typically needed to
  complete one comparable run without the tool.

**Legacy equivalents (still supported):**
- `human_hourly_rate_usd`
- `baseline_hours_per_unit`

**Important:** `human_equivalent_hourly_rate_usd` is not a wage, not a billing rate,
and not a commitment. It is an input to a rough value-of-time estimate. Adjust it to
match the actual work context (e.g., junior engineer, senior engineer, consultant).

---

## Schema Version

| Field | Schema v2 preferred name | Legacy name (still supported) |
|---|---|---|
| Labor rate | `human_equivalent_hourly_rate_usd` | `human_hourly_rate_usd` |
| Run baseline | `baseline_hours_per_orchestration_run` | `baseline_hours_per_unit` |
| Token pricing | `token_pricing` block | `api_cost_per_1k_tokens_usd` |

The `_schema_version` key in `costs.example.json` identifies the config format.
Version `2.0` adds `token_pricing`, `human_equivalent_hourly_rate_usd`, and
`baseline_hours_per_orchestration_run`. Version `1.x` fields remain supported.

---

## What This Is Not

- Not a billing system.
- Not an auditable cost ledger.
- Not a real-time pricing feed.
- Not a sustainability compliance report.

Use it to understand trends, compare runs, and give stakeholders a rough
sense of value — not to charge customers or report emissions.
