# 🚀 Unified AI Toolbox - Launch Guide

## Quick Start

The Unified AI Toolbox provides multiple ways to launch the web application and backend services. Choose the method that works best for your platform and workflow.

### One-Click Launch Portal

Open `launch-portal.html` in your web browser for a visual interface to:
- Check service status
- View launch commands
- Access running services
- See prerequisites

### Launch Methods

#### 1. Universal Bash (Linux/Mac/WSL/Git Bash on Windows)
```bash
./launch.sh
```

**Options:**
```bash
# Launch with Docker
./launch.sh --docker

# Launch with custom ports
./launch.sh --api-port 8100 --frontend-port 5180

# Launch frontend only
./launch.sh --frontend-only

# Launch backend only
./launch.sh --backend-only

# Skip dependency installation
./launch.sh --skip-install

# View all options
./launch.sh --help
```

#### 2. Docker Compose - All Platforms
```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Stop all services
docker compose down
```

**Configure with environment variables:**
```bash
# Create .env file from template
cp .env.example .env

# Edit .env with your settings
# Then launch
docker compose up -d
```

#### 3. Quick Launch (API + Dashboard)
```bash
./launch.sh          # from repo root; installs deps, starts API + dashboard
./launch.sh --help   # view options (ports, skip install, no-open)
```

## Services Overview

### Backend Services

#### Prompt API (FastAPI)
- **Port:** 8000 (default)
- **Technology:** Python 3.12+, FastAPI, Uvicorn
- **Purpose:** REST API for prompt management, rendering, and orchestration
- **Health Check:** http://localhost:8000/health
- **API Docs:** http://localhost:8000/docs

**Manual Start:**
```bash
cd services/prompt-api
python3 -m venv .venv-linux
source .venv-linux/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

### Frontend Services

#### Dashboard (React + Vite)
- **Port:** 5173 (default)
- **Technology:** React 18, Vite, TypeScript
- **Purpose:** Primary UI for prompt library and orchestration
- **URL:** http://localhost:5173

**Manual Start:**
```bash
cd apps/dashboard
npm install
npm run dev
```

#### Unified Web Portal (Next.js)
- **Port:** 3000 (default)
- **Technology:** Next.js 16, React 19
- **Purpose:** Primary unified web interface
- **URL:** http://localhost:3000

**Manual Start:**
```bash
cd apps/unifiedtoolbox.webapp
npm install
npm run dev
```

> The Next.js portal reads `NEXT_PUBLIC_API_BASE` (defaults to `http://localhost:8000`) so it can reach the prompt API for real orchestrations. When you launch the stack via `./launch.sh` (and omit `--frontend-only`), the script automatically sets that variable to whichever port the prompt API claimed so the orchestrator hits the backend without extra configuration.

## Prerequisites Checklist

### Required Software

- [x] **Node.js 18+** ([Download](https://nodejs.org/))
  ```bash
  node --version  # Should be v18 or higher
  npm --version
  ```

- [x] **Python 3.12+** ([Download](https://www.python.org/downloads/))
  ```bash
  python3 --version  # Should be 3.12 or higher
  pip3 --version
  ```

### Optional Software

- [ ] **PowerShell 7.4+** (For Windows script) ([Download](https://github.com/PowerShell/PowerShell/releases))
  ```bash
  pwsh --version
  ```

- [ ] **Docker & Docker Compose** (For containerized deployment) ([Download](https://www.docker.com/get-started))
  ```bash
  docker --version
  docker compose version
  ```

### Configuration

- [ ] **OpenAI API Key** (Optional, for AI features)
  ```bash
  # Set environment variable
  export OPENAI_API_KEY=your-api-key-here
  
  # Or add to .env file
  echo "OPENAI_API_KEY=your-api-key-here" >> .env
  ```

## Launch Readiness Assessment

### ✅ Ready to Launch
- All prerequisites installed
- Ports 3000, 5173, and 8000 are available
- OpenAI API key configured (if using AI features)
- Dependencies installed (or using `--skip-install`)

### ⚠️ Partial Readiness
- **Missing OpenAI API Key:** Services will launch but AI features won't work
- **Port Conflicts:** Services will attempt to use alternative ports
- **No Docker:** Use native launch scripts instead

### ❌ Not Ready
- Node.js not installed
- Python not installed
- All ports blocked (will need manual configuration)

## Troubleshooting

### Port Already in Use
```bash
# Find process using port (Linux/Mac)
lsof -i :8000

# Find process using port (Windows)
netstat -ano | findstr :8000

# Kill process or use alternative port
./launch.sh --api-port 8100
```

### Dependencies Not Installing
```bash
# Clear npm cache
npm cache clean --force

# Clear pip cache
pip cache purge

# Re-run with clean install
./launch.sh  # Will auto-detect missing dependencies
```

### Services Not Starting
```bash
# Check logs
docker compose logs -f  # For Docker
# Or check terminal output for native launch

# Verify prerequisites
node --version
python3 --version
npm --version
pip3 --version

# Try manual start to see detailed errors
cd services/prompt-api
python3 app.py
```

### Docker Issues
```bash
# Rebuild containers
docker compose build --no-cache

# Remove all containers and start fresh
docker compose down -v
docker compose up -d
```

## Health Checks

After launching, verify services are running:

```bash
# Check Prompt API health
curl http://localhost:8000/health

# Check Dashboard (should return HTML)
curl http://localhost:5173

# Check Web Portal (should return HTML)
curl http://localhost:3000
```

Or open the Launch Portal in your browser: `launch-portal.html`

## Advanced Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# API Configuration
OPENAI_API_KEY=your-api-key-here
OPENAI_MODEL=gpt-4o-mini
PROMPT_API_ADMIN_TOKEN=your-admin-token

# Port Configuration
API_PORT=8000
FRONTEND_PORT=5173
WEB_PORT=3000
WORKBENCH_PORT=8501

# Database
PROMPT_API_DB_PATH=./services/prompt-api/workbench.db
```

### Custom Data Directory

The data directory structure:
```
data/
├── prompts/          # Prompt YAML files
├── agents/           # Agent definitions
├── artifacts/        # Generated artifacts
└── runs/            # Execution logs
```

## Stopping Services

### Native Launch
Press `Ctrl+C` in the terminal where services are running.

### Docker
```bash
docker compose down
```

### Windows PowerShell
Press `Ctrl+C` in the PowerShell window.

## Next Steps

1. **Access the Dashboard:** http://localhost:5173
2. **Explore the API:** http://localhost:8000/docs
3. **Read the Documentation:** See README.md for detailed usage
4. **Configure AI Models:** Set your OpenAI API key in .env
5. **Import Prompts:** Use the dashboard to import prompt libraries

## Support

For issues and questions:
- Check this guide first
- Review README.md for detailed documentation
- Check GitHub issues: https://github.com/xfaith4/UnifiedAIToolbox/issues
- Look at existing launch scripts for platform-specific details

---

**Happy Building! 🎉**
