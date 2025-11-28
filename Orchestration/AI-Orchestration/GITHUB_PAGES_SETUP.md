# GitHub Pages Setup Instructions

This file contains step-by-step instructions for enabling GitHub Pages for the AI-Orchestration repository.

## ⚠️ Important: GitHub Pages Configuration Required

If you're seeing the README instead of the Milestone Dashboard at https://xfaith4.github.io/AI-Orchestration/, it means GitHub Pages needs to be configured to use the `gh-pages` branch. Follow the steps below to fix this.

### Quick Fix Steps

1. **Trigger the Deployment Workflow** (if `gh-pages` branch doesn't exist yet):
   - Go to the [Actions tab](https://github.com/xfaith4/AI-Orchestration/actions)
   - Click on "Deploy Milestone Dashboard" workflow
   - Click "Run workflow" → select `React/Vite-Dashboard` branch → Click "Run workflow"
   - Wait for the workflow to complete (2-5 minutes)

2. **Configure GitHub Pages**:
   - Go to [Settings → Pages](https://github.com/xfaith4/AI-Orchestration/settings/pages)
   - Under "Build and deployment":
     - Set **Source** to "Deploy from a branch"
     - Set **Branch** to `gh-pages` and **Folder** to `/ (root)`
   - Click **Save**

3. **Verify**: Wait 1-2 minutes, then visit https://xfaith4.github.io/AI-Orchestration/

That's it! The dashboard should now be displayed.

## Prerequisites

- Repository admin/owner access
- The deployment workflow is already configured in `.github/workflows/deploy-dashboard.yml`
- The React dashboard is configured with the correct base path in `vite.config.js`

## Steps to Enable GitHub Pages

### 1. Navigate to Repository Settings

1. Go to the repository: https://github.com/xfaith4/AI-Orchestration
2. Click on **Settings** tab (requires admin access)

### 2. Configure GitHub Pages

1. In the left sidebar, scroll down and click **Pages** (under "Code and automation")
2. Under **Build and deployment**:
   - **Source**: Select "Deploy from a branch"
   - **Branch**: Select `gh-pages` from the dropdown
   - **Folder**: Select `/ (root)`
3. Click **Save**

### 3. Wait for Initial Deployment

After saving:
1. GitHub will show a message: "GitHub Pages source saved"
2. Navigate to the **Actions** tab
3. You should see the deployment workflow running (if this is after merging the PR)
4. Wait for the workflow to complete (typically 2-5 minutes; first-time deployments may take longer due to dependency installation)

### 4. Access Your Dashboard

Once deployment is complete, the dashboard will be available at:
```
https://xfaith4.github.io/AI-Orchestration/
```

GitHub Pages will show you this URL in the Pages settings page with a "Visit site" button.

## Triggering Deployments

### Automatic Deployment

The dashboard automatically deploys when:
- Changes are pushed to the `React/Vite-Dashboard` branch
- Files in `MilestoneDashboard/**` are modified
- Files in `scripts/Update-OrchestrationMetrics.psm1` are modified
- Files in `MilestoneDashboard/public/data/*.json` are updated

### Manual Deployment

To manually trigger a deployment:
1. Go to the **Actions** tab
2. Click on **Deploy Milestone Dashboard** workflow
3. Click **Run workflow** button
4. Select the `React/Vite-Dashboard` branch
5. Click **Run workflow**

## Verifying Deployment

After deployment completes:

1. Check the Actions tab for a green checkmark
2. Visit the GitHub Pages URL
3. Verify the dashboard loads correctly
4. Check that data displays properly
5. Test navigation and interactive features

## Troubleshooting

### Dashboard Shows 404

- Verify GitHub Pages is enabled and source is set to `gh-pages` branch
- Check that the deployment workflow completed successfully
- Ensure the base path in `vite.config.js` matches your repository name

### Dashboard Loads But Shows No Data

- Check that `MilestoneDashboard/public/data/*.json` files exist and contain data
- Verify the build process copied data files to the dist folder
- Check browser console for fetch errors

### Deployment Workflow Fails

- Check the Actions tab for error logs
- Common issues:
  - Missing dependencies (should be fixed by `npm install --legacy-peer-deps`)
  - Build errors (check the build step output)
  - Permissions issues (verify GITHUB_TOKEN has write permissions)

### Changes Don't Appear

- Clear browser cache
- Try accessing in incognito/private mode
- Check the commit that triggered the deployment
- Verify the workflow ran after your changes

## Custom Domain (Optional)

To use a custom domain:
1. In Pages settings, enter your custom domain under "Custom domain"
2. Add a CNAME record in your DNS provider pointing to `xfaith4.github.io` (without the repository path)
3. Enable "Enforce HTTPS" after DNS propagates (may take up to 24 hours)

## Notes

- The `gh-pages` branch is automatically managed by the deployment workflow
- Do not manually commit to the `gh-pages` branch
- The dashboard data is static - it reflects the data files at build time
- For real-time updates, users should run the dashboard locally with `npm start`
