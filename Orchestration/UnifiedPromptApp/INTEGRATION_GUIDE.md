# AI Toolbox React Integration Guide

## Overview
This guide documents the changes made to transition from Streamlit to a React-only architecture with integrated prompt library access across all tools.

## Changes Completed

### 1. Unified Navigation (apps/prompt-hub/src/components/Layout.tsx)
✅ Created grouped sidebar navigation with sections:
   - **Overview**: Dashboard
   - **Libraries**: Prompt Library, Agent Library  
   - **Integration Tools**: Orchestrator, Genesys, GitHub
   - **Settings**: Configuration

✅ Updated branding from "Dash Starter" to "AI Toolbox - Unified Prompt Hub"
✅ Added visual hierarchy with section headers and improved active state styling

### 2. Reusable Prompt Picker Component (apps/prompt-hub/src/components/PromptPicker.tsx)
✅ Created modal component with:
   - Search and filter by category
   - Visual prompt cards with title, description, and tags
   - Single/multi-select support
   - Loading and empty states
   - Responsive design

## Integration Instructions

### Orchestrator Page Integration

Add to the imports section of \pps/prompt-hub/src/pages/OrchestratorPage.tsx\:

\\\	ypescript
import { BookOpen, Plus } from 'lucide-react'
import { PromptPicker } from '../components/PromptPicker'
\\\

Add state for the picker:

\\\	ypescript
const [showPromptPicker, setShowPromptPicker] = useState(false)
\\\

Replace the SelectionList component call for prompts with:

\\\	ypescript
<div>
  <div className="mb-2 flex items-center justify-between">
    <div className="text-sm font-semibold text-slate-600">Prompts</div>
    <button
      onClick={() => setShowPromptPicker(true)}
      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
    >
      <BookOpen size={16} />
      Browse Library
    </button>
  </div>
  <div className="space-y-2 rounded-xl border border-slate-200 p-3 max-h-80 overflow-y-auto">
    {selectedPromptIds.length === 0 ? (
      <div className="text-sm text-slate-500 text-center py-4">
        No prompts selected. Click "Browse Library" to add prompts.
      </div>
    ) : (
      selectedPrompts.map((prompt) => (
        <div
          key={prompt.id}
          className="flex items-start justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm"
        >
          <div>
            <div className="font-medium text-slate-800">{prompt.title}</div>
            <div className="text-xs text-slate-500">{prompt.category || 'Uncategorized'}</div>
          </div>
          <button
            onClick={() => setSelectedPromptIds(prev => prev.filter(id => id !== prompt.id))}
            className="text-slate-400 hover:text-red-600"
          >
            ×
          </button>
        </div>
      ))
    )}
  </div>
</div>

{/* Add the PromptPicker modal before the closing div */}
<PromptPicker
  isOpen={showPromptPicker}
  onClose={() => setShowPromptPicker(false)}
  onSelect={(prompt) => {
    if (!selectedPromptIds.includes(prompt.id)) {
      setSelectedPromptIds(prev => [...prev, prompt.id])
    }
    setShowPromptPicker(false)
  }}
  selectedIds={selectedPromptIds}
  title="Select Prompt Instructions"
/>
\\\

### Agent Library Page Integration

Add to \pps/prompt-hub/src/pages/AgentLibraryPage.tsx\:

\\\	ypescript
import { PromptPicker } from '../components/PromptPicker'
import type { PromptItem } from '../types/prompts'

// In the component:
const [showPromptPicker, setShowPromptPicker] = useState(false)
const [selectedPromptForAgent, setSelectedPromptForAgent] = useState<string | null>(null)

// Add a button in the agent editor to link prompts:
<button
  onClick={() => {
    setSelectedPromptForAgent(selectedAgent.id)
    setShowPromptPicker(true)
  }}
  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg"
>
  <BookOpen size={16} />
  Link Prompt Instructions
</button>

// Add the picker:
<PromptPicker
  isOpen={showPromptPicker}
  onClose={() => {
    setShowPromptPicker(false)
    setSelectedPromptForAgent(null)
  }}
  onSelect={(prompt) => {
    // Add prompt reference to agent's instructions field
    if (selectedPromptForAgent && selectedAgent) {
      upsertAgent(selectedPromptForAgent, (agent) => ({
        ...agent,
        linkedPrompts: [...(agent.linkedPrompts || []), { id: prompt.id, title: prompt.title }]
      }))
    }
    setShowPromptPicker(false)
  }}
  title="Link Prompt to Agent"
/>
\\\

### Genesys Page Integration

For Genesys integration (analyzing WebRTC disconnects, etc.), add a section to apply prompts to analysis:

\\\	ypescript
import { PromptPicker } from '../components/PromptPicker'

const [showPromptPicker, setShowPromptPicker] = useState(false)
const [selectedAnalysisPrompt, setSelectedAnalysisPrompt] = useState<PromptItem | null>(null)

// In the UI, add analysis section:
<div className="rounded-2xl border border-slate-200 bg-white p-4">
  <h3 className="font-semibold mb-3">AI-Powered Analysis</h3>
  {selectedAnalysisPrompt ? (
    <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
      <div className="flex justify-between items-center">
        <div>
          <div className="font-medium text-slate-900">{selectedAnalysisPrompt.title}</div>
          <div className="text-xs text-slate-600">{selectedAnalysisPrompt.category}</div>
        </div>
        <button onClick={() => setSelectedAnalysisPrompt(null)} className="text-slate-400 hover:text-red-600">
          ×
        </button>
      </div>
    </div>
  ) : (
    <button
      onClick={() => setShowPromptPicker(true)}
      className="w-full flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-slate-300 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors"
    >
      <BookOpen size={18} />
      Select Analysis Prompt
    </button>
  )}
</div>

<PromptPicker
  isOpen={showPromptPicker}
  onClose={() => setShowPromptPicker(false)}
  onSelect={(prompt) => {
    setSelectedAnalysisPrompt(prompt)
    setShowPromptPicker(false)
  }}
  title="Select Analysis Prompt"
/>
\\\

## Launch Script Modifications

### Option 1: Remove Streamlit Completely

Edit \LaunchUnifiedToolbox.ps1\:

1. Remove \-WorkbenchPort\ parameter (line ~23)
2. Remove \-SkipStreamlit\ switch (line ~28)
3. Remove workbench port validation (lines ~138-140)
4. Remove streamlit pip install (lines ~185-187)
5. Remove streamlit process launch (lines ~248-253)
6. Remove workbench URL output (lines ~294-296)
7. Remove workbench health check (lines ~322-327)

### Option 2: Keep Streamlit Optional (Recommended During Transition)

Add a new parameter to explicitly opt-in to Streamlit:

\\\powershell
[switch]\
\\\

Then wrap all Streamlit logic with:

\\\powershell
if (\) {
    # existing streamlit code
}
\\\

Update the synopsis:

\\\powershell
All-in-one launcher for the Unified AI Toolbox (React Dashboard + Prompt API + optional Streamlit).
\\\

## Testing the Integration

1. **Start the application:**
   \\\powershell
   .\LaunchUnifiedToolbox.ps1 -SkipInstall
   \\\

2. **Test React Dashboard:**
   - Navigate to http://localhost:5173
   - Verify new navigation structure
   - Check all pages load correctly

3. **Test Prompt Picker:**
   - Go to Orchestrator page
   - Click "Browse Library" button
   - Verify search and filtering works
   - Select a prompt and verify it appears in selected list

4. **Test API Integration:**
   - Verify API at http://localhost:8000
   - Test \/prompts\ endpoint
   - Test \/orchestrator/tasks\ endpoint

## Type Additions (if needed)

Add to \pps/prompt-hub/src/types/agents.ts\:

\\\	ypescript
export interface LinkedPrompt {
  id: string
  title: string
}

export interface AgentInstruction {
  // ... existing fields
  linkedPrompts?: LinkedPrompt[]
}
\\\

## Next Steps

1. ✅ Update navigation (completed)
2. ✅ Create PromptPicker component (completed)
3. 🔄 Integrate PromptPicker into Orchestrator (instructions provided)
4. 🔄 Integrate PromptPicker into Agent Library (instructions provided)
5. 🔄 Integrate PromptPicker into Genesys (instructions provided)
6. ⏳ Update LaunchUnifiedToolbox.ps1 to remove/deprecate Streamlit
7. ⏳ Test end-to-end workflow
8. ⏳ Update documentation and README

## Benefits of This Architecture

- **Single UI Framework**: All features in React for consistency
- **Reusable Components**: PromptPicker can be used anywhere
- **Better DX**: Modern React tooling vs Streamlit limitations
- **Easier Customization**: Tailwind CSS styling throughout
- **Clear Information Hierarchy**: Grouped navigation clarifies purpose
- **Cross-Feature Integration**: Prompts accessible from all tools
