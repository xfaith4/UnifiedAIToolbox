/**
 * Test script for run-tracker module
 */

const {
  nowIso,
  uuidv4,
  saveRun,
  computeCosts,
  computeHumanEquivalent,
  loadRun,
  listRuns
} = require('./run-tracker');
const { loadCostConfig } = require('./config-loader');

// Load cost config
const config = loadCostConfig();

console.log('Testing Run Tracker Module...\n');

// Create a sample run
const runId = uuidv4();
const startTime = nowIso();

// Simulate some work
setTimeout(() => {
  const endTime = nowIso();
  
  const run = {
    id: runId,
    name: 'Sample Orchestration: Family Tree Analysis',
    task_description: 'Extract family relationships from GEDCOM file and enrich with web sources',
    start_time: startTime,
    end_time: endTime,
    duration_ms: new Date(endTime) - new Date(startTime),
    orchestrator_version: 'v1.5.0',
    agents: [
      {
        agent_id: 'refiner-001',
        name: 'PromptRefiner',
        role: 'Prompt optimization',
        start_time: startTime,
        end_time: endTime,
        duration_ms: 120000,
        steps: [
          {
            step_id: 's1',
            action: 'refine_prompt',
            input_summary: 'Initial prompt v1',
            output_summary: 'Refined prompt with context',
            tokens_in: 200,
            tokens_out: 800,
            api_call_metadata: {
              model: 'gpt-4',
              temperature: 0.7
            }
          }
        ]
      },
      {
        agent_id: 'extractor-001',
        name: 'DataExtractor',
        role: 'Information extraction',
        start_time: startTime,
        end_time: endTime,
        duration_ms: 300000,
        steps: [
          {
            step_id: 's2',
            action: 'extract_entities',
            input_summary: 'GEDCOM content',
            output_summary: 'Extracted 45 individuals, 23 families',
            tokens_in: 5000,
            tokens_out: 2000,
            api_call_metadata: {
              model: 'gpt-4',
              temperature: 0.3
            }
          }
        ]
      }
    ],
    refinements: [
      {
        id: 'r1',
        timestamp: startTime,
        prompt: 'Initial prompt: Extract family relationships from the following GEDCOM data...',
        tokens_in: 200,
        tokens_out: 800,
        notes: 'Added more context about relationship types'
      }
    ],
    resources: {
      tokens_in: 5200,
      tokens_out: 2800,
      cpu_seconds: 420,
      gpu_seconds: 0,
      memory_peak_mb: 512,
      api_calls: 2,
      storage_gb: 0.05
    },
    summary: {
      success: true,
      outcome: 'Successfully extracted 45 individuals and 23 families, enriched with 12 web sources',
      errors: []
    },
    tags: ['genealogy', 'extraction', 'enrichment'],
    artifacts: [
      '/runs/' + runId + '/output/family-tree.json',
      '/runs/' + runId + '/output/enriched-data.json'
    ]
  };
  
  // Compute costs
  run.costs = computeCosts({
    ...run.resources,
    duration_ms: run.duration_ms
  }, config);
  
  // Compute human equivalent
  run.human_equivalent = computeHumanEquivalent(run, config);
  
  console.log('Created sample run:');
  console.log('  ID:', run.id);
  console.log('  Name:', run.name);
  console.log('  Duration:', run.duration_ms, 'ms');
  console.log('  Tokens In:', run.resources.tokens_in);
  console.log('  Tokens Out:', run.resources.tokens_out);
  console.log('\nCosts:');
  console.log('  API Cost:', '$' + run.costs.api_cost_usd);
  console.log('  Compute Cost:', '$' + run.costs.compute_cost_usd);
  console.log('  Storage Cost:', '$' + run.costs.storage_cost_usd);
  console.log('  Total Cost:', '$' + run.costs.total_usd);
  console.log('  Energy:', run.costs.energy_kwh, 'kWh');
  console.log('  Water:', run.costs.water_liters, 'L');
  console.log('\nHuman Equivalent:');
  console.log('  Estimated Hours (Human):', run.human_equivalent.estimated_hours_if_human);
  console.log('  Estimated Cost (Human):', '$' + run.human_equivalent.estimated_cost_if_human);
  console.log('  Time Saved:', run.human_equivalent.time_saved_hours, 'hours');
  
  // Save run
  console.log('\nSaving run...');
  const filePath = saveRun(run);
  console.log('Saved to:', filePath);
  
  // List runs
  console.log('\nListing all runs:');
  const runs = listRuns();
  console.log('Found', runs.length, 'runs');
  runs.slice(0, 3).forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.name} (${r.status}) - $${r.total_cost_usd}`);
  });
  
  // Load run
  console.log('\nLoading run by ID:', runId);
  const loadedRun = loadRun(runId);
  if (loadedRun) {
    console.log('Successfully loaded:', loadedRun.name);
  } else {
    console.log('Failed to load run');
  }
  
  console.log('\n✓ All tests passed!');
}, 100);
