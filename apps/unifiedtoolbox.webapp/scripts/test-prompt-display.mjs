import assert from 'node:assert/strict'
import { resolveDisplayableTemplate } from '../src/lib/utils/promptDisplay.mjs'

function run() {
  const rawPrompt = 'Role: Example\\n\\nTemplate: {{input}}'
  assert.equal(resolveDisplayableTemplate(rawPrompt), rawPrompt)

  const fenced = [
    'Change summary',
    '```json',
    '{',
    '"refinedTemplate": "Line 1\\nLine 2 with {{var}}",',
    '"changeSummary": ["Updated format"]',
    '}',
    '```',
  ].join('\n')
  assert.equal(resolveDisplayableTemplate(fenced), 'Line 1\nLine 2 with {{var}}')

  const jsonish = '{ "refinedTemplate": "Hello\\nWorld" }'
  assert.equal(resolveDisplayableTemplate(jsonish), 'Hello\nWorld')

  const mixed = 'AI Critique\n{"refinedTemplate":"A\\nB"}\nRubric: ...'
  assert.equal(resolveDisplayableTemplate(mixed), 'A\nB')
}

run()
console.log('promptDisplay tests passed')
