# CI/CD Blueprint Customization Guide

This guide walks you through customizing the CI/CD blueprint for your project.

## 📝 Table of Contents

- [Before You Start](#before-you-start)
- [Step-by-Step Customization](#step-by-step-customization)
- [Tech Stack Specific Guides](#tech-stack-specific-guides)
- [Common Scenarios](#common-scenarios)
- [Troubleshooting](#troubleshooting)

## Before You Start

### Prerequisites

- GitHub repository with Actions enabled
- Basic understanding of YAML and PowerShell
- Knowledge of your project's build/test process

### Dry Run Checklist

Before copying files, answer these questions:

1. **What languages/frameworks does your project use?**
   - PowerShell? Python? Node.js? .NET? Go? Java?
   
2. **What are your build commands?**
   - `npm run build`? `dotnet build`? `make`?
   
3. **What are your test commands?**
   - `npm test`? `pytest`? `dotnet test`?
   
4. **What platforms do you need to support?**
   - Linux only? Windows only? Both?
   
5. **What artifacts should be saved?**
   - Build outputs? Test reports? Coverage data?

## Step-by-Step Customization

### Step 1: Copy Template Files

```bash
# Create necessary directories
mkdir -p .github/workflows scripts/

# Copy workflow templates
cp templates/ci-cd-blueprint/workflows/*.yml .github/workflows/

# Copy script templates
cp templates/ci-cd-blueprint/scripts/*.ps1 scripts/
```

### Step 2: Replace Placeholders

Use find-and-replace to update all placeholders:

```bash
# Find all occurrences
grep -r "{{PROJECT_NAME}}" .github/workflows/ scripts/

# Replace (Linux/Mac)
find .github/workflows scripts -type f -exec sed -i 's/{{PROJECT_NAME}}/YourProjectName/g' {} +

# Replace (Windows PowerShell)
Get-ChildItem -Path .github/workflows, scripts -Recurse -File | 
  ForEach-Object {
    (Get-Content $_.FullName) -replace '{{PROJECT_NAME}}', 'YourProjectName' | 
    Set-Content $_.FullName
  }
```

**Placeholders to replace:**

| Placeholder | Description | Example |
|------------|-------------|---------|
| `{{PROJECT_NAME}}` | Your project name | `MyProject` |
| `{{BUILD_SCRIPT}}` | Build script path | `scripts/Build.ps1` |
| `{{ANALYSIS_SCRIPT}}` | Analysis script | `scripts/Run-RepoAnalysis.ps1` |

### Step 3: Customize Workflows

#### Option A: Start Minimal

Remove everything except the basics:

```yaml
# Keep only these jobs in ci-comprehensive.yml
jobs:
  build:
    # Your primary build job
  
  test:
    # Your primary test job
  
  ci-summary:
    # Summary job
```

Then gradually add more jobs as needed.

#### Option B: Adapt Existing Jobs

For each job in the template:

1. **Keep it** - If it matches your tech stack
2. **Modify it** - If it's close but needs adjustments
3. **Remove it** - If it's not relevant

### Step 4: Update Matrix Configurations

Adjust matrix builds for your needs:

```yaml
# Example: Only need Linux + Python 3.11 and 3.12
strategy:
  matrix:
    os: [ubuntu-latest]
    python-version: ['3.11', '3.12']
```

### Step 5: Customize Artifact Paths

Update artifact upload paths:

```yaml
- name: Upload artifacts
  uses: actions/upload-artifact@v4
  with:
    name: my-build
    path: |
      build/output/
      dist/
      *.log
```

### Step 6: Adjust Retention and Schedules

```yaml
# Artifact retention
retention-days: 30  # Change to 7, 30, 90, or 365

# Schedule (cron format)
schedule:
  - cron: '0 6 * * *'  # Daily at 6 AM UTC
  # - cron: '0 9 * * 1'  # Weekly on Monday at 9 AM UTC
```

## Tech Stack Specific Guides

### Python Projects

```yaml
- name: Setup Python
  uses: actions/setup-python@v5
  with:
    python-version: '3.11'

- name: Install dependencies
  run: |
    pip install -r requirements.txt
    pip install pytest pytest-cov

- name: Run tests
  run: |
    pytest --cov=. --cov-report=xml
```

### Node.js/TypeScript Projects

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'

- name: Install and test
  run: |
    npm ci
    npm run lint
    npm test
    npm run build
```

### .NET Projects

```yaml
- name: Setup .NET
  uses: actions/setup-dotnet@v4
  with:
    dotnet-version: '8.0'

- name: Build and test
  run: |
    dotnet restore
    dotnet build --configuration Release
    dotnet test --configuration Release --no-build
```

### Go Projects

```yaml
- name: Setup Go
  uses: actions/setup-go@v4
  with:
    go-version: '1.21'

- name: Build and test
  run: |
    go mod download
    go build -v ./...
    go test -v ./...
```

### Monorepo Projects

For monorepos, add path filters:

```yaml
on:
  push:
    paths:
      - 'apps/my-app/**'
      - 'packages/shared/**'
```

And adjust working directories:

```yaml
- name: Build app
  working-directory: apps/my-app
  run: npm run build
```

## Common Scenarios

### Scenario 1: Simple Node.js Project

**Goal:** Basic CI for a Node.js app

**Steps:**
1. Keep only `nodejs-build` job from `ci-comprehensive.yml`
2. Remove PowerShell, Python, and .NET jobs
3. Adjust Node.js version if needed
4. Update artifact paths to match your build output

**Result:** Minimal CI that installs, tests, and builds your Node.js app.

### Scenario 2: Python + React Full-Stack App

**Goal:** CI for both backend (Python) and frontend (React)

**Steps:**
1. Keep `python-tests` and `nodejs-build` jobs
2. Add parallel execution (jobs run simultaneously)
3. Create separate artifact uploads for backend and frontend
4. Add integration tests that depend on both jobs

**Result:** Parallel CI for backend and frontend with separate artifacts.

### Scenario 3: Monorepo with Multiple Apps

**Goal:** Selective CI based on changed files

**Steps:**
1. Add path filters to workflow triggers
2. Use job conditionals based on changed paths
3. Create separate workflows for each app
4. Share common setup steps using composite actions

**Result:** Efficient CI that only builds/tests affected apps.

### Scenario 4: Add Code Coverage Reports

**Goal:** Generate and upload code coverage

**Steps:**
1. Install coverage tool (pytest-cov, jest, etc.)
2. Generate coverage in XML/HTML format
3. Upload as artifact
4. Optional: Integrate with Codecov or Coveralls

```yaml
- name: Generate coverage
  run: pytest --cov=. --cov-report=xml --cov-report=html

- name: Upload coverage
  uses: actions/upload-artifact@v4
  with:
    name: coverage-report
    path: htmlcov/
```

## Troubleshooting

### Workflow Not Triggering

**Problem:** Workflow doesn't run when expected

**Solutions:**
- Check branch names in `on.push.branches`
- Verify path filters aren't too restrictive
- Ensure workflow file is in `.github/workflows/`
- Check workflow file YAML syntax (use a validator)

### Jobs Failing

**Problem:** Jobs fail with errors

**Solutions:**
- Check job logs in GitHub Actions UI
- Verify commands work locally first
- Check file paths and working directories
- Ensure all dependencies are installed
- Validate environment variables and secrets

### Artifacts Not Uploading

**Problem:** Artifact upload fails or files not found

**Solutions:**
- Verify artifact paths exist after build
- Use `if-no-files-found: warn` to debug
- Check working directory vs artifact path
- Use wildcard patterns carefully

### Slow Workflow Execution

**Problem:** Workflows take too long

**Solutions:**
- Enable caching (npm, pip, etc.)
- Use matrix parallelization
- Reduce test scope for quick feedback
- Split into separate workflows
- Use self-hosted runners for better performance

### Placeholder Not Replaced

**Problem:** Workflows still contain `{{PLACEHOLDER}}`

**Solutions:**
- Re-run find-and-replace
- Check case sensitivity
- Manually search for remaining placeholders
- Validate with: `grep -r "{{" .github/workflows/`

## Next Steps

After customization:

1. **Test locally** - Run scripts manually to verify
2. **Push to feature branch** - Test in CI without affecting main
3. **Review workflow runs** - Check logs and artifacts
4. **Iterate** - Adjust based on failures
5. **Document** - Add project-specific notes to README

## Need Help?

- **Template Issues:** Check the main template README
- **GitHub Actions:** See [GitHub Actions documentation](https://docs.github.com/en/actions)
- **PowerShell:** See [PowerShell documentation](https://docs.microsoft.com/en-us/powershell/)

---

**Ready to customize?** Start with [Step 1: Copy Template Files](#step-1-copy-template-files).
