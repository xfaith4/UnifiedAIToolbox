# Update Orchestrator Page
Write-Host "Updating Orchestrator Page..." -ForegroundColor Cyan

$orchestrator = Get-Content apps\prompt-hub\src\pages\OrchestratorPage.tsx -Raw

# Add imports
$orchestrator = $orchestrator -replace "(import React[^
]+)", "$1
import { BookOpen } from 'lucide-react'
import { PromptPicker } from '../components/PromptPicker'"

# Add state for prompt picker
$orchestrator = $orchestrator -replace "(\[taskQueueLoading, setTaskQueueLoading\] = useState\(false\))", "$1
  const [showPromptPicker, setShowPromptPicker] = useState(false)"

$orchestrator | Set-Content apps\prompt-hub\src\pages\OrchestratorPage.tsx.updated -Encoding UTF8

Write-Host "? Orchestrator imports and state updated" -ForegroundColor Green
Write-Host "Next: Manually replace SelectionList for prompts with Browse Library button" -ForegroundColor Yellow
Write-Host ""
