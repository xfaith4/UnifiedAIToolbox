# Workflows

Purpose: Explain GitHub Actions workflows and local equivalents.

## Available workflows
- **CI - Comprehensive** (`ci-comprehensive.yml`)
- **Repository Analysis - Scheduled** (`repo-analysis-scheduled.yml`)
- **Legacy** (`lint-test-build.yml`)

## Run workflows
Via GitHub UI or CLI:
```bash
gh workflow run ci-comprehensive.yml
```

## Artifacts
Artifacts are attached to workflow runs in GitHub Actions:
- build outputs
- analysis reports
- logs

## Local testing
```powershell
Install-Module Pester, PSScriptAnalyzer, powershell-yaml -Force
Invoke-Pester -Path tests -Output Detailed
```

```bash
cd apps/UnifiedPromptApp/services/prompt-api
pytest -v
```

```bash
cd apps/dashboard
npm run lint
npm test
npm run build
```

## Customization
Edit `.github/workflows/*.yml` to add jobs, adjust schedules, or update artifact retention.

## Troubleshooting
- Check workflow logs in the Actions tab.
- Validate dependencies and tool versions locally.

## Related docs
- [Telemetry](telemetry.md)
- [Cost analytics](cost-analytics.md)
