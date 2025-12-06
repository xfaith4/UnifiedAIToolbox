# Orchestration Module

The Orchestration module provides intelligent multi-agent coordination for complex AI tasks within the Unified AI Toolbox.

## Overview

This module enables:
- **Goal-driven orchestration**: Break down high-level objectives into actionable milestones
- **Multi-agent collaboration**: Coordinate specialized AI agents working together
- **Codex Swarm execution**: Parallel agent execution for large-scale tasks
- **Integration with prompt-api**: RESTful API endpoints for orchestration management

## Directory Structure

```
Orchestration/
├── README.md                        # This file
├── engine/                          # Core orchestration engine
│   ├── Run-Orchestration.ps1        # Main DAG-based orchestrator
│   ├── runner.config.json           # Runner configuration
│   ├── plan.example.json            # Example orchestration plan
│   ├── dashboard-ui/                # React/Vite dashboard UI
│   ├── codex-multiagent-swarm/      # Multi-agent swarm orchestrator
│   └── GeminiAIOrchestrator/        # Gemini AI integration
├── milestone-dashboard/             # Milestone tracking dashboard
├── scripts/                         # Orchestration scripts
│   ├── MilestoneController.ps1      # Main orchestration controller
│   ├── POF.ps1                      # Plan-Observe-Fix orchestrator
│   └── ...                          # Other orchestration utilities
├── prompts/                         # Orchestration prompt templates
├── modules/                         # PowerShell modules
├── Goals/                           # Goal definitions and tracking
└── .github/                         # CI/CD workflows
    └── workflows/
        ├── run-orchestration.yml    # Main orchestration workflow
        ├── build-dashboard.yml      # Dashboard build workflow
        └── deploy-dashboard.yml     # Dashboard deployment workflow
```

## Folder Descriptions

### `engine/`
The core orchestration engine containing the deterministic agentic runner and dashboard UI. 
- **Run-Orchestration.ps1**: DAG-based plan executor with parallel wave execution
- **dashboard-ui/**: React/Vite app for visualizing orchestration progress
- **codex-multiagent-swarm/**: Multi-agent swarm orchestration system

### `milestone-dashboard/`
Standalone dashboard for tracking milestone progress and metrics.

### `scripts/`
PowerShell scripts for various orchestration tasks, including goal-driven orchestration and metrics tracking.

### `prompts/`
Prompt templates used by orchestration agents.

### `modules/`
Reusable PowerShell modules for orchestration functionality.

## Scripts

### MilestoneController.ps1

The main orchestration script that:
1. Reads a goal from a text file
2. Breaks the goal into milestones
3. Assigns specialized agents to each milestone
4. Coordinates execution and tracks progress
5. Generates completion reports

**Usage:**
```powershell
.\scripts\MilestoneController.ps1 -GoalFile .\goal.txt -Model gpt-4o-mini
```

**Parameters:**
- `-GoalFile`: Path to a text file containing the goal
- `-Model`: AI model to use (default: gpt-4o-mini)
- `-OutputDir`: Directory for outputs (default: current directory)
- `-DryRun`: Skip actual execution for testing

### Run-Orchestration.ps1

The deterministic DAG-based orchestrator that:
1. Loads a plan JSON (Supervisor-format)
2. Validates step integrity (IDs, dependencies, inputs)
3. Optionally recomputes waves from dependencies
4. Executes steps wave-by-wave in parallel
5. Writes artifacts/envelopes per step

**Usage:**
```powershell
.\engine\Run-Orchestration.ps1 -PlanPath .\plan.json -ConfigPath .\runner.config.json
```

**Parameters:**
- `-PlanPath`: Path to plan JSON file (required)
- `-ConfigPath`: Path to runner configuration (default: .\runner.config.json)
- `-RecomputeWaves`: Recompute execution waves from dependencies

### Orchestrate-Codex.ps1

The multi-agent swarm orchestrator that:
1. Analyzes a repository structure
2. Selects appropriate agents for the task
3. Executes agents in parallel
4. Synthesizes results from all agents
5. Generates comprehensive reports

**Usage:**
```powershell
.\engine\codex-multiagent-swarm\Orchestrate-Codex.ps1 -RepoRoot . -MaxAgents 4
```

**Parameters:**
- `-RepoRoot`: Repository root directory
- `-Model`: AI model to use (default: gpt-4o-mini)
- `-MaxAgents`: Maximum concurrent agents (default: 4)
- `-OutputDir`: Directory for outputs (default: ./swarm-output)
- `-DryRun`: Skip actual execution for testing

## Agent Types

The orchestration module uses five specialized agent types:

| Agent | Role | Description |
|-------|------|-------------|
| Researcher | Information gathering | Analyzes context and gathers relevant data |
| Engineer | Implementation | Writes code and builds solutions |
| Critic | Quality assurance | Reviews work and identifies issues |
| Synthesizer | Integration | Combines outputs into coherent results |
| Commissioner | Decision making | Evaluates results and makes final calls |

## API Integration

The orchestration module integrates with the prompt-api service through:

- `POST /orchestrate/run` - Start a new orchestration run
- `GET /orchestrate/runs` - List all orchestration runs
- `GET /orchestrate/run/{id}` - Get run details
- `GET /orchestrate/run/{id}/log` - Get run logs

See the [prompt-api documentation](../apps/UnifiedPromptApp/services/prompt-api/README.md) for more details.

## Web UI Integration

The orchestration module is accessible through:

1. **Dashboard App** (`apps/dashboard`) - Full-featured multi-agent interface
2. **Milestone Dashboard** (`Orchestration/milestone-dashboard`) - Milestone tracking and metrics
3. **Engine Dashboard UI** (`Orchestration/engine/dashboard-ui`) - Core orchestration visualization
4. **Unified Toolbox Webapp** (`apps/unifiedtoolbox.webapp`) - Integrated orchestrator page

## Configuration

Environment variables:
- `ORCHESTRATOR_PS1`: Path to MilestoneController.ps1 (auto-detected)
- `CODEX_SWARM_PS1`: Path to Orchestrate-Codex.ps1 (auto-detected)
- `OPENAI_API_KEY`: Required for AI model access
- `OPENAI_MODEL`: Default model (gpt-4o-mini)

## Getting Started

1. Ensure PowerShell 7+ is installed
2. Set your OpenAI API key: `$env:OPENAI_API_KEY = "your-key"`
3. Create a goal file with your objective
4. Run the orchestrator:

```powershell
cd Orchestration
.\scripts\MilestoneController.ps1 -GoalFile .\my-goal.txt
```

Or run the DAG-based orchestrator with a plan:

```powershell
cd Orchestration
.\engine\Run-Orchestration.ps1 -PlanPath .\engine\plan.example.json
```

## Contributing

See the main [CONTRIBUTING.md](../../CONTRIBUTING.md) for contribution guidelines.

## License

Part of the Unified AI Toolbox project.
