# AI Orchestration Quick Reference

A quick guide to get started with AI Orchestration.

## Quick Start (30 seconds)

```bash
# 1. Set your API key
export OPENAI_API_KEY="sk-your-key-here"

# 2. Create a goal
echo "Create a Python script to rename files in bulk" > Goals/MyGoal.txt

# 3. Run orchestration
pwsh -File scripts/MilestoneController.ps1 -GoalFile "./Goals/MyGoal.txt" -Model "gpt-4o-mini"

# 4. View result
cat runs/$(ls -t runs | head -1)/Final_Synthesis.txt
```

## Dashboard Quick Start

```powershell
pwsh -File scripts/Reset-MilestoneDashboard.ps1 -LaunchDashboard
# Visit http://localhost:5050
```

_Fallback manual commands:_

```bash
cd MilestoneDashboard
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm run dev
```

## Common Commands

### Run with Different Models

```powershell
# Use fastest/cheapest model
pwsh -File scripts/MilestoneController.ps1 -Model "gpt-4o-mini"

# Use most capable model
pwsh -File scripts/MilestoneController.ps1 -Model "gpt-5"

# Balance of speed and quality
pwsh -File scripts/MilestoneController.ps1 -Model "gpt-4o"
```

### Customize Iterations

```powershell
# Quick iterations (faster)
pwsh -File scripts/MilestoneController.ps1 -MaxIterations 2

# Deep thinking (more thorough)
pwsh -File scripts/MilestoneController.ps1 -MaxIterations 5
```

### Set Quality Threshold

```powershell
# Accept lower quality (faster completion)
pwsh -File scripts/MilestoneController.ps1 -PassThreshold 6

# Demand higher quality (may trigger refinement)
pwsh -File scripts/MilestoneController.ps1 -PassThreshold 9
```

## Agent Roles at a Glance

| Agent | Role | Output |
|-------|------|--------|
| 🔬 Researcher | Explores approaches | 3 different solutions with pros/cons |
| ⚙️ Engineer | Builds solutions | Working code/pseudocode |
| 🛡️ Critic | Quality assurance | Identifies flaws and improvements |
| 🔗 Synthesizer | Integration | Combines best aspects into final solution |
| ⭐ Commissioner | Final evaluation | Value Score (0-10) + recommendations |

## Model Comparison

| Model | Speed | Quality | Cost/Run | Best For |
|-------|-------|---------|----------|----------|
| gpt-4o-mini | ⚡⚡⚡ | ⭐⭐⭐ | $0.003 | Quick tasks, prototyping |
| gpt-4o | ⚡⚡ | ⭐⭐⭐⭐ | $0.015 | Balanced work |
| gpt-5 | ⚡ | ⭐⭐⭐⭐⭐ | $0.10 | Complex problems |

## File Locations

```text
Goals/CurrentGoal.txt          # Your current goal
runs/[timestamp]/              # Latest run outputs
  ├── Final_Synthesis.txt      # Complete solution
  ├── Commissioner.txt         # Evaluation & score
  ├── Researcher.txt           # Research phase
  ├── Engineer.txt             # Engineering phase
  ├── Critic.txt               # Critique phase
  └── Synthesizer.txt          # Synthesis phase
Milestone_Log.csv              # Run history
```

## Typical Workflow

```text
1. Write Goal → 2. Run Controller → 3. Agents Process → 4. Commissioner Evaluates
                                                              ↓
                                                         Score < 7?
                                                              ↓
                                                    Yes → Refine & Retry
                                                    No → Accept & Save
```

## Dashboard Features

- **Goal Editor**: Edit goals directly in UI
- **Run Button**: Execute orchestration with one click
- **Status Monitor**: See real-time progress
- **History Table**: Browse all previous runs
- **Cost Tracking**: Monitor API spending
- **Agent Outputs**: View individual agent contributions

## Example Goals

### Simple

```text
Create a bash script to backup a directory
```

### Moderate

```text
Build a Python web scraper that:
- Extracts article titles from Hacker News
- Saves to CSV with timestamps
- Handles rate limiting
```

### Complex

```text
Design a microservice architecture for:
- User authentication (OAuth2)
- Real-time chat (WebSockets)
- File storage (S3-compatible)
- Include Docker compose setup
```

## Troubleshooting

### "OPENAI_API_KEY not set"

```bash
export OPENAI_API_KEY="sk-your-key-here"
# Or add to ~/.bashrc or ~/.zshrc for persistence
```

### Dashboard won't start

```powershell
pwsh -File scripts/Reset-MilestoneDashboard.ps1 -LaunchDashboard
```

If you need the raw commands, run the "Fallback manual commands" listed in the [Dashboard Quick Start](#dashboard-quick-start) section.

### No output generated

- Check API key is valid
- Verify internet connection
- Review `runs/[timestamp]/API.txt` for errors

### Low Value Scores

- Make goal more specific
- Add success criteria to goal
- Include examples of desired output
- Increase MaxIterations

### Keep the workspace tidy

```powershell
pwsh -File scripts/Clean-Workspace.ps1 -RunRetentionDays 10 -PurgeBuildArtifacts
```

Use `-DryRun` to preview what would be deleted, then add `-PurgeNodeModules` if you want a completely fresh dependency install.

## Tips & Tricks

### 1. Write Better Goals

```text
❌ Bad: "Make a calculator"
✅ Good: "Create a Python CLI calculator that:
- Supports +, -, *, /, ** operations
- Handles invalid input gracefully
- Shows calculation history
- Includes unit tests"
```

### 2. Use Verbose Mode (in POF.ps1)

```powershell
# Edit POF.ps1 and add -VerboseMode switch
pwsh -File scripts/POF.ps1 -Goal "..." -VerboseMode
```

### 3. Review Individual Agents

```bash
# See what Researcher proposed
cat runs/[latest]/Researcher.txt

# Check Critic's feedback
cat runs/[latest]/Critic.txt
```

### 4. Chain Goals

Create `Goals/Phase1.txt`, `Goals/Phase2.txt`, etc., and run sequentially:

```powershell
pwsh -File scripts/MilestoneController.ps1 -GoalFile "./Goals/Phase1.txt"
pwsh -File scripts/MilestoneController.ps1 -GoalFile "./Goals/Phase2.txt"
```

### 5. Export History

```bash
# View as CSV
cat Milestone_Log.csv

# Open in Excel (if on Windows with ImportExcel module)
Invoke-Item Milestone_Log.xlsx
```

## Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `OPENAI_API_KEY` | OpenAI authentication | `sk-proj-...` |
| `OpenAI_Refiner_Dir` | Custom export path (optional) | `/path/to/exports` |

## Next Steps

1. ✅ Read the [Main README](README.md) for complete documentation
2. ✅ Try the [Example](EXAMPLE.md) to see it in action
3. ✅ Customize `prompts/Agents.json` for your use case
4. ✅ Build your first goal and run it!
5. ✅ Explore the dashboard to track your progress

---

**Need Help?** Open an issue on GitHub or check the full README.md
