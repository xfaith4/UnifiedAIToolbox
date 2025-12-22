# Milestone Dashboard Deployment Guide

## Overview
The Milestone Dashboard is a React + Vite application that visualizes AI orchestration runs, costs, and performance metrics. It is configured for automatic deployment to GitHub Pages.

## GitHub Pages Deployment

### Prerequisites
- GitHub repository with GitHub Pages enabled
- Repository settings: Pages source set to deploy from `gh-pages` branch

### Automatic Deployment
The dashboard is automatically deployed on every push to the `React/Vite-Dashboard` branch when changes are detected in:
- `MilestoneDashboard/**`
- `scripts/Update-OrchestrationMetrics.psm1`
- `MilestoneDashboard/public/data/*.json`

The deployment workflow (`.github/workflows/deploy-dashboard.yml`) will:
1. Install dependencies
2. Build the Vite application
3. Deploy the build artifacts to the `gh-pages` branch
4. GitHub Pages will serve the content from that branch

### Manual Deployment
You can manually trigger a deployment from the GitHub Actions tab:
1. Go to **Actions** tab in the repository
2. Select **Deploy Milestone Dashboard** workflow
3. Click **Run workflow** dropdown
4. Select the `React/Vite-Dashboard` branch
5. Click **Run workflow**

### Accessing the Deployed Dashboard
Once deployed, the dashboard will be available at:
```
https://<username>.github.io/AI-Orchestration/
```

For this repository:
```
https://xfaith4.github.io/AI-Orchestration/
```

## Local Development

### Install Dependencies
```bash
cd MilestoneDashboard
npm install --legacy-peer-deps
```

Note: `--legacy-peer-deps` is required because React 19 has peer dependency conflicts with some packages.

### Run Development Server
```bash
npm run dev
```
This will start the development server at `http://localhost:5050`

### Build for Production
```bash
npm run build
```
The production build will be created in the `dist/` directory.

### Preview Production Build
```bash
npm run preview
```
This will serve the production build at `http://localhost:5050`

## Configuration

### Base Path
The application is configured with the base path `/AI-Orchestration/` in `vite.config.js` to match the GitHub Pages URL structure.

### Data Files
The dashboard loads data from JSON files in `public/data/`:
- `Milestone_Log.json` - Historical run data
- `Metrics_Trend.json` - Performance metrics over time
- `CurrentGoal.json` - Current orchestration goal
- `synth/` - Synthesis files from runs

These files are automatically copied to `dist/data/` during the build process.

## Troubleshooting

### Build Fails with Peer Dependency Errors
Use `npm install --legacy-peer-deps` instead of `npm ci` or `npm install`

### Dashboard Shows No Data
Ensure the JSON files in `public/data/` are populated with valid data from orchestration runs.

### GitHub Pages Not Updating
1. Check the Actions tab for deployment workflow status
2. Ensure GitHub Pages is enabled in repository Settings > Pages
3. Verify the source is set to deploy from `gh-pages` branch
4. Clear browser cache or try accessing in incognito mode

## Architecture
- **Framework**: React 19
- **Build Tool**: Vite 5
- **UI Components**: Custom components with Lucide React icons
- **Charts**: Recharts for data visualization
- **Styling**: Tailwind CSS (via index.css)
