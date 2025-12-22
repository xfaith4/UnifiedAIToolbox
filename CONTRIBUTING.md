# Contributing to Unified AI Toolbox

Thank you for your interest in contributing to the Unified AI Toolbox! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct:

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Prioritize the project's best interests
- Maintain professionalism in all interactions

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/UnifiedAIToolbox.git
   cd UnifiedAIToolbox
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/xfaith4/UnifiedAIToolbox.git
   ```
4. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Setup

### Prerequisites

Install the required tools:
- Node.js 18+ and npm
- Python 3.12+ and pip
- PowerShell 7.4+ (for PowerShell modules)
- .NET 8 SDK (for desktop app)

### Install Dependencies

**Dashboard (React/Vite):**
```bash
cd apps/dashboard
npm install
```

**API Service (Python):**
```bash
cd services/prompt-api
python -m pip install -r requirements.txt
python -m pip install -r requirements-dev.txt  # For testing
```

**PowerShell Modules:**
```powershell
# Import the module to test
Import-Module ./modules/PromptLibrary/PromptLibrary.psm1 -Force
```

### Running Tests

**JavaScript/TypeScript:**
```bash
cd apps/dashboard
npm test
```

**Python:**
```bash
cd services/prompt-api
pytest
```

**PowerShell:**
```powershell
pwsh tests/Schema.Tests.ps1
```

## How to Contribute

### Reporting Bugs

When reporting bugs, please include:
- Clear, descriptive title
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details (OS, versions, etc.)
- Screenshots or logs if applicable

Use the [GitHub Issues](https://github.com/xfaith4/UnifiedAIToolbox/issues) page.

### Suggesting Enhancements

For feature requests:
- Check if the feature already exists or has been requested
- Explain the problem your feature solves
- Describe the proposed solution
- Consider alternative approaches
- Note any potential drawbacks

### Contributing Code

1. **Find or create an issue** to work on
2. **Comment on the issue** to claim it
3. **Create a feature branch** from `main`
4. **Make your changes** following our coding standards
5. **Write tests** for your changes
6. **Update documentation** as needed
7. **Test thoroughly** before submitting
8. **Submit a pull request**

## Coding Standards

### General Principles

- Write clear, readable code
- Follow existing code style
- Keep functions small and focused
- Comment complex logic
- Use meaningful variable names

### TypeScript/JavaScript

- Use TypeScript for type safety
- Follow ESLint rules
- Use functional components and hooks in React
- Prefer `const` over `let`, avoid `var`
- Use meaningful component and function names

**Example:**
```typescript
// Good
const fetchPrompts = async (query: string): Promise<Prompt[]> => {
  const response = await fetch(`/api/prompts?q=${query}`)
  return response.json()
}

// Avoid
var getStuff = function(q) {
  // unclear what this does
  return fetch('/api/prompts?q=' + q).then(r => r.json())
}
```

### Python

- Follow PEP 8 style guide
- Use type hints
- Write docstrings for functions and classes
- Use `black` for formatting
- Use `flake8` for linting

**Example:**
```python
# Good
def search_prompts(query: str, limit: int = 50) -> list[dict]:
    """
    Search for prompts matching the query.
    
    Args:
        query: Search query string
        limit: Maximum number of results
        
    Returns:
        List of prompt dictionaries
    """
    # Implementation
    pass
```

### PowerShell

- Use approved verbs for function names
- Follow PowerShell best practices
- Use parameter validation
- Write comment-based help
- Use `PSScriptAnalyzer` for linting

**Example:**
```powershell
# Good
function Get-Prompt {
    <#
    .SYNOPSIS
    Retrieves a prompt by ID.
    
    .PARAMETER PromptId
    The unique identifier of the prompt.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$PromptId
    )
    
    # Implementation
}
```

### C# (.NET/WPF)

- Follow Microsoft C# coding conventions
- Use meaningful names
- Implement proper error handling
- Use async/await for I/O operations
- Follow MVVM pattern for WPF

## Testing Guidelines

### Test Coverage

- Aim for >70% code coverage
- Write tests for new features
- Write tests when fixing bugs
- Test edge cases and error conditions

### Test Structure

**JavaScript/TypeScript (Vitest):**
```typescript
describe('PromptStore', () => {
  it('should fetch prompts from API', async () => {
    const prompts = await promptStore.fetchPrompts()
    expect(prompts).toHaveLength(5)
  })
  
  it('should handle API errors', async () => {
    mockApi.error()
    await expect(promptStore.fetchPrompts()).rejects.toThrow()
  })
})
```

**Python (pytest):**
```python
def test_search_prompts():
    """Test prompt search functionality."""
    results = search_prompts("test query", limit=10)
    assert len(results) <= 10
    assert all("test" in r["content"].lower() for r in results)
```

**PowerShell (Pester):**
```powershell
Describe "Get-Prompt" {
    It "Returns a prompt object" {
        $prompt = Get-Prompt -PromptId "test_123"
        $prompt | Should -Not -BeNullOrEmpty
        $prompt.Id | Should -Be "test_123"
    }
}
```

## Documentation

### Code Documentation

- Add comments for complex logic
- Write docstrings/XML docs for public APIs
- Keep comments up-to-date with code changes

### User Documentation

When adding features, update:
- README.md (if relevant to quick start)
- docs/help/ documentation files
- API reference (if adding API endpoints)
- In-app help text

### Markdown Style

- Use clear, concise language
- Include code examples
- Add headings for organization
- Use lists for sequential steps
- Include links to related docs

## Pull Request Process

### Before Submitting

1. **Sync with upstream**:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run all tests**:
   ```bash
   npm test  # In each app directory
   pytest    # In Python directories
   pwsh tests/*.Tests.ps1  # PowerShell tests
   ```

3. **Check linting**:
   ```bash
   npm run lint  # JavaScript/TypeScript
   flake8       # Python
   Invoke-ScriptAnalyzer  # PowerShell
   ```

4. **Update documentation** if needed

5. **Commit with clear messages**:
   ```bash
   git commit -m "feat: add prompt search filter"
   git commit -m "fix: resolve authentication token expiry"
   git commit -m "docs: update deployment guide"
   ```

### Commit Message Convention

Use conventional commits format:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

### Pull Request Template

When creating a PR, include:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe testing performed

## Checklist
- [ ] Code follows project style
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] All tests pass
- [ ] No linting errors
```

### Review Process

1. **Automated checks** must pass (CI/CD)
2. **Code review** by maintainer(s)
3. **Address feedback** and update PR
4. **Approval and merge** by maintainer

## Questions?

- Check existing [documentation](docs/help/)
- Search [GitHub Issues](https://github.com/xfaith4/UnifiedAIToolbox/issues)
- Start a [GitHub Discussion](https://github.com/xfaith4/UnifiedAIToolbox/discussions)

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (MIT License).

---

Thank you for contributing to the Unified AI Toolbox! 🎉
