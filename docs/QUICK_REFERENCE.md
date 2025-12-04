# Quick Reference Card - Unified AI Toolbox

**One-page cheat sheet for launching and testing components**

---

## 🚀 Launch Everything

```bash
# Linux/Mac/WSL (recommended)
./launch.sh

# Windows PowerShell
./Launch.ps1

# Docker
docker compose up -d
```

**URLs After Launch:**
- 🌐 Dashboard: http://localhost:5173
- 🌐 Portal: http://localhost:3000
- 🔌 API: http://localhost:8000
- 📚 API Docs: http://localhost:8000/docs

---

## 🧪 Run Tests

```powershell
# Quick structural check
./Smoketest-Matrix.ps1 -Quick

# Full smoke test
./Smoketest-Matrix.ps1

# After starting services
python scripts/verify-launch.py
```

---

## 🎯 Launch Individual Components

### Web Dashboard
```powershell
./Start-WebUI.ps1
# → http://localhost:5173
```

### Backend API
```bash
cd Orchestration/UnifiedPromptApp/services/prompt-api
uvicorn app:app --reload --host 0.0.0.0 --port 8000
# → http://localhost:8000
```

### Desktop App
```powershell
cd apps/OrchestrationDesktop
dotnet run
```

### Prompt Refiner
```powershell
cd apps/PromptRefiner
pwsh -File OpenAI_Refiner.ps1              # CLI
pwsh -sta -File OpenAI_Refiner.Wpf.ps1     # GUI
```

### Interactive Prompts
```powershell
./Run-Prompt.ps1
```

---

## 📦 First-Time Setup

```bash
# 1. Install dependencies - Dashboard
cd apps/dashboard && npm install && cd ../..

# 2. Install dependencies - Portal
cd apps/unifiedtoolbox.webapp && npm install && cd ../..

# 3. Setup Python venv
cd Orchestration/UnifiedPromptApp/services/prompt-api
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cd ../../../../..

# 4. Set API key
export OPENAI_API_KEY="your-key-here"  # or $env:OPENAI_API_KEY in PowerShell

# 5. Run smoke test
./Smoketest-Matrix.ps1
```

---

## 🔧 Prerequisites

| Tool | Min Version | Check Command |
|------|-------------|---------------|
| Node.js | 18+ | `node --version` |
| Python | 3.12+ | `python --version` |
| PowerShell | 7.4+ | `pwsh --version` |
| .NET SDK | 8.0+ | `dotnet --version` |

---

## 🌍 Environment Variables

```bash
# Required
export OPENAI_API_KEY="sk-..."

# Optional (defaults shown)
export API_PORT=8000
export FRONTEND_PORT=5173
export WEB_PORT=3000
```

---

## 📁 Component Locations

| Component | Path | Entry Point |
|-----------|------|-------------|
| Dashboard | `apps/dashboard` | `npm run dev` |
| Portal | `apps/unifiedtoolbox.webapp` | `npm run dev` |
| API | `Orchestration/.../prompt-api` | `app.py` |
| Desktop | `apps/OrchestrationDesktop` | `dotnet run` |
| Refiner | `apps/PromptRefiner` | `*.ps1` |
| Bridge | `apps/orchestration-bridge` | `bridge.py` |
| Orchestrator | `Orchestration` | `MilestoneController.ps1` |

---

## 🆘 Troubleshooting

### Port in Use
```powershell
# Use Force flag
./Start-WebUI.ps1 -Force

# Or kill manually
netstat -ano | findstr :5173
taskkill /PID <pid> /F
```

### Dependencies Not Installed
```bash
# Node.js apps
cd apps/dashboard && npm install

# Python services
cd Orchestration/.../prompt-api
pip install -r requirements.txt
```

### Service Won't Start
```bash
# Check prerequisites
./Smoketest-Matrix.ps1 -Quick

# View logs
# Check console output or log files in respective directories
```

---

## 📖 Full Documentation

- **Complete Wiring Guide**: `docs/WiringMatrix.md`
- **Discovery Details**: `docs/PHASE1_DISCOVERY_SUMMARY.md`
- **Implementation Summary**: `docs/PHASE5_FINAL_SUMMARY.md`
- **Main README**: `README.md`

---

## 🎬 Typical Workflow

1. **Start**: `./launch.sh` or `./Launch.ps1`
2. **Verify**: Check http://localhost:5173 and http://localhost:8000/health
3. **Work**: Make your changes
4. **Test**: `./Smoketest-Matrix.ps1`
5. **Stop**: Ctrl+C in launch terminal

---

**Quick Help**: `./launch.sh --help` or `Get-Help ./Launch.ps1 -Full`
