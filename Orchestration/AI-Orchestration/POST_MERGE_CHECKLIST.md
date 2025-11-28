# Post-Merge Deployment Checklist

This checklist guides you through deploying the MilestoneDashboard to GitHub Pages after merging this PR.

## Prerequisites ✅

Before you begin, ensure:
- [ ] This PR has been merged to the `main` branch
- [ ] You have admin/owner access to the repository
- [ ] You are logged into GitHub

## Step 1: Enable GitHub Pages

1. [ ] Go to your repository: https://github.com/xfaith4/AI-Orchestration
2. [ ] Click the **Settings** tab (top menu)
3. [ ] In the left sidebar, scroll down to **Pages** (under "Code and automation")
4. [ ] Under **Build and deployment**:
   - [ ] Set **Source** to: "Deploy from a branch"
   - [ ] Set **Branch** to: `gh-pages`
   - [ ] Set **Folder** to: `/ (root)`
5. [ ] Click **Save**

Expected result: GitHub shows "GitHub Pages source saved" message

## Step 2: Verify Deployment Workflow

1. [ ] Click the **Actions** tab in your repository
2. [ ] Look for the **Deploy Milestone Dashboard** workflow
3. [ ] If it hasn't run yet, manually trigger it:
   - [ ] Click on **Deploy Milestone Dashboard**
   - [ ] Click **Run workflow** button (right side)
   - [ ] Select `main` branch
   - [ ] Click **Run workflow**
4. [ ] Wait for the workflow to complete (green checkmark)
   - First deployment: ~3-5 minutes
   - Subsequent deployments: ~2-3 minutes

Expected result: Workflow completes successfully with green checkmark

## Step 3: Verify Deployment

1. [ ] Go back to **Settings** → **Pages**
2. [ ] You should see a green box at the top with:
   - "Your site is live at https://xfaith4.github.io/AI-Orchestration/"
3. [ ] Click **Visit site** or navigate to the URL
4. [ ] Verify the dashboard loads correctly
5. [ ] Check that data displays in the table/charts
6. [ ] Test navigation and interactive features

Expected result: Dashboard displays with your orchestration data

## Step 4: Test Automatic Updates (Optional)

To verify automatic deployment works:

1. [ ] Make a small change to a file in `MilestoneDashboard/` (e.g., edit README.md)
2. [ ] Commit and push to `React/Vite-Dashboard` branch
3. [ ] Check **Actions** tab - workflow should run automatically
4. [ ] After completion, visit the dashboard URL to see changes

Expected result: Changes appear on the live site after workflow completes

## Troubleshooting

### Workflow Fails

If the deployment workflow fails:
1. [ ] Check the Actions tab for error logs
2. [ ] Common issues:
   - Dependencies installation error → Workflow already uses `--legacy-peer-deps`
   - Permissions error → Check that Actions have write permissions
   - Build error → Check the build step output

### Dashboard Shows 404

If you see "404 Not Found":
1. [ ] Verify Pages is enabled and set to `gh-pages` branch
2. [ ] Wait 2-3 minutes after workflow completes for DNS to propagate
3. [ ] Clear browser cache or try incognito mode
4. [ ] Check that the URL is exactly: `https://xfaith4.github.io/AI-Orchestration/`

### Dashboard Shows No Data

If the dashboard loads but shows no data:
1. [ ] Check that `MilestoneDashboard/public/data/Milestone_Log.json` exists and has data
2. [ ] Verify the build copied data files to dist (check workflow logs)
3. [ ] Open browser console (F12) to check for fetch errors

## Additional Resources

- **Detailed Setup Guide**: See `GITHUB_PAGES_SETUP.md`
- **Deployment Documentation**: See `MilestoneDashboard/DEPLOYMENT.md`
- **Changes Summary**: See `DEPLOYMENT_SUMMARY.md`
- **GitHub Pages Docs**: https://docs.github.com/en/pages

## Success Criteria

You're done when:
- ✅ Dashboard is accessible at: https://xfaith4.github.io/AI-Orchestration/
- ✅ Data loads and displays correctly
- ✅ Interactive features work (navigation, filtering, etc.)
- ✅ Automatic deployment workflow completes successfully

## Celebration 🎉

Once everything is working:
- Your MilestoneDashboard is now publicly accessible!
- It will automatically update when you push changes to `main`
- Share the URL with your team or stakeholders

---

**Questions or Issues?**
- Check the troubleshooting section above
- Review the documentation files in the repository
- Open an issue on GitHub if problems persist
