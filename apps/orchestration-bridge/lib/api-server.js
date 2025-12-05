/**
 * Orchestration Run Tracking API Server
 * 
 * Provides REST API endpoints for managing orchestration runs:
 * - POST /api/runs - Create a new run
 * - GET /api/runs - List all runs
 * - GET /api/runs/:id - Get run details
 */

const express = require('express');
const cors = require('cors');
const {
  saveRun,
  computeCosts,
  computeHumanEquivalent,
  loadRun,
  listRuns,
  ensureRunsDir
} = require('./run-tracker');
const { loadCostConfig } = require('./config-loader');

// Load cost configuration
const costConfig = loadCostConfig();

function createRunsAPI(app) {
  // Enable CORS for dashboard
  app.use(cors());
  
  // Parse JSON bodies
  app.use(express.json());
  
  /**
   * POST /api/runs - Create or update a run
   */
  app.post('/api/runs', (req, res) => {
    try {
      const run = req.body;
      
      // Validate required fields
      if (!run.id || !run.name) {
        return res.status(400).json({
          error: 'Missing required fields: id and name are required'
        });
      }
      
      // Compute costs if resources provided
      if (run.resources) {
        run.costs = computeCosts({
          ...run.resources,
          duration_ms: run.duration_ms
        }, costConfig);
        
        // Compute human equivalent
        run.human_equivalent = computeHumanEquivalent(run, costConfig);
      }
      
      // Save run
      const filePath = saveRun(run);
      
      res.json({
        success: true,
        id: run.id,
        file: path.basename(filePath),
        run: run
      });
    } catch (err) {
      console.error('Error saving run:', err);
      res.status(500).json({
        error: 'Failed to save run',
        message: err.message
      });
    }
  });
  
  /**
   * GET /api/runs - List all runs
   */
  app.get('/api/runs', (req, res) => {
    try {
      const options = {
        status: req.query.status,
        limit: req.query.limit ? parseInt(req.query.limit) : undefined
      };
      
      const runs = listRuns(options);
      
      res.json({
        success: true,
        count: runs.length,
        runs: runs
      });
    } catch (err) {
      console.error('Error listing runs:', err);
      res.status(500).json({
        error: 'Failed to list runs',
        message: err.message
      });
    }
  });
  
  /**
   * GET /api/runs/:id - Get run details
   */
  app.get('/api/runs/:id', (req, res) => {
    try {
      const runId = req.params.id;
      const run = loadRun(runId);
      
      if (!run) {
        return res.status(404).json({
          error: 'Run not found',
          id: runId
        });
      }
      
      res.json({
        success: true,
        run: run
      });
    } catch (err) {
      console.error('Error loading run:', err);
      res.status(500).json({
        error: 'Failed to load run',
        message: err.message
      });
    }
  });
  
  /**
   * GET /api/runs/:id/download - Download run as JSON
   */
  app.get('/api/runs/:id/download', (req, res) => {
    try {
      const runId = req.params.id;
      const run = loadRun(runId);
      
      if (!run) {
        return res.status(404).json({
          error: 'Run not found',
          id: runId
        });
      }
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="run-${runId}.json"`);
      res.send(JSON.stringify(run, null, 2));
    } catch (err) {
      console.error('Error downloading run:', err);
      res.status(500).json({
        error: 'Failed to download run',
        message: err.message
      });
    }
  });
  
  /**
   * GET /api/config/costs - Get cost configuration
   */
  app.get('/api/config/costs', (req, res) => {
    res.json({
      success: true,
      config: costConfig
    });
  });
  
  return app;
}

// If running as standalone server
if (require.main === module) {
  const app = express();
  const PORT = process.env.RUNS_API_PORT || 8001;
  
  createRunsAPI(app);
  
  app.listen(PORT, () => {
    console.log(`Orchestration Runs API listening on port ${PORT}`);
    console.log(`Endpoints:`);
    console.log(`  POST   /api/runs         - Create/update run`);
    console.log(`  GET    /api/runs         - List runs`);
    console.log(`  GET    /api/runs/:id     - Get run details`);
    console.log(`  GET    /api/runs/:id/download - Download run JSON`);
    console.log(`  GET    /api/config/costs - Get cost config`);
  });
}

module.exports = { createRunsAPI };
