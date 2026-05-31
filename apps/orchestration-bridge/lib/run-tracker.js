/**
 * Run Tracker Module
 *
 * Captures and stores orchestration run metadata including:
 * - Duration, tokens, API calls
 * - Cost calculations (API, compute, storage)
 * - Environmental impact (energy, water)
 * - Human-equivalent comparisons
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Constants
const MS_TO_KWH_DIVISOR = 3600000; // Conversion from watt-milliseconds to kWh

/**
 * Get current ISO timestamp
 * @returns {string} ISO 8601 timestamp
 */
function nowIso() {
  return new Date().toISOString();
}

/**
 * Ensure runs directory exists
 * @returns {string} Path to runs directory
 */
function ensureRunsDir() {
  const dir = path.join(__dirname, '..', 'runs');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Save run to file and update index
 * @param {Object} run - Run object to save
 * @returns {string} Path to saved run file
 */
function saveRun(run) {
  const dir = ensureRunsDir();

  // Create filename with timestamp and run ID
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
  const shortId = run.id.split('-')[0];
  const filename = `${timestamp}-${shortId}.json`;
  const filePath = path.join(dir, filename);

  // Save run file
  fs.writeFileSync(filePath, JSON.stringify(run, null, 2));

  // Update index summary
  const indexPath = path.join(dir, 'index.json');
  let index = [];
  if (fs.existsSync(indexPath)) {
    try {
      index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    } catch (err) {
      console.warn('Failed to read index.json, creating new index:', err.message);
      index = [];
    }
  }

  // Add summary entry to index
  index.unshift({
    id: run.id,
    name: run.name,
    start_time: run.start_time,
    end_time: run.end_time,
    duration_ms: run.duration_ms,
    total_cost_usd: run.costs ? run.costs.total_usd : null,
    energy_kwh: run.costs ? run.costs.energy_kwh : null,
    water_liters: run.costs ? run.costs.water_liters : null,
    status: run.summary ? (run.summary.success ? 'success' : 'failed') : 'unknown',
    file: filename
  });

  // Keep only last 1000 entries
  fs.writeFileSync(indexPath, JSON.stringify(index.slice(0, 1000), null, 2));

  return filePath;
}

/**
 * Compute costs and environmental impact
 * @param {Object} resources - Resource usage data
 * @param {Object} config - Cost configuration
 * @returns {Object} Calculated costs
 */
function computeCosts(resources, config) {
  // --- API token cost ---
  // Prefer model-specific token_pricing block; fall back to legacy blended rate.
  let api_cost_usd;
  let api_pricing_source;
  const tp = config.token_pricing;
  if (tp && tp.input_price_per_million_tokens_usd != null) {
    const inputCost =
      (resources.tokens_in || 0) / 1_000_000 * tp.input_price_per_million_tokens_usd;
    const outputCost =
      (resources.tokens_out || 0) / 1_000_000 * (tp.output_price_per_million_tokens_usd || 0);
    const cachedCost = (tp.cached_input_price_per_million_tokens_usd != null)
      ? (resources.cached_tokens_in || 0) / 1_000_000 * tp.cached_input_price_per_million_tokens_usd
      : 0;
    api_cost_usd = inputCost + outputCost + cachedCost;
    api_pricing_source = `${tp.provider || 'unknown'}/${tp.model || 'unknown'} (last_verified: ${tp.last_verified || 'unknown'})`;
  } else {
    const tokensTotal = (resources.tokens_in || 0) + (resources.tokens_out || 0);
    api_cost_usd = (tokensTotal / 1000) * (config.api_cost_per_1k_tokens_usd || 0);
    api_pricing_source = 'legacy_blended_estimate';
  }

  // --- Compute cost ---
  const cpu_seconds = resources.cpu_seconds || 0;
  const gpu_seconds = resources.gpu_seconds || 0;
  const compute_cost_usd =
    (cpu_seconds / 3600) * (config.cpu_cost_per_hour_usd || 0) +
    (gpu_seconds / 3600) * (config.gpu_cost_per_hour_usd || 0);

  // --- Environmental estimates ---
  const duration_seconds = (resources.duration_ms || 0) / 1000;
  const avg_power_watts =
    (config.avg_cpu_power_watts || 0) +
    (config.avg_gpu_power_watts || 0);
  const energy_kwh = (avg_power_watts * duration_seconds) / MS_TO_KWH_DIVISOR;
  const water_liters = energy_kwh * (config.water_intensity_l_per_kwh || 0);

  // --- Storage cost ---
  const storage_gb = resources.storage_gb || 0;
  const storage_cost_usd = storage_gb * (config.storage_cost_per_gb_month_usd || 0);

  // --- Totals ---
  const total_usd = api_cost_usd + compute_cost_usd + storage_cost_usd;

  return {
    api_cost_usd: parseFloat(api_cost_usd.toFixed(6)),
    api_pricing_source,
    compute_cost_usd: parseFloat(compute_cost_usd.toFixed(6)),
    storage_cost_usd: parseFloat(storage_cost_usd.toFixed(6)),
    total_usd: parseFloat(total_usd.toFixed(6)),
    energy_kwh: parseFloat(energy_kwh.toFixed(6)),
    water_liters: parseFloat(water_liters.toFixed(6)),
    _disclaimer: 'Cost and environmental values are estimates. See docs/cost-model.md.'
  };
}

/**
 * Compute human-equivalent metrics
 * @param {Object} run - Run data
 * @param {Object} config - Cost configuration
 * @returns {Object} Human-equivalent metrics
 */
function computeHumanEquivalent(run, config) {
  const duration_hours = (run.duration_ms || 0) / 3600000;
  // Prefer clearer v2 field names; fall back to legacy names.
  const human_hourly_rate =
    config.human_equivalent_hourly_rate_usd || config.human_hourly_rate_usd || 60;
  const baseline_hours =
    config.baseline_hours_per_orchestration_run || config.baseline_hours_per_unit || 2;

  // Estimate human time (configurable multiplier)
  const estimated_hours_if_human = Math.max(baseline_hours, duration_hours * 10);

  // Calculate cost equivalent
  const estimated_cost_if_human = estimated_hours_if_human * human_hourly_rate;

  // Calculate professionals equivalent
  const professionals_count_equivalent =
    estimated_cost_if_human > 0
      ? (run.costs.total_usd / estimated_cost_if_human).toFixed(2)
      : 0;

  return {
    estimated_hours_if_human: parseFloat(estimated_hours_if_human.toFixed(2)),
    estimated_cost_if_human: parseFloat(estimated_cost_if_human.toFixed(2)),
    professionals_count_equivalent: parseFloat(professionals_count_equivalent),
    time_saved_hours: parseFloat((estimated_hours_if_human - duration_hours).toFixed(2))
  };
}

/**
 * Load run by ID
 * @param {string} runId - Run ID to load
 * @returns {Object|null} Run object or null if not found
 */
function loadRun(runId) {
  const dir = ensureRunsDir();
  const indexPath = path.join(dir, 'index.json');

  if (!fs.existsSync(indexPath)) {
    return null;
  }

  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const entry = index.find(r => r.id === runId);

  if (!entry || !entry.file) {
    return null;
  }

  const runPath = path.join(dir, entry.file);
  if (!fs.existsSync(runPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(runPath, 'utf8'));
}

/**
 * List all runs
 * @param {Object} options - Filter options
 * @returns {Array} Array of run summaries
 */
function listRuns(options = {}) {
  const dir = ensureRunsDir();
  const indexPath = path.join(dir, 'index.json');

  if (!fs.existsSync(indexPath)) {
    return [];
  }

  let runs = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

  // Apply filters
  if (options.status) {
    runs = runs.filter(r => r.status === options.status);
  }

  if (options.limit) {
    runs = runs.slice(0, options.limit);
  }

  return runs;
}

module.exports = {
  nowIso,
  uuidv4,
  saveRun,
  computeCosts,
  computeHumanEquivalent,
  loadRun,
  listRuns,
  ensureRunsDir
};
