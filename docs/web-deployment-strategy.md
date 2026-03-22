# Web Deployment Strategy — Unified AI Toolbox

**Status**: Active  
**Decision**: DEC-004 (2026-02-07)  
**Roadmap item**: RM-007

---

## Decision summary

The Unified AI Toolbox web app is a **dynamic Next.js application** that uses server-side API routes
(`/api/app-factory/...`, `/api/mcp/...`, `/api/orchestrate/...`). It **cannot** be deployed as a
static export to GitHub Pages because:

- API routes require a Node.js runtime.
- The app reads and writes to local filesystem paths (run artefacts, orchestration output).
- Server-side spawning of PowerShell worker processes requires a persistent server process.

## Target hosting

| Layer | Recommended option | Notes |
|---|---|---|
| Web app (Next.js) | Self-hosted Node.js process (e.g. `npm start` behind a reverse proxy) | Vercel / Railway / Render also work; keep `output` unset (default = Node server) |
| Prompt API (FastAPI) | Same host, different port (default: 8000) | Or a separate container; configure `NEXT_PUBLIC_API_BASE` to point to it |
| Run worker | Local only (spawns PowerShell) | Must run on a machine with PowerShell 7.4+ and repo access |

Cloud platforms that support a persistent Node.js server (Vercel, Railway, Render, Fly.io) are viable
for the web layer only. The orchestration worker must remain on a machine with local repo access and
PowerShell installed.

## next.config setting

The `next.config.mjs` must **not** include `output: 'export'`. The current configuration correctly
omits this, allowing the default standalone Node.js server output.

## CI build workflow (`nextjs.yml`)

The `nextjs.yml` workflow builds the app with `next build` and uploads the `.next` directory as an
artefact. This artefact is ready to be deployed to any Node.js host:

```bash
# On the deployment target:
node_modules/.bin/next start   # or: npm start
```

The build uploads as `unified-webapp-next-build` and is retained for 7 days.

## Environment variables

| Variable | Purpose | Required |
|---|---|---|
| `NEXT_PUBLIC_API_BASE` | FastAPI backend base URL | Yes (defaults to `http://localhost:8000`) |
| `UAIT_EXECUTION_TOKEN` | Token required to start orchestration runs | Recommended in production |
| `OPENAI_API_KEY` | Used by App Factory repair loop fixer model | Optional (users can provide in UI) |
| `NODE_ENV` | Set to `production` for production deployments | Yes (set automatically by `next build`) |

## GitHub Pages

`pages.yml` deploys the **repository root** (landing page + demo HTML) to GitHub Pages. This is
separate from the web app and serves static marketing/demo content only. The Next.js app itself is
not deployed via Pages.

## Definition of done

- [x] `output: 'export'` not present in `next.config.mjs` — dynamic routing preserved.
- [x] CI workflow (`nextjs.yml`) builds and uploads a deployable `.next` artefact.
- [x] `NEXT_PUBLIC_API_BASE` wired through CI and documented here.
- [x] GitHub Pages scope limited to root static content; web app excluded.
- [x] Deployment instructions documented in this file and `BUILD.md`.
