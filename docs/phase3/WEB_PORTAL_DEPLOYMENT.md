# Phase 3 - Web Portal Deployment (Next.js)

The Unified Web Portal (`apps/unifiedtoolbox.webapp`) uses Next.js App Router and includes `src/app/api/*` routes, so it must be deployed to a Node-capable runtime (not GitHub Pages static export).

## Recommended: Vercel

This repo includes a GitHub Actions workflow to deploy the portal to Vercel:
- `.github/workflows/deploy-unified-webapp-vercel.yml`

### Required GitHub secrets

Add these repository secrets:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

You can get these values from Vercel (account + project settings), or via the Vercel CLI.

### Configure API base URL

Set a GitHub Actions repository variable:
- `NEXT_PUBLIC_API_BASE=https://your-prompt-api.example.com`

If unset, the build defaults to `http://localhost:8000` (local dev only).

### Deploy

- Manual: run the workflow from Actions → “Deploy Unified Web Portal (Vercel)”.
- Automatic: push to `main` (workflow also triggers on `main`).

## Notes

- If you also deploy the Prompt API, ensure it’s reachable from browsers and supports CORS for the portal domain.

