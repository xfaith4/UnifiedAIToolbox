# ReactViteDashboard Add-on: GitHub + Genesys Cloud Starter

This overlay adds two ready-to-use pages and services:

- **/github** — username + (optional) PAT -> fetch repos via GitHub REST
- **/genesys** — region/org/token fields -> calls your **Pode** API proxy for Divisions + sample metrics

## Apply the add-on
Extract this zip **over** a copy of the base template.
- It will **replace** `src/App.tsx` to wire new routes.
- It will **add**: `src/pages/GitHub.tsx`, `src/services/github.ts`, `src/pages/Genesys.tsx`, `src/services/genesys.ts`
- Update your sidebar (`src/components/Layout.tsx`) with the snippets in `patches/Layout.additions.txt`

## Backend expectations
Set `VITE_API_BASE` in your `.env` to your Pode API base, e.g.:
```
VITE_API_BASE=http://localhost:5050/api
```
Implement these proxy endpoints (examples):
- `GET  /genesys/:region/:org/divisions`
- `POST /genesys/:region/:org/metrics`   (body: which analytics to fetch)

> Never expose Genesys secrets directly to the browser. The proxy should handle OAuth (PKCE or Client Credentials as appropriate) and forward clean JSON to the UI.

## GitHub usage
You can omit the PAT for public repos; include it for private repos & higher rate limits.
