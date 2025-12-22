# Developer Guide
## Unified AI Toolbox

**Version**: 1.5 (Enterprise Ready)  
**Last Updated**: November 2025

---

## Overview

This guide covers everything you need to start developing for the Unified AI Toolbox. Whether you're fixing bugs, adding features, or building integrations, this document will help you get up to speed.

## Prerequisites

### Required Software

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18+ | Dashboard development |
| Python | 3.12+ | API development |
| PowerShell | 7.4+ | Orchestration scripts |
| .NET SDK | 8.0+ | Desktop app development |
| Docker | 24.0+ | Container deployment |
| Git | 2.40+ | Version control |

### Recommended Tools

- **VS Code** with extensions:
  - ESLint
  - Prettier
  - Python
  - PowerShell
  - Tailwind CSS IntelliSense
- **PyCharm** (for API development)
- **Visual Studio 2022** (for desktop app)

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/xfaith4/UnifiedAIToolbox.git
cd UnifiedAIToolbox
```

### 2. Set Up Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your API keys
# Required: OPENAI_API_KEY, ANTHROPIC_API_KEY
```

### 3. Install Dependencies

**Dashboard (React/Vite):**
```bash
cd apps/dashboard
npm install
```

**API (Python/FastAPI):**
```bash
cd Orchestration/UnifiedPromptApp/services/prompt-api
pip install -r requirements.txt
```

**PowerShell Modules:**
```powershell
# Modules are in modules/PromptLibrary
# Add to PSModulePath if needed
$env:PSModulePath += ";$PWD/modules"
```

### 4. Run Development Servers

**Dashboard:**
```bash
cd apps/dashboard
npm run dev
# Access at http://localhost:5173
```

**API:**
```bash
cd Orchestration/UnifiedPromptApp/services/prompt-api
python app.py
# Access at http://localhost:8000
# API docs at http://localhost:8000/docs
```

**Unified Web Portal (Next.js):**
```bash
cd apps/unifiedtoolbox.webapp
NEXT_PUBLIC_API_BASE=http://localhost:8000 npm run dev
# Access at http://localhost:3000
```

The Next.js portal relies on `NEXT_PUBLIC_API_BASE` to know where the prompt API lives so orchestrations reach the backend instead of falling back to the local simulation UI.

## Project Structure

```
UnifiedAIToolbox/
├── apps/
│   ├── dashboard/           # React/Vite web dashboard
│   │   ├── src/
│   │   │   ├── components/  # Reusable UI components
│   │   │   ├── contexts/    # React contexts (Theme, Toast)
│   │   │   ├── pages/       # Page components
│   │   │   ├── services/    # API service layer
│   │   │   ├── types/       # TypeScript type definitions
│   │   │   └── __tests__/   # Unit tests
│   │   └── public/          # Static assets
│   ├── OrchestrationDesktop/ # WPF desktop application
│   ├── PromptRefiner/       # PowerShell WPF prompt tool
│   └── unifiedtoolbox.webapp/ # Next.js alternative portal
├── modules/
│   └── PromptLibrary/       # PowerShell prompt management module
├── Orchestration/
│   ├── AI-Orchestration/    # Multi-agent orchestration scripts
│   └── UnifiedPromptApp/
│       └── services/
│           └── prompt-api/  # FastAPI backend
├── scripts/                 # Deployment and utility scripts
├── tests/                   # Integration tests
├── data/                    # Data files (prompts, agents)
└── docs/                    # Documentation
```

## Development Workflow

### Branching Strategy

- `main` - Production-ready code
- `develop` - Integration branch for features
- `feature/*` - New features
- `fix/*` - Bug fixes
- `copilot/*` - Copilot-generated branches

### Making Changes

1. **Create a branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes and test:**
   ```bash
   # Dashboard
   cd apps/dashboard
   npm run lint
   npm run test
   npm run build

   # API
   cd Orchestration/UnifiedPromptApp/services/prompt-api
   pytest
   ```

3. **Commit with conventional commits:**
   ```bash
   git commit -m "feat: add new orchestration mode"
   git commit -m "fix: resolve search timeout issue"
   git commit -m "docs: update API reference"
   ```

4. **Push and create PR:**
   ```bash
   git push origin feature/your-feature-name
   # Create PR via GitHub
   ```

## Coding Standards

### TypeScript/React

- Use functional components with hooks
- Use TypeScript strict mode
- Follow ESLint rules configured in `eslint.config.js`
- Use Tailwind CSS for styling
- Prefer `lucide-react` for icons

**Example component:**
```tsx
import { useState } from 'react'
import { Save } from 'lucide-react'

interface PromptEditorProps {
  initialValue: string
  onSave: (value: string) => void
}

export const PromptEditor: React.FC<PromptEditorProps> = ({ 
  initialValue, 
  onSave 
}) => {
  const [value, setValue] = useState(initialValue)
  
  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <textarea
        className="w-full p-2 bg-gray-700 text-white rounded"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        className="mt-2 px-4 py-2 bg-blue-600 text-white rounded flex items-center gap-2"
        onClick={() => onSave(value)}
      >
        <Save className="w-4 h-4" />
        Save
      </button>
    </div>
  )
}
```

### Python

- Use type hints
- Follow PEP 8 style guide
- Use FastAPI for API endpoints
- Use Pydantic for data validation

**Example endpoint:**
```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

class PromptCreate(BaseModel):
    title: str
    template: str
    category: str = "general"

@router.post("/prompts")
async def create_prompt(prompt: PromptCreate):
    """Create a new prompt in the library."""
    # Implementation
    return {"id": "new-id", "message": "Prompt created"}
```

### PowerShell

- Use approved verbs (Get-, Set-, New-, etc.)
- Include help comments
- Export only public functions

**Example function:**
```powershell
<#
.SYNOPSIS
    Gets prompts from the library.
.DESCRIPTION
    Retrieves prompts matching the specified criteria.
.PARAMETER Category
    Filter by category name.
.EXAMPLE
    Get-Prompt -Category "coding"
#>
function Get-Prompt {
    [CmdletBinding()]
    param(
        [Parameter()]
        [string]$Category
    )
    
    # Implementation
}

Export-ModuleMember -Function Get-Prompt
```

## Testing

### Dashboard Tests

```bash
cd apps/dashboard

# Run all tests
npm run test

# Watch mode
npm run test:watch

# With UI
npm run test -- --ui
```

**Writing tests:**
```typescript
// src/__tests__/promptStore.test.ts
import { describe, it, expect } from 'vitest'
import { normalizePrompt } from '../services/promptStore'

describe('normalizePrompt', () => {
  it('sets default values for minimal input', () => {
    const result = normalizePrompt({
      id: 'test',
      title: 'Test',
      template: 'Hello'
    })
    
    expect(result.role).toBe('system')
    expect(result.temperature).toBe(0.2)
  })
})
```

### API Tests

```bash
cd Orchestration/UnifiedPromptApp/services/prompt-api
pytest -v
```

### PowerShell Tests

```powershell
# Run Pester tests
Invoke-Pester tests/Schema.Tests.ps1
```

## Adding New Features

### 1. Adding a Dashboard Page

1. Create page component in `apps/dashboard/src/pages/`:
   ```tsx
   // NewFeaturePage.tsx
   export default function NewFeaturePage() {
     return <div>New Feature</div>
   }
   ```

2. Add route in `App.tsx`:
   ```tsx
   <Route path="/new-feature" element={<NewFeaturePage />} />
   ```

3. Add navigation in `components/Layout.tsx`

### 2. Adding an API Endpoint

1. Create or update router in `prompt-api/`:
   ```python
   # new_feature.py
   from fastapi import APIRouter
   
   router = APIRouter(prefix="/new-feature", tags=["new-feature"])
   
   @router.get("/")
   async def get_features():
       return []
   ```

2. Register router in `app.py`:
   ```python
   from new_feature import router as new_feature_router
   app.include_router(new_feature_router)
   ```

### 3. Adding a PowerShell Cmdlet

1. Add function to module file in `modules/PromptLibrary/`
2. Export function in module manifest
3. Add Pester tests in `tests/`

## Debugging

### Dashboard

- Use React DevTools browser extension
- Check browser console for errors
- Use `console.log()` or React Query DevTools

### API

- Check `/docs` for Swagger UI testing
- Use `print()` statements or logging
- Check `data/` directory for database files

### PowerShell

```powershell
# Verbose output
$VerbosePreference = 'Continue'

# Debug breakpoints
Set-PSBreakpoint -Script script.ps1 -Line 10
```

## Common Issues

### "Module not found" in dashboard

```bash
npm install
npm run dev
```

### API database errors

```bash
# Delete and recreate database
rm data/*.db
python -c "from app import init_db; init_db()"
```

### PowerShell module not loading

```powershell
Import-Module ./modules/PromptLibrary -Force
```

## Getting Help

- **Documentation**: Browse `docs/help/`
- **GitHub Issues**: Report bugs or request features
- **Code Comments**: Check inline documentation
- **API Docs**: Visit `http://localhost:8000/docs`

---

## Next Steps

- Review the [Architecture Overview](architecture.md)
- Explore the [API Reference](api-reference.md)
- Check the [Testing Guide](testing.md)

---

**Happy coding!** 🚀
