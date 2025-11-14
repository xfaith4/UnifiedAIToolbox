# Complete PromptPicker Integration Script
Write-Host "
=== Integrating PromptPicker into all pages ===" -ForegroundColor Cyan

# 1. Orchestrator Page
Write-Host "
[1/3] Updating Orchestrator Page..." -ForegroundColor Yellow
$orch = Get-Content apps\prompt-hub\src\pages\OrchestratorPage.tsx.updated -Raw
$orch = $orch -replace "^import \{ BookOpen", "import React, { useEffect, useMemo, useState } from 'react'
import { BookOpen"
$orch | Set-Content apps\prompt-hub\src\pages\OrchestratorPage.tsx -Encoding UTF8 -Force
Write-Host "? Orchestrator Page updated with PromptPicker imports and state" -ForegroundColor Green

# 2. Agent Library Page  
Write-Host "
[2/3] Updating Agent Library Page..." -ForegroundColor Yellow
$agent = Get-Content apps\prompt-hub\src\pages\AgentLibraryPage.tsx -Raw
$agent = $agent -replace "(import React[^
]+)", "$1
import { BookOpen } from 'lucide-react'
import { PromptPicker } from '../components/PromptPicker'"
$agent = $agent -replace "(\[saving, setSaving\] = useState\(false\))", "$1
  const [showPromptPicker, setShowPromptPicker] = useState(false)"
$agent | Set-Content apps\prompt-hub\src\pages\AgentLibraryPage.tsx -Encoding UTF8 -Force
Write-Host "? Agent Library Page updated with PromptPicker imports and state" -ForegroundColor Green

# 3. Genesys Page
Write-Host "
[3/3] Updating Genesys Page..." -ForegroundColor Yellow
$genesys = Get-Content apps\prompt-hub\src\pages\Genesys.tsx -Raw
$genesys = $genesys -replace "(import \{ useMemo \} from 'react')", "import { useMemo, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { PromptPicker } from '../components/PromptPicker'
import type { PromptItem } from '../types/prompts'"
$genesys = $genesys -replace "(const loading = false)", "const [showPromptPicker, setShowPromptPicker] = useState(false)
  const [selectedAnalysisPrompt, setSelectedAnalysisPrompt] = useState<PromptItem | null>(null)
  $1"
$genesys | Set-Content apps\prompt-hub\src\pages\Genesys.tsx -Encoding UTF8 -Force
Write-Host "? Genesys Page updated with PromptPicker imports and state" -ForegroundColor Green

Write-Host "
? All three pages updated successfully!" -ForegroundColor Green
Write-Host "
Note: UI integration (buttons, modals) will be completed in the component files." -ForegroundColor Cyan
