# 🚀 Quick Start Guide

## Launch in 30 Seconds

### Option 1: Visual Launch Portal (Easiest)
1. Open `launch-portal.html` in any web browser
2. Check service status
3. Copy and run the appropriate launch command

### Option 2: Direct Launch

**Windows:**
```powershell
./launch.sh   # run via Git Bash or WSL
```

**Linux/Mac:**
```bash
./launch.sh
```

**Docker:**
```bash
docker compose up -d
```

## Access Your Services

Once launched, open these URLs:

- 📊 **Dashboard:** http://localhost:5173
- 🔌 **API:** http://localhost:8000
- 📚 **API Docs:** http://localhost:8000/docs
- 🌐 **Web Portal:** http://localhost:3000

## Prerequisites

Install these first:
- ✅ Node.js 18+ ([nodejs.org](https://nodejs.org/))
- ✅ Python 3.12+ ([python.org](https://www.python.org/))
- ⚡ Docker (optional, for containerized launch)

## Configuration

### Set Your API Key (Optional)
```bash
# Linux/Mac
export OPENAI_API_KEY=your-key-here

# Windows PowerShell
$env:OPENAI_API_KEY="your-key-here"

# Or create .env file
cp .env.example .env
# Edit .env with your key
```

## Common Commands

### Stop Services
- **Native launch:** Press `Ctrl+C` in terminal
- **Docker:** `docker compose down`

### View Logs
- **Docker:** `docker compose logs -f`
- **Native:** Check terminal output

### Restart
- **Native:** Press `Ctrl+C`, then re-run launch command
- **Docker:** `docker compose restart`

## Need Help?

- 📖 Full guide: [launch-guide.md](launch-guide.md)
- 📘 Main docs: [../../README.md](../../README.md)
- 🐛 Issues: [GitHub Issues](https://github.com/xfaith4/UnifiedAIToolbox/issues)

## Troubleshooting

### Port Already in Use
```bash
# Use custom ports
./launch.sh --api-port 8100 --frontend-port 5180
```

### Dependencies Failed
```bash
# Clean install
rm -rf node_modules apps/*/node_modules
npm cache clean --force
./launch.sh
```

### Services Won't Start
1. Check prerequisites are installed: `node --version`, `python3 --version`
2. Read error messages in terminal
3. See [LAUNCH_GUIDE.md](LAUNCH_GUIDE.md) for detailed troubleshooting

---

**That's it! You're ready to use the Unified AI Toolbox.** 🎉
