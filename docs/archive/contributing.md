# Contributing

Purpose: Provide contributor guidelines, setup, and PR expectations.

## Code of conduct
- Be respectful and inclusive
- Focus on constructive feedback
- Maintain professionalism in all interactions

## Getting started
1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR-USERNAME/UnifiedAIToolbox.git
   cd UnifiedAIToolbox
   ```
3. Add upstream remote:
   ```bash
   git remote add upstream https://github.com/xfaith4/UnifiedAIToolbox.git
   ```
4. Create a branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development setup
Prereqs:
- Node.js 18+
- Python 3.12+
- PowerShell 7.4+ (for PowerShell modules)
- .NET 8 SDK (desktop app, if relevant)

Install dependencies:
```bash
cd apps/dashboard
npm install
```

```bash
cd apps/UnifiedPromptApp/services/prompt-api
python -m pip install -r requirements.txt
python -m pip install -r requirements-dev.txt
```

## Testing
```bash
cd apps/dashboard
npm test
```

```bash
cd apps/UnifiedPromptApp/services/prompt-api
pytest
```

```powershell
pwsh tests/Schema.Tests.ps1
```

## Documentation
Update docs when you add features or change behavior:
- Keep docs in `docs/` consistent and cross-linked.
- Prefer canonical docs over new one-off files.

## Pull request process
1. Rebase on `upstream/main`
2. Run relevant tests
3. Update docs if needed
4. Use conventional commits (`feat:`, `fix:`, `docs:`)

## Related docs
- [Getting started](getting-started.md)
- [Workflows](workflows.md)
