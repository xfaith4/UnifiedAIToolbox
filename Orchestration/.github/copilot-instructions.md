# AI Orchestration Framework - Copilot Instructions

## Architecture Overview

This is a **multi-agent AI orchestration system** that coordinates 5 specialized AI agents (Researcher, Engineer, Critic, Synthesizer, Commissioner) to collaboratively solve complex problems through iterative refinement.

### Core Components

- **PowerShell Orchestrator** (`scripts/POF.ps1`): Runs agents in parallel (independent) then sequential (Commissioner)
- **React Dashboard** (`MilestoneDashboard/`): React + Vite frontend with Express API backend
- **Agent Configuration** (`prompts/Agents.json`): Defines agent roles and prompts
- **Run Management** (`scripts/MilestoneController.ps1`): Handles goal lifecycle, scoring, refinement, and logging

## Critical Workflows

### Running Orchestration
```powershell
# Main entry point - handles goal lifecycle
pwsh -File scripts/MilestoneController.ps1 -GoalFile "./Goals/CurrentGoal.txt" -Model "gpt-4o-mini"

# Core orchestrator - processes single goal
pwsh -File scripts/POF.ps1 -Goal "Create a Python calculator" -Model "gpt-4o-mini"
```

### Dashboard Development
```bash
cd MilestoneDashboard
npm install
npm start  # Runs both API server (5050) and Vite dev (5173)
```

### Agent Execution Flow
1. **Parallel Phase**: Researcher, Engineer, Critic, Synthesizer run simultaneously for speed
2. **Sequential Phase**: Commissioner evaluates collective output and assigns Value Score (0-10)
3. **Refinement**: If score < 7, `OpenAI_Refiner.ps1` improves goal and re-runs
4. **Persistence**: All outputs saved to `runs/[timestamp]/` folders

## Project-Specific Patterns

### File Structure Conventions
- `Goals/CurrentGoal.txt` - Active goal being processed
- `Goals/NextGoal.txt` - Refined goal after low scores
- `runs/[yyyyMMdd-HHmmss]/` - Individual run outputs with agent files
- `Milestone_Log.csv` + `.json` - Run history for dashboard consumption
- `MilestoneDashboard/public/data/synth/` - Web-accessible synthesis files

### Agent Configuration
All agents defined in `prompts/Agents.json`. Critical pattern:
- **Commissioner** must include "Value Score" in output for score detection
- **Synthesizer** should mark output with `[SYNTHESIZED]` for convergence detection
- Agent improvements tracked via `[AGENT_IMPROVEMENT: AgentName]` markup

### Parallel Execution Pattern (POF.ps1)
```powershell
# Independent agents run in parallel via ForEach-Object -Parallel
$Results = $WorkItems | ForEach-Object -Parallel {
    # Each agent makes its own OpenAI API call
    # Returns: Agent, Output, Tokens, Ok status
} -ThrottleLimit 4

# Commissioner runs sequentially after collecting all results
```

### Cost Tracking & Logging
- Token usage extracted from API responses
- Model-specific pricing in `MilestoneController.ps1`
- CSV export uses `Export-Excel` (ImportExcel module)
- JSON maintained for dashboard consumption

## Integration Points

### PowerShell ↔ Dashboard
- **API Server** (`server/api-server.js`) bridges PowerShell scripts and React frontend
- **Data Flow**: PS writes CSV/JSON → Dashboard reads via API endpoints
- **Live Status**: Agent status logged to `agent_status.json`, polled by dashboard

### External Dependencies
- **OpenAI API**: All agent processing via `gpt-4o-mini`/`gpt-4o`/`gpt-5` models
- **Git Integration**: Auto-commits successful runs with score in commit message
- **CORS Setup**: Dashboard allows localhost origins for dev server access

## Development Conventions

### Error Handling
- PowerShell scripts use `try/catch` with graceful degradation
- API failures logged to `runs/[timestamp]/API.txt`
- Dashboard shows toast notifications for user feedback

### State Management
- **No external state library** - uses React useState/useEffect
- **Real-time updates** via polling (20s for dashboard data, 3s for agent status)
- **Keyboard shortcuts** implemented via custom `useKeyboardShortcuts` hook

### Styling
- **Tailwind CSS** with dark/light mode support
- **Component library**: Lucide React for icons
- **Charts**: Recharts for performance trends

## Key File Entry Points

- `scripts/MilestoneController.ps1` - Main workflow orchestrator
- `scripts/POF.ps1` - Core multi-agent engine
- `MilestoneDashboard/src/App.jsx` - Dashboard root component
- `MilestoneDashboard/server/api-server.js` - Backend API
- `prompts/Agents.json` - Agent behavior definitions

## Common Debugging Patterns

### Check Latest Run
```powershell
$LastRun = Get-ChildItem runs/ -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Get-Content "$($LastRun.FullName)/Commissioner.txt"  # Check score
Get-Content "$($LastRun.FullName)/Final_Synthesis.txt"  # Check output
```

### API Troubleshooting
- Verify `$env:OPENAI_API_KEY` is set
- Check `runs/[timestamp]/API.txt` for OpenAI errors
- Monitor dashboard browser console for fetch errors

## Security Notes
- API keys managed via environment variables only
- No hardcoded credentials in any files
- CORS restricted to localhost origins
- Agent improvement suggestions require manual review before application
