# GitHub Actions Workflow Guide

This guide explains how to use and customize the GitHub Actions workflows in the Unified AI Toolbox.

## Table of Contents

- [Overview](#overview)
- [Available Workflows](#available-workflows)
- [Running Workflows](#running-workflows)
- [Artifacts](#artifacts)
- [Local Testing](#local-testing)
- [Customization](#customization)
- [Troubleshooting](#troubleshooting)

## Overview

The Unified AI Toolbox uses GitHub Actions for:
- **Continuous Integration (CI)**: Automated testing, linting, and building on every push and PR
- **Scheduled Analysis**: Daily repository health checks and code quality metrics
- **Artifact Management**: Automated collection and storage of build outputs and reports

## Available Workflows

### 1. CI - Comprehensive (`ci-comprehensive.yml`)

**Triggers:**
- Push to `main` or `feature/**` or `dev/**` branches
- Pull requests to `main`
- Manual workflow dispatch

**Jobs:**
- **PowerShell**: Tests and lints PowerShell modules on Ubuntu and Windows
- **Python API**: Tests Python API with multiple Python versions (3.10, 3.11, 3.12)
- **Dashboard**: Builds and tests React/Vite dashboard
- **Unified Web App**: Builds and tests Next.js web application
- **Desktop App**: Builds .NET desktop applications (Windows only)
- **Smoke Tests**: Runs integration smoke tests
- **CI Summary**: Aggregates results and creates summary

**Artifacts Produced:**
- `prompt-index-{os}-{pwsh-version}`: Prompt database builds
- `python-coverage-report`: Python test coverage reports
- `dashboard-build`: Dashboard static files
- `unified-webapp-build`: Next.js build outputs
- `desktop-app-builds`: Compiled .NET executables

**Retention:** 30 days for build artifacts, 7 days for reports

### 2. Repository Analysis - Scheduled (`repo-analysis-scheduled.yml`)

**Triggers:**
- Daily at 6:00 AM UTC (via cron)
- Manual workflow dispatch with options

**Jobs:**
- **Repository Health Analysis**: Comprehensive repo health checks
- **Prompt Library Analysis**: Prompt and agent analysis
- **Code Quality Metrics**: Code complexity and maintainability analysis
- **Analysis Summary**: Aggregated results

**Artifacts Produced:**
- `repo-analysis-{run_number}`: JSON and HTML health reports
- `prompt-library-analysis-{run_number}`: Prompt library statistics
- `code-quality-metrics-{run_number}`: Code metrics and complexity reports

**Retention:** 90 days

### 3. CI - Lint, Test & Build (`lint-test-build.yml`)

Legacy workflow maintained for compatibility. Consider using `ci-comprehensive.yml` instead.

## Running Workflows

### Automatically

Workflows run automatically based on their triggers:

```bash
# CI runs on every push to main or feature branches
git push origin main

# CI runs on every pull request
git push origin feature/my-feature
gh pr create
```

### Manually

Run workflows manually via GitHub UI or CLI:

**Via GitHub UI:**
1. Go to **Actions** tab
2. Select the workflow
3. Click **Run workflow**
4. Choose branch and options
5. Click **Run workflow**

**Via GitHub CLI:**
```bash
# Run comprehensive CI
gh workflow run ci-comprehensive.yml

# Run scheduled analysis with options
gh workflow run repo-analysis-scheduled.yml \
  -f analysis_type=full \
  -f include_metrics=true
```

### Locally

While workflows are designed for GitHub Actions, you can test individual components locally:

**PowerShell Tests:**
```powershell
# Install dependencies
Install-Module Pester, PSScriptAnalyzer, powershell-yaml -Force

# Run tests
$env:PSModulePath = "$PWD/modules" + [IO.Path]::PathSeparator + $env:PSModulePath
Invoke-Pester -Path tests -Output Detailed
```

**Python Tests:**
```bash
cd Orchestration/UnifiedPromptApp/services/prompt-api
pip install -r requirements.txt
pip install -e .[dev]
pytest -v
```

**Dashboard Build:**
```bash
cd apps/dashboard
npm install
npm run lint
npm test
npm run build
```

**Repository Analysis:**
```powershell
# Run full analysis
pwsh scripts/Run-RepoAnalysis.ps1 -AnalysisType full -IncludeMetrics $true

# Generate HTML report
pwsh scripts/Convert-RepoAnalysisToHtml.ps1 -JsonPath artifacts/repo-analysis/report.json
```

## Artifacts

### Accessing Artifacts

**Via GitHub UI:**
1. Go to **Actions** tab
2. Click on a workflow run
3. Scroll to **Artifacts** section
4. Click artifact name to download

**Via GitHub CLI:**
```bash
# List artifacts for a run
gh run view {run-id}

# Download specific artifact
gh run download {run-id} -n artifact-name

# Download all artifacts
gh run download {run-id}
```

### Artifact Structure

Downloaded artifacts follow this structure:

```
artifacts/
├── builds/
│   ├── dashboard/           # Dashboard static files
│   ├── webapp/              # Next.js build
│   └── desktop/             # .NET executables
├── reports/
│   ├── repo-analysis/       # Repository health reports
│   └── prompt-analysis/     # Prompt library analysis
├── logs/                    # Build and runtime logs
└── packages/                # Packaged artifacts (databases, etc.)
```

### Using Artifacts

**Deploy Dashboard:**
```bash
# Extract and serve
unzip dashboard-build.zip
cd dist
npx serve .
```

**View Reports:**
```bash
# Extract reports
unzip repo-analysis-{run_number}.zip

# Open HTML report in browser
open UnifiedAIToolbox_RepoHealth_*.html
```

**Run Desktop App:**
```bash
# Extract Windows build
unzip desktop-app-builds.zip
cd OrchestrationDesktop/net8.0-windows
./OrchestrationDesktop.exe
```

## Local Testing

### Test Scripts Locally

Before committing, test scripts locally to catch issues early:

**PowerShell Linting:**
```powershell
# Install PSScriptAnalyzer
Install-Module PSScriptAnalyzer -Force

# Lint modules
Invoke-ScriptAnalyzer -Path modules -Recurse -Severity Warning
```

**Python Linting:**
```bash
cd Orchestration/UnifiedPromptApp/services/prompt-api
flake8 . --count --select=E9,F63,F7,F82 --show-source
```

**TypeScript Linting:**
```bash
cd apps/dashboard
npm run lint
```

### Collect Artifacts Locally

Test artifact collection before pushing:

```powershell
# Build everything first
cd apps/dashboard && npm run build
cd ../unifiedtoolbox.webapp && npm run build
cd ../..
dotnet build UnifiedAIToolbox.sln -c Release

# Collect artifacts
pwsh scripts/Collect-BuildArtifacts.ps1 -Clean -Manifest

# View manifest
cat artifacts/manifest.json | jq
```

### Run Repository Analysis

Test the analysis script locally:

```powershell
# Quick analysis
pwsh scripts/Run-RepoAnalysis.ps1 -AnalysisType quick

# Full analysis with metrics
pwsh scripts/Run-RepoAnalysis.ps1 -AnalysisType full -IncludeMetrics $true

# Generate HTML report
$jsonFile = Get-ChildItem artifacts/repo-analysis/*.json | Select-Object -First 1
pwsh scripts/Convert-RepoAnalysisToHtml.ps1 -JsonPath $jsonFile.FullName

# Open in browser
start $jsonFile.FullName.Replace('.json', '.html')
```

## Customization

### Add New CI Job

1. Edit `.github/workflows/ci-comprehensive.yml`
2. Add a new job:

```yaml
my-new-job:
  name: My New Job
  runs-on: ubuntu-latest
  steps:
    - name: Checkout
      uses: actions/checkout@v4
    
    - name: Setup environment
      run: |
        # Your setup commands
    
    - name: Run tests
      run: |
        # Your test commands
    
    - name: Upload artifacts
      uses: actions/upload-artifact@v4
      with:
        name: my-artifacts
        path: path/to/artifacts
```

3. Update CI summary to include new job:

```yaml
ci-summary:
  needs: [existing-jobs, my-new-job]
```

### Customize Analysis Schedule

Edit `.github/workflows/repo-analysis-scheduled.yml`:

```yaml
on:
  schedule:
    # Every 6 hours
    - cron: '0 */6 * * *'
    # Twice daily (6 AM and 6 PM UTC)
    - cron: '0 6,18 * * *'
    # Weekly on Monday
    - cron: '0 6 * * 1'
```

### Add Custom Analysis

1. Create a PowerShell script:

```powershell
# scripts/My-CustomAnalysis.ps1
param(
    [string]$OutputPath = "artifacts/custom-analysis/report.json"
)

# Your analysis logic
$analysis = @{
    timestamp = Get-Date -Format "o"
    custom_metric = 42
}

# Save results
$analysis | ConvertTo-Json | Out-File $OutputPath
```

2. Add to workflow:

```yaml
- name: Run custom analysis
  shell: pwsh
  run: |
    pwsh scripts/My-CustomAnalysis.ps1 -OutputPath artifacts/custom.json

- name: Upload custom analysis
  uses: actions/upload-artifact@v4
  with:
    name: custom-analysis
    path: artifacts/custom.json
```

### Customize Artifact Retention

Change retention periods in workflow files:

```yaml
- name: Upload artifacts
  uses: actions/upload-artifact@v4
  with:
    name: my-artifacts
    path: path/to/artifacts
    retention-days: 14  # Keep for 14 days
```

Options:
- Development: 7 days
- Standard builds: 30 days
- Important reports: 90 days
- Critical archives: 365 days (max)

## Troubleshooting

### Workflow Failures

**Check Logs:**
```bash
# View recent workflow runs
gh run list

# View specific run
gh run view {run-id}

# View logs
gh run view {run-id} --log
```

**Common Issues:**

1. **PowerShell Module Import Failures**
   - Ensure modules are in the correct path
   - Check PSModulePath is set correctly
   - Verify module dependencies are installed

2. **Python Test Failures**
   - Check Python version compatibility
   - Verify all dependencies in requirements.txt
   - Ensure test database migrations are applied

3. **Build Failures**
   - Check for missing dependencies
   - Verify node_modules or packages are cached correctly
   - Look for breaking changes in dependencies

4. **Artifact Upload Failures**
   - Verify paths exist before upload
   - Check file permissions
   - Ensure artifact size is under GitHub's limit (10GB per artifact)

### Local Script Failures

**PowerShell Execution Policy:**
```powershell
# If scripts won't run
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process

# Or run with bypass
pwsh -ExecutionPolicy Bypass -File script.ps1
```

**Missing Dependencies:**
```powershell
# Install all PowerShell dependencies
Install-Module Pester, PSScriptAnalyzer, powershell-yaml -Force

# Install Python dependencies
pip install -r requirements.txt -e .[dev]

# Install Node dependencies
npm install
```

**Path Issues:**
```powershell
# Set PSModulePath
$env:PSModulePath = "$PWD/modules" + [IO.Path]::PathSeparator + $env:PSModulePath

# Verify modules can be found
Get-Module -ListAvailable
```

### Getting Help

1. **Check Workflow Logs**: Most issues are visible in workflow logs
2. **Review Documentation**: Check related docs for specific features
3. **Test Locally**: Reproduce issues locally before debugging in CI
4. **GitHub Actions Docs**: [GitHub Actions Documentation](https://docs.github.com/en/actions)
5. **Open an Issue**: Report persistent problems on the repository

## Best Practices

### Workflow Development

1. **Test Locally First**: Always test scripts locally before pushing
2. **Use Small Commits**: Test changes incrementally
3. **Check Artifacts**: Verify artifacts are created correctly
4. **Monitor Usage**: Keep an eye on GitHub Actions minutes usage
5. **Optimize Caching**: Use dependency caching to speed up workflows

### Artifact Management

1. **Clean Old Artifacts**: Manually delete old artifacts to save storage
2. **Appropriate Retention**: Set retention based on artifact importance
3. **Compress Large Files**: Zip large artifacts before upload
4. **Document Artifacts**: Include README in artifact directories

### Security

1. **Use Secrets**: Never hardcode credentials in workflows
2. **Limit Permissions**: Use minimal required permissions
3. **Review Dependencies**: Regularly update and audit dependencies
4. **Verify Signatures**: Use signature verification for webhooks

## Related Documentation

- [Webhook Setup Guide](WEBHOOK_SETUP.md)
- [Repository Analysis Scripts](../scripts/)
- [CI Workflows](../.github/workflows/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
