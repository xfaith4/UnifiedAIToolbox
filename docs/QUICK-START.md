# AI Toolbox - Quick Start Guide

## 🚀 Single-Click Launch Options

### Option 1: Desktop Shortcut (Easiest!)
**Double-click "AI Toolbox" icon on your desktop**
- Automatically checks if already running
- Opens browser to http://localhost:5173
- Shows PowerShell window for logs

### Option 2: Batch File
**Double-click: \Launch-AIToolbox.bat\**
- Same as desktop shortcut
- Located in this folder

### Option 3: PowerShell (Advanced)
\\\powershell
.\LaunchUnifiedToolbox.ps1 -SkipInstall
\\\

## 🛑 Stopping Services

### Easy Way
**Double-click: \Stop-AIToolbox.bat\**
- Stops all running services
- Closes ports 5173 and 8000

### Manual Way
- Close the PowerShell window that launched the services
- Or press Ctrl+C in that window

## 📂 What Gets Launched

When you start AI Toolbox, these services run:

1. **React Dashboard** (port 5173)
   - Primary user interface
   - Modern React/Vite frontend
   - http://localhost:5173

2. **FastAPI Backend** (port 8000)
   - Prompt library API
   - Orchestrator endpoints
   - http://localhost:8000

3. ~~**Streamlit Workbench** (deprecated)~~
   - No longer launches by default
   - Use \-EnableStreamlit\ flag if needed

## 🎯 Main Features

### Navigation (Left Sidebar)
- **Overview** → Dashboard
- **Libraries** → Prompt Library, Agent Library
- **Integration Tools** → Orchestrator, Genesys, GitHub
- **Settings** → Configuration

### Key Components
- **Prompt Library**: Manage and organize AI prompts
- **Agent Library**: Define AI agents with instructions
- **Orchestrator**: Coordinate multi-agent workflows
- **Genesys**: Integration for contact center analytics
- **GitHub**: Version control integration

## 🔧 Launch Process Details

The launch process:
1. Checks if ports 5173 and 8000 are available
2. Validates Python and Node.js are installed
3. Starts FastAPI backend (Python/uvicorn)
4. Starts React frontend (Node.js/Vite)
5. Performs health checks
6. Opens browser automatically

## 📝 Files Created

- \Launch-AIToolbox.bat\ - Main launcher
- \Stop-AIToolbox.bat\ - Stop all services
- \Create-Shortcut.ps1\ - Desktop shortcut creator
- Desktop shortcut: \AI Toolbox.lnk\

## ⚙️ Advanced Options

### Custom Ports
\\\powershell
.\LaunchUnifiedToolbox.ps1 -FrontendPort 3000 -ApiPort 8080 -SkipInstall
\\\

### Enable Streamlit (deprecated)
\\\powershell
.\LaunchUnifiedToolbox.ps1 -EnableStreamlit -SkipInstall
\\\

### Frontend Only
\\\powershell
.\LaunchUnifiedToolbox.ps1 -FrontendOnly -SkipInstall
\\\

### Backend Only
\\\powershell
.\LaunchUnifiedToolbox.ps1 -BackendOnly -SkipInstall
\\\

## 🐛 Troubleshooting

### Port Already in Use
If you see "Port XXXX is already in use":
1. Run \Stop-AIToolbox.bat\
2. Or use: \.\LaunchUnifiedToolbox.ps1 -FrontendPort 3000 -ApiPort 8080\

### Services Won't Start
1. Check Python is installed: \python --version\
2. Check Node.js is installed: \
ode --version\
3. Run with verbose output: \.\LaunchUnifiedToolbox.ps1\ (without -SkipInstall)

### Browser Doesn't Open
Manually navigate to: http://localhost:5173

## 📚 Documentation

- Integration Guide: \INTEGRATION_GUIDE.md\
- API Documentation: http://localhost:8000/docs (when running)
- Component Details: \pps/prompt-hub/src/components/\

## 🎉 Success!

Your AI Toolbox is now ready to use with single-click launching!
