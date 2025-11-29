# Testing Guide
## Unified AI Toolbox

**Version**: 1.5 (Enterprise Ready)  
**Last Updated**: November 2025

---

## Overview

This guide covers the testing infrastructure and practices for the Unified AI Toolbox. The project uses multiple testing frameworks across different technologies:

| Component | Framework | Location |
|-----------|-----------|----------|
| Dashboard | Vitest + Testing Library | `apps/dashboard/src/__tests__/` |
| API | Pytest | `Orchestration/UnifiedPromptApp/services/prompt-api/` |
| PowerShell | Pester | `tests/` |
| Integration | Bash/PowerShell | `scripts/` |

## Running Tests

### Quick Start

```bash
# Dashboard tests
cd apps/dashboard && npm run test

# API tests
cd Orchestration/UnifiedPromptApp/services/prompt-api && pytest

# PowerShell tests
pwsh tests/Schema.Tests.ps1
```

### CI/CD Pipeline

Tests run automatically on:
- Pull request creation
- Push to `main` branch

See `.github/workflows/ci.yml` for configuration.

---

## Dashboard Testing (Vitest)

### Setup

Tests are configured in `vite.config.ts`:

```typescript
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: './src/__tests__/setup.ts',
    globals: true,
  },
})
```

### Running Tests

```bash
cd apps/dashboard

# Run all tests once
npm run test

# Watch mode (re-runs on file changes)
npm run test:watch

# With coverage
npm run test -- --coverage

# With UI
npm run test -- --ui
```

### Test Structure

```
src/__tests__/
├── setup.ts           # Test setup (jest-dom matchers)
├── smoke.test.ts      # Basic data structure tests
├── promptStore.test.ts # Prompt store logic tests
└── agentStore.test.ts  # Agent store logic tests
```

### Writing Tests

**Unit test example:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { normalizePrompt, nowIso } from '../services/promptStore'

describe('promptStore', () => {
  describe('nowIso', () => {
    it('returns ISO date string', () => {
      const result = nowIso()
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })
  })

  describe('normalizePrompt', () => {
    it('sets default values for minimal input', () => {
      const result = normalizePrompt({
        id: 'test-id',
        title: 'Test Title',
        template: 'Hello {{name}}',
      })

      expect(result.role).toBe('system')
      expect(result.temperature).toBe(0.2)
      expect(result.tags).toEqual([])
    })

    it('preserves provided values', () => {
      const result = normalizePrompt({
        id: 'test-id',
        title: 'Test',
        template: 'Hello',
        role: 'user',
        temperature: 0.8,
      })

      expect(result.role).toBe('user')
      expect(result.temperature).toBe(0.8)
    })
  })
})
```

**Component test example:**

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoadingSpinner } from '../components/LoadingSpinner'

describe('LoadingSpinner', () => {
  it('renders spinner with label', () => {
    render(<LoadingSpinner label="Loading prompts..." />)
    
    expect(screen.getByText('Loading prompts...')).toBeInTheDocument()
  })

  it('renders skeleton when skeleton prop is true', () => {
    const { container } = render(<LoadingSpinner skeleton />)
    
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })
})
```

### Testing Best Practices

1. **Test behavior, not implementation**
   ```typescript
   // Good: Tests what the user sees
   expect(screen.getByRole('button')).toHaveTextContent('Save')
   
   // Avoid: Tests internal state
   expect(component.state.isSaving).toBe(true)
   ```

2. **Use meaningful test names**
   ```typescript
   it('displays error message when API call fails', async () => {})
   ```

3. **Keep tests isolated**
   ```typescript
   beforeEach(() => {
     localStorage.clear()
   })
   ```

---

## API Testing (Pytest)

### Setup

Dependencies in `requirements.txt`:
```
pytest
pytest-asyncio
httpx
```

### Running Tests

```bash
cd Orchestration/UnifiedPromptApp/services/prompt-api

# Run all tests
pytest

# Verbose output
pytest -v

# Run specific test file
pytest test_prompts.py

# Run with coverage
pytest --cov=. --cov-report=html
```

### Test Structure

```
prompt-api/
├── app.py              # Main application
├── test_*.py           # Test files
├── conftest.py         # Shared fixtures
└── pytest.ini          # Pytest configuration
```

### Writing Tests

**Fixture example (`conftest.py`):**

```python
import pytest
from fastapi.testclient import TestClient
from app import app

@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)

@pytest.fixture
def sample_prompt():
    """Create sample prompt data."""
    return {
        "title": "Test Prompt",
        "template": "Hello {{name}}",
        "category": "testing"
    }
```

**Test example:**

```python
def test_list_prompts(client):
    """Test listing prompts returns list."""
    response = client.get("/prompts")
    
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_create_prompt(client, sample_prompt):
    """Test creating a new prompt."""
    response = client.post("/prompts", json=sample_prompt)
    
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == sample_prompt["title"]
    assert "id" in data

def test_search_prompts(client):
    """Test prompt search functionality."""
    response = client.get("/prompts/search?q=test")
    
    assert response.status_code == 200
    results = response.json()
    assert isinstance(results, list)

@pytest.mark.asyncio
async def test_async_operation():
    """Test async database operation."""
    from database import async_get_prompts
    
    prompts = await async_get_prompts()
    assert isinstance(prompts, list)
```

### API Testing Best Practices

1. **Test all HTTP methods**
   ```python
   def test_get_prompt(client): ...
   def test_create_prompt(client): ...
   def test_update_prompt(client): ...
   def test_delete_prompt(client): ...
   ```

2. **Test error cases**
   ```python
   def test_get_nonexistent_prompt_returns_404(client):
       response = client.get("/prompts/nonexistent-id")
       assert response.status_code == 404
   ```

3. **Test authentication**
   ```python
   def test_protected_endpoint_requires_auth(client):
       response = client.get("/admin/users")
       assert response.status_code == 401
   ```

---

## PowerShell Testing (Pester)

### Setup

Install Pester:
```powershell
Install-Module Pester -Scope CurrentUser -Force -MinimumVersion 5.5.0
```

### Running Tests

```powershell
# Run all tests
Invoke-Pester tests/

# Run specific test file
Invoke-Pester tests/Schema.Tests.ps1

# Verbose output
Invoke-Pester tests/ -Output Detailed

# With code coverage
Invoke-Pester tests/ -CodeCoverage modules/PromptLibrary/*.psm1
```

### Test Structure

```
tests/
├── Schema.Tests.ps1        # YAML schema validation tests
├── PromptLibrary.Tests.ps1 # Module function tests
└── PromptRefiner.Tests.ps1 # Refiner tool tests
```

### Writing Tests

```powershell
# Schema.Tests.ps1
Describe "Prompt Schema Validation" {
    BeforeAll {
        Import-Module "$PSScriptRoot/../modules/PromptLibrary" -Force
    }

    Context "When validating prompt YAML" {
        It "Should accept valid prompt structure" {
            $prompt = @{
                id = "test-prompt"
                title = "Test Prompt"
                template = "Hello {{name}}"
            }
            
            { Test-PromptSchema $prompt } | Should -Not -Throw
        }

        It "Should reject prompt without title" {
            $prompt = @{
                id = "test-prompt"
                template = "Hello"
            }
            
            { Test-PromptSchema $prompt } | Should -Throw
        }
    }

    Context "When loading prompts from file" {
        It "Should load valid YAML file" {
            $prompts = Get-Prompt -Path "data/prompts/sample.yaml"
            
            $prompts | Should -Not -BeNullOrEmpty
            $prompts[0].title | Should -Not -BeNullOrEmpty
        }
    }
}

Describe "PromptLibrary Module" {
    BeforeAll {
        Import-Module "$PSScriptRoot/../modules/PromptLibrary" -Force
    }

    Context "Get-Prompt" {
        It "Should return all prompts when no filter" {
            $prompts = Get-Prompt
            
            $prompts | Should -BeOfType [PSCustomObject]
        }

        It "Should filter by category" {
            $prompts = Get-Prompt -Category "coding"
            
            $prompts | ForEach-Object {
                $_.category | Should -Be "coding"
            }
        }
    }
}
```

---

## Integration Testing

### Smoke Tests

Run after deployment to verify basic functionality:

```bash
# PowerShell version
pwsh scripts/Test-DeploymentSmoke.ps1

# Python version
pytest tests/test_deployment_smoke.py
```

### Pre-Deployment Checks

```bash
# Verify production readiness
./scripts/pre-deployment-check.sh

# Verify after deployment
./scripts/post-deployment-smoketest.sh https://your-domain.com
```

---

## Test Coverage

### Dashboard Coverage

```bash
cd apps/dashboard
npm run test -- --coverage
```

Current target: **~75% coverage**

### Coverage Reports

- Dashboard: `apps/dashboard/coverage/`
- API: `Orchestration/UnifiedPromptApp/services/prompt-api/htmlcov/`

---

## Mocking

### Dashboard Mocking

```typescript
import { vi } from 'vitest'

// Mock API call
vi.mock('../services/api', () => ({
  fetchPrompts: vi.fn(() => Promise.resolve([]))
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  clear: vi.fn()
}
vi.stubGlobal('localStorage', localStorageMock)
```

### API Mocking

```python
from unittest.mock import patch, MagicMock

def test_with_mock_database(client):
    with patch('database.get_prompts') as mock:
        mock.return_value = [{"id": "1", "title": "Mock"}]
        
        response = client.get("/prompts")
        assert len(response.json()) == 1
```

### PowerShell Mocking

```powershell
Describe "With mocked function" {
    BeforeAll {
        Mock Get-Content { return '{"title": "Mocked"}' }
    }

    It "Should use mocked content" {
        $result = Get-PromptFromFile "any-path.yaml"
        $result.title | Should -Be "Mocked"
    }
}
```

---

## Continuous Integration

### GitHub Actions Workflow

Tests run automatically via `.github/workflows/ci.yml`:

```yaml
jobs:
  dashboard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
        working-directory: apps/dashboard
      - run: npm run lint
        working-directory: apps/dashboard
      - run: npm run test
        working-directory: apps/dashboard
      - run: npm run build
        working-directory: apps/dashboard

  prompt_api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r requirements.txt
        working-directory: Orchestration/UnifiedPromptApp/services/prompt-api
      - run: pytest
        working-directory: Orchestration/UnifiedPromptApp/services/prompt-api
```

---

## Debugging Failed Tests

### Dashboard

1. Check test output for error message
2. Run single test with verbose:
   ```bash
   npm run test -- --reporter=verbose promptStore.test.ts
   ```
3. Add `console.log()` statements
4. Use `test.only()` to isolate

### API

1. Check pytest output
2. Run with `-vv` for verbose:
   ```bash
   pytest -vv test_prompts.py::test_create_prompt
   ```
3. Add `print()` statements
4. Use `pytest.set_trace()` for debugging

### PowerShell

1. Check Pester output
2. Use `-Output Diagnostic`:
   ```powershell
   Invoke-Pester tests/Schema.Tests.ps1 -Output Diagnostic
   ```
3. Add `Write-Host` statements
4. Use `Set-PSBreakpoint` for debugging

---

## Next Steps

- Review the [Developer Guide](developer-guide.md) for coding standards
- Check the [API Reference](api-reference.md) for endpoint documentation
- See the [Deployment Guide](deployment.md) for production testing

---

**Need help?** Check GitHub Issues or contact the development team.
