/**
 * Configuration Loader Utility
 * 
 * Provides a robust way to load configuration files regardless of
 * where the script is executed from.
 */

const fs = require('fs');
const path = require('path');

/**
 * Find the repository root by looking for package.json or specific markers
 * @param {string} startPath - Starting directory path
 * @returns {string|null} Repository root path or null if not found
 */
function findRepoRoot(startPath = __dirname) {
  let currentPath = startPath;
  const root = path.parse(currentPath).root;
  
  while (currentPath !== root) {
    // Check for markers that indicate repo root
    const configPath = path.join(currentPath, 'config', 'costs.example.json');
    if (fs.existsSync(configPath)) {
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
 * Load cost configuration with fallback to defaults
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
    // Try environment variable first
    const configPathEnv = process.env.COST_CONFIG_PATH;
    if (configPathEnv && fs.existsSync(configPathEnv)) {
      return JSON.parse(fs.readFileSync(configPathEnv, 'utf8'));
    }
    
    // Find repo root and load config
    const repoRoot = findRepoRoot();
    if (repoRoot) {
      const configPath = path.join(repoRoot, 'config', 'costs.example.json');
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
    }
    
    // Fallback to defaults
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
