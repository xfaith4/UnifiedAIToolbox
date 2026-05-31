/**
 * Cost-model verification tests for the orchestration bridge.
 *
 * Uses Node's built-in test runner (no jest dependency required):
 *
 *   node --test apps/orchestration-bridge/lib/costs.nodetest.js
 *
 * Named *.nodetest.js (not *.test.js) so jest's testMatch ignores it; jest
 * cannot execute node:test files. Run it with `node --test <path>`.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { computeCosts, computeHumanEquivalent } = require('./run-tracker');
const { loadCostConfig } = require('./config-loader');

const approx = (actual, expected, eps = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= eps, `expected ${actual} ≈ ${expected}`);

// --- computeCosts: token_pricing path -------------------------------------

test('token_pricing prices input + output per million', () => {
  const config = {
    token_pricing: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      input_price_per_million_tokens_usd: 0.15,
      output_price_per_million_tokens_usd: 0.6,
      cached_input_price_per_million_tokens_usd: null,
    },
  };
  const c = computeCosts({ tokens_in: 1_000_000, tokens_out: 1_000_000 }, config);
  approx(c.api_cost_usd, 0.75); // 0.15 + 0.60
  assert.match(c.api_pricing_source, /openai\/gpt-4o-mini/);
});

test('cached input is a subset of input, priced at the cached rate', () => {
  const config = {
    token_pricing: {
      input_price_per_million_tokens_usd: 2.5,
      output_price_per_million_tokens_usd: 15.0,
      cached_input_price_per_million_tokens_usd: 0.25,
    },
  };
  // 1,000,000 input (400,000 cached -> 600,000 uncached), 1,000,000 output:
  //   uncached 0.6*2.5 = 1.50, cached 0.4*0.25 = 0.10, output 1*15 = 15
  const c = computeCosts(
    { tokens_in: 1_000_000, tokens_out: 1_000_000, cached_tokens_in: 400_000 },
    config
  );
  approx(c.api_cost_usd, 16.6);
});

test('cached tokens cannot exceed input or overbill', () => {
  const config = {
    token_pricing: {
      input_price_per_million_tokens_usd: 2.5,
      output_price_per_million_tokens_usd: 0,
      cached_input_price_per_million_tokens_usd: 0.25,
    },
  };
  const clamped = computeCosts(
    { tokens_in: 1_000_000, tokens_out: 0, cached_tokens_in: 2_000_000 },
    config
  );
  const fullInput = computeCosts({ tokens_in: 1_000_000, tokens_out: 0 }, config);
  approx(clamped.api_cost_usd, 0.25); // all 1M billed as cached
  assert.ok(clamped.api_cost_usd <= fullInput.api_cost_usd);
});

test('no cached rate => all input billed at full rate (backward compatible)', () => {
  const config = {
    token_pricing: {
      input_price_per_million_tokens_usd: 2.5,
      output_price_per_million_tokens_usd: 15.0,
      cached_input_price_per_million_tokens_usd: null,
    },
  };
  // cached_tokens_in present but ignored because no cached rate is configured.
  const c = computeCosts(
    { tokens_in: 1_000_000, tokens_out: 1_000_000, cached_tokens_in: 400_000 },
    config
  );
  approx(c.api_cost_usd, 17.5); // 2.5 + 15.0, no cached discount
});

// --- computeCosts: legacy + compute + storage + env -----------------------

test('legacy blended rate is used when no token_pricing block', () => {
  const config = { api_cost_per_1k_tokens_usd: 0.02 };
  const c = computeCosts({ tokens_in: 6000, tokens_out: 4000 }, config);
  approx(c.api_cost_usd, 0.2); // (10000/1000) * 0.02
  assert.equal(c.api_pricing_source, 'legacy_blended_estimate');
});

test('compute, storage, total and environmental estimates', () => {
  const config = {
    api_cost_per_1k_tokens_usd: 0,
    cpu_cost_per_hour_usd: 0.1,
    gpu_cost_per_hour_usd: 1.5,
    avg_cpu_power_watts: 50,
    avg_gpu_power_watts: 200,
    water_intensity_l_per_kwh: 0.5,
    storage_cost_per_gb_month_usd: 0.023,
  };
  const c = computeCosts(
    { tokens_in: 0, tokens_out: 0, cpu_seconds: 3600, gpu_seconds: 3600, duration_ms: 3_600_000, storage_gb: 10 },
    config
  );
  approx(c.compute_cost_usd, 1.6); // 0.1 + 1.5
  approx(c.storage_cost_usd, 0.23); // 10 * 0.023
  // energy: (250 W * 3600 s) / 3_600_000 = 0.25 kWh; water: 0.25 * 0.5 = 0.125 L
  approx(c.energy_kwh, 0.25);
  approx(c.water_liters, 0.125);
  approx(c.total_usd, 1.83); // api 0 + compute 1.6 + storage 0.23
});

// --- computeHumanEquivalent: field precedence -----------------------------

test('human-equivalent prefers v2 fields over legacy names', () => {
  const config = {
    human_equivalent_hourly_rate_usd: 100,
    baseline_hours_per_orchestration_run: 3,
    human_hourly_rate_usd: 60, // legacy, should be ignored
    baseline_hours_per_unit: 2, // legacy, should be ignored
  };
  const run = { duration_ms: 60_000, costs: { total_usd: 1 } }; // short run -> baseline floor
  const he = computeHumanEquivalent(run, config);
  assert.equal(he.estimated_hours_if_human, 3); // baseline floor
  assert.equal(he.estimated_cost_if_human, 300); // 3 * 100
});

test('human-equivalent falls back to legacy field names', () => {
  const config = { human_hourly_rate_usd: 60, baseline_hours_per_unit: 2 };
  const run = { duration_ms: 60_000, costs: { total_usd: 1 } };
  const he = computeHumanEquivalent(run, config);
  assert.equal(he.estimated_hours_if_human, 2);
  assert.equal(he.estimated_cost_if_human, 120); // 2 * 60
});

test('human-equivalent duration multiplier exceeds baseline for long runs', () => {
  const config = { human_equivalent_hourly_rate_usd: 50, baseline_hours_per_orchestration_run: 2 };
  // 1 hour run -> duration_hours*10 = 10 > baseline 2
  const run = { duration_ms: 3_600_000, costs: { total_usd: 5 } };
  const he = computeHumanEquivalent(run, config);
  assert.equal(he.estimated_hours_if_human, 10);
  assert.equal(he.estimated_cost_if_human, 500);
});

// --- loadCostConfig: resolution order -------------------------------------

test('COST_CONFIG_PATH override takes precedence', () => {
  const tmp = path.join(os.tmpdir(), `costs-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ api_cost_per_1k_tokens_usd: 9.99, marker: 'env-override' }));
  const prev = process.env.COST_CONFIG_PATH;
  try {
    process.env.COST_CONFIG_PATH = tmp;
    const cfg = loadCostConfig();
    assert.equal(cfg.marker, 'env-override');
    assert.equal(cfg.api_cost_per_1k_tokens_usd, 9.99);
  } finally {
    if (prev === undefined) delete process.env.COST_CONFIG_PATH;
    else process.env.COST_CONFIG_PATH = prev;
    fs.rmSync(tmp, { force: true });
  }
});

test('loadCostConfig returns a usable config with required keys by default', () => {
  const prev = process.env.COST_CONFIG_PATH;
  try {
    delete process.env.COST_CONFIG_PATH;
    const cfg = loadCostConfig();
    // Whether sourced from costs.json, costs.example.json, or built-in defaults,
    // the loader must always yield the core keys consumers rely on.
    for (const key of [
      'cpu_cost_per_hour_usd',
      'gpu_cost_per_hour_usd',
      'avg_cpu_power_watts',
      'avg_gpu_power_watts',
      'water_intensity_l_per_kwh',
      'storage_cost_per_gb_month_usd',
    ]) {
      assert.equal(typeof cfg[key], 'number', `${key} should be a number`);
    }
  } finally {
    if (prev !== undefined) process.env.COST_CONFIG_PATH = prev;
  }
});
