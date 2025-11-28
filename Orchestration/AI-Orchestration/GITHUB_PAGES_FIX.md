# How to Display MilestoneDashboard on GitHub Pages

## Problem

Currently, https://xfaith4.github.io/AI-Orchestration/ displays the README content instead of the MilestoneDashboard.

## Root Cause

GitHub Pages is configured to deploy from the `main` branch root directory. When GitHub Pages is set to deploy from a branch's root, it automatically converts `README.md` to HTML and displays it as the site's index page.

However, the MilestoneDashboard is designed to be built and deployed to the `gh-pages` branch via GitHub Actions workflow (`.github/workflows/deploy-dashboard.yml`).

## Solution

To display the MilestoneDashboard instead of the README, you need to:

1. **Ensure the gh-pages branch exists** (by running the deployment workflow)
2. **Configure GitHub Pages to use the gh-pages branch** (in repository settings)

## Step-by-Step Fix

### Step 1: Create/Update the gh-pages Branch

The `gh-pages` branch is automatically created and updated by the deployment workflow. You need to trigger this workflow:

**Option A: Automatic Trigger**
- Merge this PR to the `main` branch
- The workflow will automatically run because we modified files in `MilestoneDashboard/`
- Wait 2-5 minutes for the workflow to complete

**Option B: Manual Trigger**
1. Go to the [Actions tab](https://github.com/xfaith4/AI-Orchestration/actions)
2. Click on "Deploy Milestone Dashboard" workflow
3. Click the "Run workflow" button
4. Select the `main` branch
5. Click "Run workflow"
6. Wait for the workflow to complete (2-5 minutes)

### Step 2: Configure GitHub Pages Settings

Once the `gh-pages` branch exists:

1. Go to your repository: https://github.com/xfaith4/AI-Orchestration
2. Click the **Settings** tab (requires admin/owner access)
3. In the left sidebar, scroll down and click **Pages** (under "Code and automation")
4. Under **Build and deployment**:
   - **Source**: Select "Deploy from a branch"
   - **Branch**: Select `gh-pages` from the dropdown (it should now be available)
   - **Folder**: Select `/ (root)`
5. Click **Save**

### Step 3: Verify

1. Wait 1-2 minutes for GitHub Pages to rebuild
2. Visit https://xfaith4.github.io/AI-Orchestration/
3. You should now see the Milestone Dashboard instead of the README

## How It Works

### Current Setup

```
Repository Structure:
├── README.md                          ← Currently displayed by GitHub Pages
├── MilestoneDashboard/                ← React dashboard source code
│   ├── src/
│   ├── public/
│   └── vite.config.js                 ← Configured with base: '/AI-Orchestration/'
└── .github/workflows/
    └── deploy-dashboard.yml           ← Builds and deploys to gh-pages
```

### After Fix

```
Branches:
├── main
│   └── Contains source code (including MilestoneDashboard/)
└── gh-pages                           ← Created by workflow
    └── Contains built dashboard (dist/ contents)
        ├── index.html                 ← Dashboard entry point
        ├── assets/
        └── data/

GitHub Pages Configuration:
- Source: Deploy from branch
- Branch: gh-pages
- Result: Dashboard displayed at https://xfaith4.github.io/AI-Orchestration/
```

## Technical Details

### Workflow Configuration

The deployment workflow (`.github/workflows/deploy-dashboard.yml`) is triggered by:
- Pushes to `main` branch that modify:
  - `MilestoneDashboard/**`
  - `scripts/Update-OrchestrationMetrics.psm1`
  - `MilestoneDashboard/public/data/*.json`
- Manual workflow dispatch

The workflow:
1. Checks out the repository
2. Installs dependencies with `npm install --legacy-peer-deps`
3. Runs tests with `npm test`
4. Builds the dashboard with `npm run build`
5. Deploys the `MilestoneDashboard/dist` directory to the `gh-pages` branch using `peaceiris/actions-gh-pages@v3`

### Vite Configuration

The dashboard's `vite.config.js` has:
```javascript
base: '/AI-Orchestration/'
```

This ensures all asset paths are correctly prefixed for GitHub Pages deployment at `https://xfaith4.github.io/AI-Orchestration/`.

## Why Not Use a Redirect in main Branch?

You might consider adding an `index.html` in the `main` branch root that redirects to the dashboard. However:

1. **Redirect Loop**: If both branches have index.html, it could cause issues
2. **Not Best Practice**: GitHub Pages + React SPA projects typically use the gh-pages branch pattern
3. **Workflow Already Set Up**: The deployment workflow is already correctly configured
4. **Clean Separation**: Keeps source code (main) separate from built artifacts (gh-pages)

## Troubleshooting

### "gh-pages branch not available in dropdown"

The workflow hasn't run yet. See Step 1 above to trigger it.

### "Dashboard loads but shows no data"

The workflow successfully deployed, but data files might be missing. Check:
- `MilestoneDashboard/public/data/*.json` files exist in React/Vite-Dashboard branch
- The build process copied them (check workflow logs)
- Browser console for fetch errors

### "Changes don't appear after merging"

- Wait 2-3 minutes for the workflow to complete
- Check the [Actions tab](https://github.com/xfaith4/AI-Orchestration/actions) for workflow status
- Clear browser cache or try incognito mode
- Verify the workflow completed successfully (green checkmark)

## Additional Resources

- [GITHUB_PAGES_SETUP.md](GITHUB_PAGES_SETUP.md) - Complete setup documentation
- [MilestoneDashboard/DEPLOYMENT.md](MilestoneDashboard/DEPLOYMENT.md) - Dashboard-specific deployment docs
- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [peaceiris/actions-gh-pages](https://github.com/peaceiris/actions-gh-pages) - The action used for deployment

## Summary

The fix is simple:
1. Run the deployment workflow (manual or automatic via PR merge)
2. Configure GitHub Pages to use the `gh-pages` branch
3. Wait a couple minutes and refresh

That's it! The MilestoneDashboard will then be displayed at https://xfaith4.github.io/AI-Orchestration/.
