# Quick Start: Deployment Guide

## 🚀 Get Started in 3 Steps

### Step 1: Enable GitHub Pages (One-Time Setup)
1. Go to your repository **Settings** → **Pages**
2. Under "Build and deployment":
   - **Source**: Deploy from a branch
   - **Branch**: `gh-pages` (will be created automatically on first deploy)
   - **Folder**: `/ (root)`
3. Click **Save**

### Step 2: Deploy
Your dashboard automatically deploys when you push to `React/Vite-Dashboard` branch!

**Manual deploy (optional):**
1. Go to **Actions** tab
2. Select "Deploy Milestone Dashboard"
3. Click "Run workflow" → Select `React/Vite-Dashboard` → Run

### Step 3: Access Your Dashboard
Visit: `https://xfaith4.github.io/AI-Orchestration/`

That's it! 🎉

---

## 🔄 Automatic Deployment
The dashboard redeploys automatically when:
- You push changes to `React/Vite-Dashboard` branch
- Files in `MilestoneDashboard/` are modified
- Data files in `public/data/` are updated

## 🧪 Running Tests Locally

```bash
cd MilestoneDashboard
npm install --legacy-peer-deps
npm test
```

All tests must pass before deployment. The CI/CD pipeline automatically runs tests on every push.

## 💻 Local Development

```bash
cd MilestoneDashboard
npm install --legacy-peer-deps
npm run dev
```

Opens at: `http://localhost:5050`

**Other useful commands:**
- `npm test` - Run test suite
- `npm run build` - Create production build
- `npm run preview` - Preview production build

## 🔧 Troubleshooting

### Tests Failing?
- Ensure all dependencies installed: `npm install --legacy-peer-deps`
- Check test output for specific errors: `npm test`

### Build Failing?
- Always use `--legacy-peer-deps` flag (required for React 19)
- Clear node_modules and reinstall if needed

### Dashboard Not Updating?
- Check Actions tab for workflow status
- Verify GitHub Pages is enabled (Settings → Pages)
- Clear browser cache or use incognito mode

## 📚 More Details
For comprehensive documentation, see [DEPLOYMENT.md](./DEPLOYMENT.md)

---

**Quick Reference:**
- 🏠 Live Dashboard: https://xfaith4.github.io/AI-Orchestration/
- 📊 Local Dev: http://localhost:5050
- 🧪 Tests: `npm test`
- 🏗️ Build: `npm run build`
