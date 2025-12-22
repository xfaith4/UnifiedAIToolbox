/**
 * Example Orchestration with Run Tracking
 * 
 * This demonstrates how to integrate run tracking into your orchestration code.
 */

const {
  nowIso,
  uuidv4,
  saveRun,
  computeCosts,
  computeHumanEquivalent
} = require('./run-tracker');
const { loadCostConfig } = require('./config-loader');

// Load cost config
const config = loadCostConfig();

/**
 * Simulate an orchestration task
 */
async function runOrchestration(taskName, taskDescription) {
  console.log(`\n=== Starting Orchestration: ${taskName} ===\n`);
  
  // Initialize run tracking
  const run = {
    id: uuidv4(),
    name: taskName,
    task_description: taskDescription,
    start_time: nowIso(),
    orchestrator_version: 'v1.5.0',
    agents: [],
    refinements: [],
    resources: {
      tokens_in: 0,
      tokens_out: 0,
      cpu_seconds: 0,
      gpu_seconds: 0,
      memory_peak_mb: 0,
      api_calls: 0,
      storage_gb: 0
    },
    tags: ['example', 'demonstration']
  };
  
  try {
    // Simulate Agent 1: Prompt Refiner
    console.log('Running Agent 1: Prompt Refiner...');
    const agent1StartTime = nowIso();
    
    // Simulate work (in real code, this would be actual agent execution)
    await sleep(500);
    
    // Simulate API call with token usage
    const agent1TokensIn = 500;
    const agent1TokensOut = 1500;
    run.resources.tokens_in += agent1TokensIn;
    run.resources.tokens_out += agent1TokensOut;
    run.resources.api_calls += 1;
    run.resources.cpu_seconds += 2.5;
    
    const agent1EndTime = nowIso();
    
    run.agents.push({
      agent_id: 'prompt-refiner-001',
      name: 'PromptRefiner',
      role: 'Prompt optimization and context enhancement',
      start_time: agent1StartTime,
      end_time: agent1EndTime,
      duration_ms: new Date(agent1EndTime) - new Date(agent1StartTime),
      steps: [
        {
          step_id: 'step-1',
          action: 'analyze_prompt',
          input_summary: 'Original user prompt',
          output_summary: 'Enhanced prompt with additional context',
          tokens_in: agent1TokensIn,
          tokens_out: agent1TokensOut,
          api_call_metadata: {
            model: 'gpt-4',
            temperature: 0.7,
            max_tokens: 2000
          }
        }
      ]
    });
    
    run.refinements.push({
      id: 'refinement-1',
      timestamp: agent1StartTime,
      prompt: 'Original: Extract key information from the document...',
      tokens_in: agent1TokensIn,
      tokens_out: agent1TokensOut,
      notes: 'Added domain-specific context and examples'
    });
    
    console.log('  ✓ Agent 1 complete');
    
    // Simulate Agent 2: Data Extractor
    console.log('Running Agent 2: Data Extractor...');
    const agent2StartTime = nowIso();
    
    await sleep(800);
    
    const agent2TokensIn = 3000;
    const agent2TokensOut = 1000;
    run.resources.tokens_in += agent2TokensIn;
    run.resources.tokens_out += agent2TokensOut;
    run.resources.api_calls += 2;
    run.resources.cpu_seconds += 4.2;
    run.resources.memory_peak_mb = 256;
    
    const agent2EndTime = nowIso();
    
    run.agents.push({
      agent_id: 'data-extractor-001',
      name: 'DataExtractor',
      role: 'Entity and relationship extraction',
      start_time: agent2StartTime,
      end_time: agent2EndTime,
      duration_ms: new Date(agent2EndTime) - new Date(agent2StartTime),
      steps: [
        {
          step_id: 'step-2a',
          action: 'extract_entities',
          input_summary: 'Document content (15 pages)',
          output_summary: 'Extracted 45 entities',
          tokens_in: 2000,
          tokens_out: 500,
          api_call_metadata: {
            model: 'gpt-4',
            temperature: 0.3
          }
        },
        {
          step_id: 'step-2b',
          action: 'extract_relationships',
          input_summary: 'Extracted entities',
          output_summary: 'Identified 23 relationships',
          tokens_in: 1000,
          tokens_out: 500,
          api_call_metadata: {
            model: 'gpt-4',
            temperature: 0.3
          }
        }
      ]
    });
    
    console.log('  ✓ Agent 2 complete');
    
    // Simulate Agent 3: Synthesizer
    console.log('Running Agent 3: Synthesizer...');
    const agent3StartTime = nowIso();
    
    await sleep(600);
    
    const agent3TokensIn = 2000;
    const agent3TokensOut = 3000;
    run.resources.tokens_in += agent3TokensIn;
    run.resources.tokens_out += agent3TokensOut;
    run.resources.api_calls += 1;
    run.resources.cpu_seconds += 3.1;
    
    const agent3EndTime = nowIso();
    
    run.agents.push({
      agent_id: 'synthesizer-001',
      name: 'Synthesizer',
      role: 'Result aggregation and summary generation',
      start_time: agent3StartTime,
      end_time: agent3EndTime,
      duration_ms: new Date(agent3EndTime) - new Date(agent3StartTime),
      steps: [
        {
          step_id: 'step-3',
          action: 'synthesize_results',
          input_summary: 'Extracted entities and relationships',
          output_summary: 'Comprehensive summary report',
          tokens_in: agent3TokensIn,
          tokens_out: agent3TokensOut,
          api_call_metadata: {
            model: 'gpt-4',
            temperature: 0.5
          }
        }
      ]
    });
    
    console.log('  ✓ Agent 3 complete');
    
    // Finalize run
    run.end_time = nowIso();
    run.duration_ms = new Date(run.end_time) - new Date(run.start_time);
    
    // Mark as successful
    run.summary = {
      success: true,
      outcome: `Successfully processed document: extracted ${run.agents[1].steps[0].output_summary} and ${run.agents[1].steps[1].output_summary}, generated comprehensive summary`,
      errors: []
    };
    
    // Add some simulated output artifacts
    run.artifacts = [
      `/runs/${run.id}/output/entities.json`,
      `/runs/${run.id}/output/relationships.json`,
      `/runs/${run.id}/output/summary.md`
    ];
    
    // Compute costs
    run.costs = computeCosts({
      ...run.resources,
      duration_ms: run.duration_ms
    }, config);
    
    // Compute human equivalent
    run.human_equivalent = computeHumanEquivalent(run, config);
    
    // Save run
    const filePath = saveRun(run);
    
    console.log('\n=== Orchestration Complete ===');
    console.log(`Run ID: ${run.id}`);
    console.log(`Duration: ${(run.duration_ms / 1000).toFixed(2)}s`);
    console.log(`Total Tokens: ${run.resources.tokens_in + run.resources.tokens_out}`);
    console.log(`API Calls: ${run.resources.api_calls}`);
    console.log(`Total Cost: $${run.costs.total_usd.toFixed(6)}`);
    console.log(`  - API: $${run.costs.api_cost_usd.toFixed(6)}`);
    console.log(`  - Compute: $${run.costs.compute_cost_usd.toFixed(6)}`);
    console.log(`Energy: ${run.costs.energy_kwh.toFixed(6)} kWh`);
    console.log(`Water: ${run.costs.water_liters.toFixed(6)} L`);
    console.log(`\nHuman Equivalent:`);
    console.log(`  Time: ${run.human_equivalent.estimated_hours_if_human.toFixed(1)} hours`);
    console.log(`  Cost: $${run.human_equivalent.estimated_cost_if_human.toFixed(2)}`);
    console.log(`  Time Saved: ${run.human_equivalent.time_saved_hours.toFixed(1)} hours`);
    console.log(`\nSaved to: ${filePath}`);
    console.log(`View in dashboard: http://localhost:5173/runs/${run.id}\n`);
    
    return run;
    
  } catch (error) {
    // Handle failures
    run.end_time = nowIso();
    run.duration_ms = new Date(run.end_time) - new Date(run.start_time);
    
    run.summary = {
      success: false,
      outcome: `Orchestration failed: ${error.message}`,
      errors: [error.message, error.stack]
    };
    
    // Still compute costs for partial work
    run.costs = computeCosts({
      ...run.resources,
      duration_ms: run.duration_ms
    }, config);
    
    run.human_equivalent = computeHumanEquivalent(run, config);
    
    // Save failed run
    const filePath = saveRun(run);
    
    console.error('\n=== Orchestration Failed ===');
    console.error(`Error: ${error.message}`);
    console.error(`Partial results saved to: ${filePath}\n`);
    
    throw error;
  }
}

// Helper to simulate async work
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run example if executed directly
if (require.main === module) {
  runOrchestration(
    'Document Analysis & Knowledge Extraction',
    'Extract structured information from a complex document, identify entities and relationships, and generate a comprehensive summary report.'
  )
    .then(() => {
      console.log('✓ Example completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('✗ Example failed:', error);
      process.exit(1);
    });
}

module.exports = { runOrchestration };
