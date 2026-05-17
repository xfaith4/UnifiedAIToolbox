import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import RequirementsPanel from '../RequirementsPanel'

describe('RequirementsPanel', () => {
  const baseRequest = {
    summary: 'ConceptualModelContract requires additional requirements before implementation can continue.',
    blockers: [
      {
        id: 'req_1',
        question: 'Please provide specific measurable outputs.',
        why: 'Required to convert intent into machine-verifiable acceptance criteria.',
        defaults: [],
      },
    ],
  }

  it('renders question, why, and submit button without schema hint', () => {
    const html = renderToStaticMarkup(
      <RequirementsPanel runId="run-123" requirementsRequest={baseRequest} />
    )
    expect(html).toContain('Please provide specific measurable outputs.')
    expect(html).toContain('Required to convert intent')
    expect(html).toContain('Submit Answers')
    expect(html).not.toContain('Expected output shape')
  })

  it('renders the schema_hint as a collapsible block when present', () => {
    const requestWithHint = {
      ...baseRequest,
      blockers: [
        {
          ...baseRequest.blockers[0],
          schema_hint: '{\n  "interpretation": "<string>",\n  "objects": [ { "id": "<string>" } ]\n}',
        },
      ],
    }
    const html = renderToStaticMarkup(
      <RequirementsPanel runId="run-123" requirementsRequest={requestWithHint} />
    )
    expect(html).toContain('Expected output shape')
    expect(html).toContain('data-testid="schema-hint-req_1"')
    // Schema literal survives into the rendered markup so users see the
    // exact contract shape (string vs. structured array).
    expect(html).toContain('&quot;interpretation&quot;: &quot;&lt;string&gt;&quot;')
    expect(html).toContain('&quot;objects&quot;')
  })

  it('omits the schema_hint block when the field is absent on every blocker', () => {
    const html = renderToStaticMarkup(
      <RequirementsPanel runId="run-123" requirementsRequest={baseRequest} />
    )
    expect(html).not.toContain('data-testid="schema-hint-')
  })
})
