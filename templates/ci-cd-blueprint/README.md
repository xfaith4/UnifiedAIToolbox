# CI/CD Blueprint Template

> **Reusable CI/CD workflows and automation patterns extracted from the Unified AI Toolbox**

This blueprint provides battle-tested GitHub Actions workflows, PowerShell orchestration scripts, and artifact management patterns that can be adapted to any repository.

## 🎯 What This Template Provides

### ✅ Core Features

- **Multi-platform CI** - Cross-platform builds (Ubuntu + Windows)
- **Scheduled Repository Analysis** - Automated daily health checks
- **Artifact Management** - Standardized collection and storage
- **PowerShell Orchestration** - Cross-platform scripting patterns
- **Telemetry & Metrics** - Usage tracking and analytics
- **AI-Assisted Insights** - Optional AI-powered analysis summaries

### 📦 Included Templates

```
ci-cd-blueprint/
├── workflows/
│   ├── ci-comprehensive.yml          # Multi-platform CI pipeline
│   └── repo-analysis-scheduled.yml   # Scheduled health checks
├── scripts/
│   └── Run-RepoAnalysis.ps1          # Repository analysis template
├── docs/
│   ├── CUSTOMIZATION_GUIDE.md        # Step-by-step customization
│   └── SECRETS_AND_ENV.md            # Required configuration
└── README.md                          # This file
```

## 🚀 Quick Start

### 1. Copy Template Files

```bash
# From the Unified AI Toolbox repository
cp -r templates/ci-cd-blueprint/.github/workflows/* .github/workflows/
cp -r templates/ci-cd-blueprint/scripts/* scripts/
```

### 2. Replace Placeholders

Search and replace these placeholders throughout the copied files:

| Placeholder | Replace With | Example |
|------------|--------------|---------|
| `{{PROJECT_NAME}}` | Your project/repo name | `MyAwesomeProject` |
| `{{BUILD_SCRIPT}}` | Your build script path | `scripts/Build.ps1` |
| `{{ANALYSIS_SCRIPT}}` | Your analysis script path | `scripts/Run-RepoAnalysis.ps1` |

### 3. Customize for Your Tech Stack

The templates include examples for:
- PowerShell
- Python
- Node.js/TypeScript
- .NET/C#

**Remove** jobs and steps that don't apply to your project.  
**Modify** commands to match your build/test tools.

### 4. Configure Secrets

Add these secrets to your GitHub repository:

#### Required (if using AI insights):
- `OPENAI_API_KEY` - OpenAI API key for AI-powered summaries

#### Optional:
- `GITHUB_TOKEN` - Automatically provided by GitHub Actions

See [SECRETS_AND_ENV.md](docs/SECRETS_AND_ENV.md) for detailed configuration.

### 5. Test Your Workflows

```bash
# Trigger a manual workflow run
gh workflow run ci-comprehensive.yml

# Or push to a feature branch
git checkout -b feature/test-ci
git push origin feature/test-ci
```

## 📋 Customization Checklist

Use this checklist when adapting the template:

### Workflows

- [ ] Replace `{{PROJECT_NAME}}` with your project name
- [ ] Update PowerShell/Python/Node.js versions to match your requirements
- [ ] Adjust matrix configurations (OS, language versions)
- [ ] Modify artifact retention days (default: 30-90 days)
- [ ] Update cron schedules for scheduled workflows
- [ ] Remove unused jobs (e.g., .NET build if not applicable)

### Scripts

- [ ] Customize `Run-RepoAnalysis.ps1` for your tech stack
- [ ] Add/remove analysis sections based on your needs
- [ ] Update health score calculations
- [ ] Adjust file paths and patterns

### Artifacts

- [ ] Define artifact output directories (default: `./artifacts/`)
- [ ] Configure artifact naming conventions
- [ ] Set appropriate retention periods

### Telemetry (Optional)

- [ ] Review telemetry event types
- [ ] Customize telemetry metadata
- [ ] Configure telemetry sink (default: JSONL files)

### AI Insights (Optional)

- [ ] Set `OPENAI_API_KEY` environment variable
- [ ] Customize AI prompt templates in `scripts/ai-insights/prompts/`
- [ ] Adjust AI model and parameters

## 🏗️ Architecture Patterns

### Artifact Layout

The template follows a standardized artifact structure:

```
artifacts/
├── builds/           # Compiled outputs
├── reports/          # Analysis and health reports
├── logs/             # Build and runtime logs
├── packages/         # Packaged artifacts
└── telemetry/        # Usage metrics (JSONL files)
```

### Workflow Organization

Workflows are organized by purpose:

- **CI workflows** - Run on push/PR, validate changes
- **Scheduled workflows** - Run on schedule, monitor health
- **Manual workflows** - Run on demand, flexible parameters

### PowerShell Orchestration

PowerShell scripts provide cross-platform orchestration:

- Compatible with PowerShell 5.1+ and 7.4+
- Use `pwsh` for cross-platform scripts
- Error handling with `$ErrorActionPreference`
- Colored output for better readability

## 🔧 Advanced Customization

### Adding New Analysis Types

1. Create a new analysis function in `Run-RepoAnalysis.ps1`
2. Add the analysis to the appropriate section (full/quick/security-only)
3. Update the health score calculation
4. Document in comments

### Integrating External Tools

The template is designed to integrate with external tools:

```powershell
# Example: Add ESLint analysis
- name: Run ESLint
  run: |
    npm run lint -- --format json > artifacts/code-metrics/eslint.json
```

### Custom Telemetry Events

Add custom telemetry events:

```powershell
Send-TelemetryEvent -EventType "CustomEvent" -Source "CI" -Metadata @{
    custom_field = "value"
}
```

## 📚 Additional Documentation

- **[CUSTOMIZATION_GUIDE.md](docs/CUSTOMIZATION_GUIDE.md)** - Detailed customization instructions
- **[SECRETS_AND_ENV.md](docs/SECRETS_AND_ENV.md)** - Environment variables and secrets
- **[EXAMPLES.md](docs/EXAMPLES.md)** - Real-world usage examples

## 🤔 FAQ

### Q: Can I use this with GitHub Enterprise?

**A:** Yes, the template works with GitHub Enterprise Server 3.x+. Adjust API endpoints if needed.

### Q: Do I need all the workflows?

**A:** No. Start with `ci-comprehensive.yml` and add `repo-analysis-scheduled.yml` if you want automated health checks.

### Q: Can I use this with other CI systems (GitLab, Azure DevOps)?

**A:** The workflows are GitHub Actions-specific, but the PowerShell scripts and patterns are portable. You'll need to translate the YAML syntax.

### Q: Is the AI integration required?

**A:** No. The AI-powered insights are completely optional. The core CI/CD functionality works without it.

### Q: How do I handle secrets?

**A:** Use GitHub Secrets (Settings → Secrets and variables → Actions). Never commit secrets to your repository.

## 🛠️ Maintenance

When updating your CI/CD setup:

1. **Document changes** - Keep comments up-to-date
2. **Test thoroughly** - Use feature branches to test workflow changes
3. **Version workflows** - Consider tagging workflow versions
4. **Monitor runs** - Check for failures and adjust timeouts/retries

## 📞 Support

For issues specific to this template:
- Review the [CUSTOMIZATION_GUIDE.md](docs/CUSTOMIZATION_GUIDE.md)
- Check the [Unified AI Toolbox discussions](https://github.com/xfaith4/UnifiedAIToolbox/discussions)

For issues with your adapted workflows:
- Check GitHub Actions logs
- Validate your customizations against the template
- Test in isolation (single job, single step)

## 📄 License

This template is part of the Unified AI Toolbox and is licensed under the MIT License.
You are free to use, modify, and distribute it as needed for your projects.

---

**Ready to set up CI/CD?** Start with the [Quick Start](#-quick-start) and follow the [Customization Checklist](#-customization-checklist).
