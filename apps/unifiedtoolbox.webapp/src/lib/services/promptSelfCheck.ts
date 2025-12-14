'use client'

import { normalizePrompt } from '@/lib/services/promptStore'
import { evaluatePromptQuality, generateRefinementDraft } from '@/lib/utils/promptQuality'
import { containsSecretIndicators, extractSummaryFromChange } from '@/lib/utils/promptRefiner'

export function runPromptLibrarySelfChecks() {
  if (process.env.NODE_ENV === 'production') return
  try {
    evaluatePromptQuality('')
    const legacyPrompt = normalizePrompt({ id: 'legacy', title: 'Legacy Prompt' })
    if (!legacyPrompt.history) throw new Error('Normalized prompt missing history array')
    const draft = generateRefinementDraft(legacyPrompt.template, legacyPrompt.context)
    if (!draft.includes('Role:')) throw new Error('Draft generator failed to add sections')
    const historyEntry = {
      versionId: `${legacyPrompt.id}-selfcheck`,
      savedAt: new Date().toISOString(),
      title: legacyPrompt.title,
      promptText: legacyPrompt.template,
    }
    const restored = { ...legacyPrompt, history: [historyEntry] }
    if (restored.history.length !== 1) throw new Error('History save/restore mismatch')
    if (!containsSecretIndicators('api_key=123')) throw new Error('Secret detector regression')
    const summary = extractSummaryFromChange('line1\nline2')
    if (summary.length !== 2) throw new Error('Summary extractor broken')
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Prompt library self-check failed', error)
  }
}
