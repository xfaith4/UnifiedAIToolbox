# GitHub Actions Workflow Audit - Summary

> Canonical roadmap/history tracking now lives in `docs/ROADMAP.md` and `docs/IMPLEMENTATION_SUMMARY.md`.  
> This file remains a detailed workflow/CI deep-dive record.

## Completed Fixes

### Priority 1: Critical TypeScript Fixes ✅
All TypeScript compilation errors have been resolved:

1. **ScatterPanel.tsx** - Fixed labelFormatter payload type to accept `any`
2. **orchestrator/page.tsx** - Added proper type validation for `progress.message` and `result.pr_url`
3. **prompts/page.tsx** - Fixed PromptRefine objects to include required `notes` field
4. **promptImport.ts** - Added proper tuple typing for normalizedEntries
5. **starterPrompts.ts** - Added type assertion to return `PromptItem[]`
6. **migrate-prompts.ts** - Already fixed (type was correctly inferred)
7. **history/route.ts** - Already fixed (proper type validation in place)

### Priority 2: Workflow Robustness & Guards ✅
Added comprehensive safety checks:

1. **Smoketest.ps1 validation** - Check if file exists before running, with fallback to archive location
2. **sqlite3 installation** - Auto-install sqlite3 if not available on ubuntu-latest
3. **Python API detection** - Enhanced with better error messages and requirements.txt validation
4. **Artifact uploads** - Added `continue-on-error: true` to non-critical uploads
5. **Environment variables** - Added NEXT_PUBLIC_API_BASE and NODE_ENV to Next.js builds
6. **File existence checks** - Added validation before operations

### Workflow Cleanup ✅
- Removed non-existent `dashboard` job references (already completed in previous PR)

## Remaining Issue: Next.js Static Export Configuration

## Resolved: Next.js Static Export Configuration ✅

The Next.js app uses `src/app/api/*` routes and must run with a Node.js server. The `output: 'export'` setting was removed from `apps/unifiedtoolbox.webapp/next.config.ts`, and the GitHub Pages deployment workflow was converted into a build-only workflow.

### Outcome
- `apps/unifiedtoolbox.webapp/next.config.ts` no longer uses static export.
- `.github/workflows/nextjs.yml` now runs `next build` and uploads `.next` as an artifact (no Pages deploy).

### Why This Happens
- Static export (`output: 'export'`) pre-renders all pages at build time
- API routes require a Node.js server to handle dynamic requests
- These two approaches are mutually exclusive

### Solution Options

#### Option 1: Remove Static Export (Recommended for Full Functionality)
**Remove** `output: 'export'` from `next.config.ts` and deploy with a Node.js server:

```typescript
const nextConfig = {
  // output: 'export',  // Remove this line
  reactCompiler: true,
  turbopack: {
    root: __dirname,
  },
} satisfies NextConfig & { turbopack?: { root?: string } };
```

**Pros:**
- All API routes work
- Full Next.js functionality
- Dynamic features available

**Cons:**
- Cannot deploy to GitHub Pages (requires Node.js server)
- Need hosting with Node.js support (Vercel, Netlify, AWS, etc.)

#### Option 2: Keep Static Export + Remove API Routes
Convert API routes to external API calls or client-side logic:

**Pros:**
- Can deploy to GitHub Pages
- Simpler hosting (static files only)
- Better performance for static content

**Cons:**
- Need to move API logic elsewhere
- More complex architecture
- Client-side API calls to external services

#### Option 3: Hybrid Approach
Use ISR (Incremental Static Regeneration) with selective dynamic routes:

```typescript
// In next.config.ts
const nextConfig = {
  // No 'output' specified - allows both static and dynamic
  reactCompiler: true,
  turbopack: {
    root: __dirname,
  },
};

// In individual API routes, add:
export const dynamic = 'force-dynamic';
// or
export const revalidate = 60; // seconds
```

**Pros:**
- Best of both worlds
- Static pages cached, API routes dynamic
- Good performance

**Cons:**
- Still requires Node.js hosting
- More complex configuration

### Follow-up (Phase 3)
- Decide where to deploy the Next.js portal (Vercel/Netlify/self-host) if you want a hosted environment.

### Alternative Quick Fix (If GitHub Pages Required)
If GitHub Pages deployment is mandatory:

1. Add `export const dynamic = 'error'` to all API routes
2. Move API logic to separate backend service
3. Update frontend to call external API
4. Keep `output: 'export'` for GitHub Pages deployment

## Testing Recommendations

After choosing a solution:

1. **Local Testing:**
   ```bash
   cd apps/unifiedtoolbox.webapp
   npm run build
   npm run start  # Test production build locally
   ```

2. **Verify All Features:**
   - API endpoints work
   - Authentication flows
   - Data persistence
   - Real-time features

3. **Performance Testing:**
   - Page load times
   - API response times
   - Bundle sizes

## Summary

✅ **Completed:** All TypeScript errors fixed, comprehensive workflow guards added  
⚠️  **Pending Decision:** Next.js deployment strategy (static vs. dynamic)  
📋 **Next Steps:** Choose deployment approach and update configuration accordingly

---

## Files Modified

### TypeScript Fixes
- `apps/unifiedtoolbox.webapp/src/app/milestones/components/ScatterPanel.tsx`
- `apps/unifiedtoolbox.webapp/src/app/orchestrator/page.tsx`
- `apps/unifiedtoolbox.webapp/src/app/prompts/page.tsx`
- `apps/unifiedtoolbox.webapp/src/lib/services/promptImport.ts`
- `apps/unifiedtoolbox.webapp/src/lib/data/starterPrompts.ts`

### Workflow Improvements
- `.github/workflows/ci-comprehensive.yml`
- `.github/workflows/lint-test-build.yml`
- `.github/workflows/nextjs.yml`
