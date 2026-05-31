/**
 * Configuration Loader Utility
 *
 * Provides a robust way to load configuration files regardless of
 * where the script is executed from.
 */

const fs = require('fs');
const path = require('path');

/**
 * Find the repository root by looking for config/ directory or .git
 * @param {string} startPath - Starting directory path
 * @returns {string|null} Repository root path or null if not found
 */
function findRepoRoot(startPath = __dirname) {
  let currentPath = startPath;
  const root = path.parse(currentPath).root;

  while (currentPath !== root) {
    // Prefer user-local costs.json; also accept costs.example.json as a marker
    const userConfig = path.join(currentPath, 'config', 'costs.json');
    const exampleConfig = path.join(currentPath, 'config', 'costs.example.json');
    if (fs.existsSync(userConfig) || fs.existsSync(exampleConfig)) {
      return currentPath;
    }

    // Also check for .git directory
    const gitPath = path.join(currentPath, '.git');
    if (fs.existsSync(gitPath)) {
      return currentPath;
    }

    currentPath = path.dirname(currentPath);
  }

  return null;
}

/**
 * Load cost configuration with fallback to defaults.
 *
 * Resolution order:
 *   1. COST_CONFIG_PATH environment variable (absolute path to any JSON file)
 *   2. config/costs.json  — user-local overrides, gitignored
 *   3. config/costs.example.json — committed defaults / reference values
 *   4. Built-in hardcoded defaults
 *
 * @returns {Object} Cost configuration object
 */
function loadCostConfig() {
  const defaults = {
    api_cost_per_1k_tokens_usd: 0.02,
    cpu_cost_per_hour_usd: 0.10,
    gpu_cost_per_hour_usd: 1.50,
    avg_cpu_power_watts: 50,
    avg_gpu_power_watts: 200,
    water_intensity_l_per_kwh: 0.5,
    human_hourly_rate_usd: 60,
    baseline_hours_per_unit: 2,
    storage_cost_per_gb_month_usd: 0.023
  };

  try {
    // 1. Environment variable override
    const configPathEnv = process.env.COST_CONFIG_PATH;
    if (configPathEnv && fs.existsSync(configPathEnv)) {
      return JSON.parse(fs.readFileSync(configPathEnv, 'utf8'));
    }

    const repoRoot = findRepoRoot();
    if (repoRoot) {
      // 2. User-local costs.json (gitignored; safe to put real pricing here)
      const userConfigPath = path.join(repoRoot, 'config', 'costs.json');
      if (fs.existsSync(userConfigPath)) {
        return JSON.parse(fs.readFileSync(userConfigPath, 'utf8'));
      }

      // 3. Committed example / reference values
      const exampleConfigPath = path.join(repoRoot, 'config', 'costs.example.json');
      if (fs.existsSync(exampleConfigPath)) {
        return JSON.parse(fs.readFileSync(exampleConfigPath, 'utf8'));
      }
    }

    // 4. Hardcoded defaults
    console.warn('Cost config not found, using defaults');
    return defaults;
  } catch (err) {
    console.warn('Failed to load cost config, using defaults:', err.message);
    return defaults;
  }
}

module.exports = {
  findRepoRoot,
  loadCostConfig
};
