# MilestoneDashboard GitHub Pages Deployment Instructions

## Overview
This PR prepares the MilestoneDashboard for deployment to GitHub Pages. All code changes are complete and tested. You now need to configure GitHub Pages in your repository settings.

## What Was Changed

### 1. Fixed Data File Naming
- **Renamed**: `current_goal.json` → `CurrentGoal.json`
- **Updated**: `Write-CurrentGoal.ps1` to use new filename
- **Reason**: Ensures consistency between what the React app requests and what PowerShell scripts generate

### 2. Enhanced index.html for Static Deployment
- **Added**: Intelligent base URL detection from `window.location.pathname`
- **Improved**: Fallback from API server to static JSON files
- **Works**: Both in local development (with Express backend) and on GitHub Pages (static only)

### 3. Verified Build Process
- ✅ Build completes successfully with `npm run build`
- ✅ Data files correctly copied to `dist/data/`
- ✅ Vite injects `/AI-Orchestration/` base path into assets
- ✅ Dynamic base URL detection works for both `/` and `/AI-Orchestration/`

## Next Steps: Enable GitHub Pages

### Step 1: Merge This PR
1. Review the changes in this PR
2. Approve and merge to `main` branch
3. This will NOT trigger deployment yet (no `gh-pages` branch exists)

### Step 2: Configure GitHub Pages
1. Go to repository **Settings**
2. Click **Pages** in left sidebar (under "Code and automation")
3. Under **Build and deployment**:
   - **Source**: Select **"Deploy from a branch"**
   - **Branch**: Select **`gh-pages`** ← (will appear after first deployment)
   - **Folder**: Select **`/ (root)`**
4. Click **Save**

**Important**: The `gh-pages` branch doesn't exist yet. GitHub Pages will create it automatically on the first deployment.

### Step 3: Trigger First Deployment

After merging this PR, manually trigger the deployment workflow:

1. Go to **Actions** tab
2. Click **"Deploy Milestone Dashboard"** workflow
3. Click **"Run workflow"** button
4. Select `main` branch
5. Click **"Run workflow"**

This will:
- Build the React dashboard
- Create the `gh-pages` branch
- Deploy the built files

### Step 4: Configure GitHub Pages Source (Again)

After the first deployment creates the `gh-pages` branch:

1. Return to **Settings** → **Pages**
2. Now you'll see `gh-pages` in the branch dropdown
3. Select it and save (if not already selected)

### Step 5: Access Your Dashboard

Once deployment completes (2-5 minutes):
- Dashboard URL: **https://xfaith4.github.io/AI-Orchestration/**
- You'll see this URL in Settings → Pages with a "Visit site" button

## Verifying Deployment

### Check Deployment Status
1. Go to **Actions** tab
2. Look for green checkmark on "Deploy Milestone Dashboard" workflow
3. Click on the workflow run to see detailed logs

### Test the Dashboard
1. Visit https://xfaith4.github.io/AI-Orchestration/
2. Verify the page loads without errors
3. Check browser console (F12) for any fetch errors
4. Confirm data displays correctly:
   - Current goal in header banner
   - Milestone log data
   - Performance metrics

### Common Issues

#### Dashboard Shows 404
- **Cause**: GitHub Pages not enabled or wrong branch selected
- **Fix**: Verify Settings → Pages is configured for `gh-pages` branch

#### Dashboard Loads But No Data
- **Cause**: Data files missing or in wrong location
- **Fix**: Check that `MilestoneDashboard/public/data/*.json` files exist and have valid data

#### "Failed to fetch" Errors
- **Cause**: Base URL mismatch
- **Fix**: This should be automatically detected. Check browser console for actual URL being fetched.

#### Workflow Fails
- **Cause**: Build errors or permission issues
- **Fix**: Check Actions logs. Common fix: Ensure workflow has write permissions (already set in workflow file)

## Future Deployments

After initial setup, deployments are automatic:

### Automatic Triggers
The dashboard redeploys automatically when:
- Changes pushed to `main` branch
- Files in `MilestoneDashboard/**` modified
- Data files updated in `MilestoneDashboard/public/data/`

### Manual Trigger
You can also manually trigger deployment:
1. Actions tab → Deploy Milestone Dashboard
2. Run workflow → select `main` branch
3. Click Run workflow

## Local Development Still Works

The changes made don't affect local development:
```bash
cd MilestoneDashboard
npm install --legacy-peer-deps

# Run Vite dev server (port 5050 - configured in vite.config.js)
npm run dev

# To run the Express API server separately (also uses port 5050)
# you would need to run it in a different terminal or change one of the ports
node server/api-server.js
```

**Note**: Both the Vite dev server and Express API server are configured for port 5050. In practice, you would typically run just the Vite dev server for frontend development, or modify one of the port configurations if you need both running simultaneously.


## Technical Details

### Base URL Detection Logic
```javascript
// Detects /AI-Orchestration/ from URL like https://xfaith4.github.io/AI-Orchestration/
var baseURL = window.location.pathname.match(/^\/[^\/]+\//) 
  ? window.location.pathname.match(/^\/[^\/]+\//)[0] 
  : '/';
```

### Data Fetching Flow
1. **Try API**: `http://localhost:5050/api/current-goal` (local dev)
2. **On failure**: Fall back to `{baseURL}data/CurrentGoal.json` (GitHub Pages)
3. **Result**: Works in both environments without code changes

## Support

If you encounter issues:
1. Check this guide's troubleshooting section above
2. Review workflow logs in Actions tab
3. Verify data files exist and are valid JSON
4. Check browser console for detailed error messages
