# Secrets and Environment Variables

This document describes all secrets and environment variables required for the CI/CD blueprint.

## 🔐 GitHub Secrets

Secrets are stored in GitHub repository settings and never exposed in logs.

### Adding Secrets

**Via GitHub UI:**
1. Go to your repository on GitHub
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add name and value
5. Click **Add secret**

**Via GitHub CLI:**
```bash
gh secret set SECRET_NAME
# Paste value when prompted
```

## Required Secrets

### OPENAI_API_KEY (Optional - for AI Insights)

**When needed:** Only if using AI-powered summary generation

**How to get:**
1. Sign up at [OpenAI](https://platform.openai.com/)
2. Go to [API Keys](https://platform.openai.com/api-keys)
3. Create a new API key
4. Copy the key (you won't see it again!)

**Add to GitHub:**
```bash
gh secret set OPENAI_API_KEY
# Paste your key: sk-...
```

**Usage in workflows:**
```yaml
env:
  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

**Cost considerations:**
- The template uses `gpt-4o-mini` by default (cheapest model)
- Typical analysis summary: ~$0.01-0.05 per run
- Monitor usage in OpenAI dashboard

## Optional Secrets

### GITHUB_TOKEN (Auto-provided)

**When needed:** Automatically provided by GitHub Actions

**Purpose:** Access GitHub API, upload artifacts, create issues

**No action required** - GitHub provides this automatically as `${{ secrets.GITHUB_TOKEN }}`

**Permissions:**
```yaml
permissions:
  contents: read
  issues: write      # If creating issues
  pull-requests: write  # If commenting on PRs
```

### CODECOV_TOKEN (Optional)

**When needed:** If integrating with Codecov for code coverage

**How to get:**
1. Sign up at [Codecov](https://codecov.io/)
2. Link your repository
3. Copy the upload token

**Add to GitHub:**
```bash
gh secret set CODECOV_TOKEN
```

### NPM_TOKEN (Optional)

**When needed:** If publishing to npm or using private npm packages

**How to get:**
1. Login to npm: `npm login`
2. Create token: `npm token create`

**Add to GitHub:**
```bash
gh secret set NPM_TOKEN
```

### NUGET_API_KEY (Optional)

**When needed:** If publishing .NET packages to NuGet

**How to get:**
1. Sign in to [NuGet.org](https://www.nuget.org/)
2. Go to API Keys section
3. Create a new key

**Add to GitHub:**
```bash
gh secret set NUGET_API_KEY
```

## Environment Variables

Environment variables configure workflow behavior without being secrets.

### Setting Environment Variables

**Workflow level:**
```yaml
env:
  NODE_VERSION: '20'
  PYTHON_VERSION: '3.11'
```

**Job level:**
```yaml
jobs:
  build:
    env:
      BUILD_CONFIG: 'Release'
```

**Step level:**
```yaml
- name: Build
  env:
    DEBUG: 'true'
  run: npm run build
```

## Common Environment Variables

### OPENAI_MODEL

**Purpose:** Specify AI model for summaries

**Default:** `gpt-4o-mini`

**Options:**
- `gpt-4o-mini` - Cheapest, fast (recommended)
- `gpt-4o` - More capable, more expensive
- `gpt-3.5-turbo` - Legacy, being phased out

**Set in workflow:**
```yaml
env:
  OPENAI_MODEL: 'gpt-4o-mini'
```

### OPENAI_API_ENDPOINT

**Purpose:** Override OpenAI API endpoint (for Azure OpenAI or proxies)

**Default:** `https://api.openai.com/v1`

**Azure OpenAI example:**
```yaml
env:
  OPENAI_API_ENDPOINT: 'https://your-resource.openai.azure.com'
  OPENAI_API_KEY: ${{ secrets.AZURE_OPENAI_KEY }}
```

### Artifact Retention

**Purpose:** How long to keep workflow artifacts

**Default:** 30-90 days (varies by workflow)

**Set in workflow:**
```yaml
- name: Upload artifacts
  uses: actions/upload-artifact@v4
  with:
    retention-days: 90  # 1-90 days, or 400 for enterprise
```

## Security Best Practices

### ✅ Do

- **Store all sensitive data as secrets**
- **Use secrets for:** API keys, tokens, passwords, certificates
- **Rotate secrets regularly** (every 90 days recommended)
- **Use least-privilege access** - only grant necessary permissions
- **Review secret usage** in workflow runs
- **Use repository secrets** for repo-specific values
- **Use environment secrets** for deployment-specific values
- **Use organization secrets** for shared values across repos

### ❌ Don't

- **Never commit secrets to code**
- **Never echo secrets** in workflow logs
- **Never use secrets in pull requests** from forks (GitHub blocks this)
- **Don't share secrets** between unrelated projects
- **Don't use secrets for non-sensitive config** (use env vars instead)

## Secret Rotation

When rotating secrets:

1. **Create new secret** with temporary name
2. **Update workflows** to use new secret
3. **Test workflows** with new secret
4. **Delete old secret**
5. **Rename new secret** to original name (if desired)

## Validating Configuration

### Check Secrets

You cannot view secret values, but you can check if they exist:

```yaml
- name: Check secrets
  run: |
    if [ -z "${{ secrets.OPENAI_API_KEY }}" ]; then
      echo "⚠️ OPENAI_API_KEY not set"
    else
      echo "✓ OPENAI_API_KEY is set"
    fi
```

### Test API Keys

```yaml
- name: Test OpenAI connection
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  run: |
    pwsh scripts/ai-insights/Test-AIConnection.ps1
```

## Troubleshooting

### "Secret not found" Error

**Cause:** Secret doesn't exist or is misspelled

**Solution:**
1. Check secret name matches exactly (case-sensitive)
2. Verify secret exists in repository settings
3. Check you're in the right repository
4. Ensure secret isn't in a different environment

### "Permission denied" Error

**Cause:** GITHUB_TOKEN lacks required permissions

**Solution:**
Add permissions to workflow:
```yaml
permissions:
  contents: read
  issues: write
```

### API Key Authentication Failures

**Cause:** Invalid or expired API key

**Solution:**
1. Verify key is correct and not truncated
2. Check key hasn't been revoked
3. Ensure key has necessary permissions
4. Test key manually outside of GitHub Actions

### Secrets Not Available in PR from Fork

**Cause:** GitHub security restriction

**Solution:** This is intentional for security. Options:
1. Don't use secrets in PR workflows
2. Use `pull_request_target` (with extreme caution!)
3. Require PR from branches, not forks

## Required vs Optional Summary

| Secret/Variable | Required | Purpose | Alternative |
|----------------|----------|---------|-------------|
| `OPENAI_API_KEY` | No | AI summaries | Skip AI features |
| `GITHUB_TOKEN` | Auto | GitHub API | N/A (provided by GitHub) |
| `CODECOV_TOKEN` | No | Code coverage | Use artifacts only |
| `NPM_TOKEN` | No | npm publish | Don't publish |
| `NUGET_API_KEY` | No | NuGet publish | Don't publish |

## Next Steps

1. **Add required secrets** (if using AI insights)
2. **Configure optional secrets** (for integrations)
3. **Test workflows** to ensure secrets work
4. **Document** any project-specific secrets

---

**Need help?** See the [Customization Guide](CUSTOMIZATION_GUIDE.md) or check [GitHub's secrets documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets).
