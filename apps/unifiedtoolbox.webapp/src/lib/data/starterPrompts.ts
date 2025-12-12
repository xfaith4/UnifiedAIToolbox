// Starter prompts for the Prompt Refinement Studio
export const STARTER_PROMPTS = [
    {
        id: 'code-review-assistant',
        title: 'Code Review Assistant',
        category: 'Engineering',
        template: `You are an expert code reviewer with deep knowledge of software engineering best practices.

Review the following code and provide constructive feedback on:
1. **Code Quality**: Readability, maintainability, and adherence to best practices
2. **Performance**: Potential bottlenecks or optimization opportunities
3. **Security**: Vulnerabilities or security concerns
4. **Testing**: Test coverage and edge cases

Code to review:
\`\`\`{{language}}
{{code}}
\`\`\`

Provide your feedback in a structured format with specific line references and actionable suggestions.`,
        variables: [
            { name: 'language', label: 'Programming Language', type: 'string', default: 'javascript' },
            { name: 'code', label: 'Code to Review', type: 'multiline' },
        ],
        tags: ['code-review', 'engineering', 'quality'],
        temperature: 0.3,
        version: '1.0.0',
    },
    {
        id: 'technical-documentation',
        title: 'Technical Documentation Writer',
        category: 'Documentation',
        template: `You are a technical writer who creates clear, comprehensive documentation.

Create documentation for: {{feature_name}}

Requirements:
- **Audience**: {{target_audience}}
- **Format**: {{format}}
- **Depth**: {{detail_level}}

Include:
1. Overview and purpose
2. Key concepts
3. Step-by-step instructions
4. Code examples (if applicable)
5. Common issues and troubleshooting
6. Best practices

Context: {{context}}

Write documentation that is clear, accurate, and easy to follow.`,
        variables: [
            { name: 'feature_name', label: 'Feature/Component Name', type: 'string' },
            { name: 'target_audience', label: 'Target Audience', type: 'string', default: 'developers' },
            { name: 'format', label: 'Documentation Format', type: 'string', default: 'markdown' },
            { name: 'detail_level', label: 'Detail Level', type: 'string', default: 'comprehensive' },
            { name: 'context', label: 'Additional Context', type: 'multiline' },
        ],
        tags: ['documentation', 'technical-writing'],
        temperature: 0.4,
        version: '1.0.0',
    },
    {
        id: 'bug-report-analyzer',
        title: 'Bug Report Analyzer',
        category: 'Support',
        template: `You are a bug triage specialist who analyzes bug reports and provides structured assessments.

Analyze this bug report:
{{bug_report}}

Provide:
1. **Severity**: Critical/High/Medium/Low with justification
2. **Root Cause Hypothesis**: Likely causes based on symptoms
3. **Reproduction Steps**: Clarified steps to reproduce
4. **Affected Components**: Which parts of the system are impacted
5. **Suggested Fix**: Potential solutions or workarounds
6. **Priority**: Recommended priority with reasoning

Be thorough but concise. Focus on actionable insights.`,
        variables: [
            { name: 'bug_report', label: 'Bug Report', type: 'multiline' },
        ],
        tags: ['debugging', 'support', 'triage'],
        temperature: 0.2,
        version: '1.0.0',
    },
    {
        id: 'api-design-reviewer',
        title: 'API Design Reviewer',
        category: 'Engineering',
        template: `You are an API design expert who evaluates API designs for usability, consistency, and best practices.

Review this API design:
{{api_spec}}

Evaluate:
1. **RESTful Principles**: Adherence to REST conventions
2. **Naming Consistency**: Endpoint and parameter naming
3. **Error Handling**: Error response structure and codes
4. **Versioning Strategy**: API versioning approach
5. **Documentation**: Clarity and completeness
6. **Security**: Authentication, authorization, data validation
7. **Performance**: Pagination, caching, rate limiting

Provide specific recommendations for improvement with examples.`,
        variables: [
            { name: 'api_spec', label: 'API Specification', type: 'multiline' },
        ],
        tags: ['api-design', 'architecture', 'review'],
        temperature: 0.3,
        version: '1.0.0',
    },
    {
        id: 'meeting-summarizer',
        title: 'Meeting Notes Summarizer',
        category: 'Productivity',
        template: `You are an executive assistant who creates concise, actionable meeting summaries.

Summarize these meeting notes:
{{meeting_notes}}

Create a summary with:
1. **Key Decisions**: What was decided
2. **Action Items**: Who is doing what by when
3. **Discussion Points**: Main topics covered
4. **Next Steps**: What happens next
5. **Parking Lot**: Items deferred for later

Format as a clear, scannable document. Use bullet points and bold headings.`,
        variables: [
            { name: 'meeting_notes', label: 'Meeting Notes', type: 'multiline' },
        ],
        tags: ['productivity', 'summarization', 'meetings'],
        temperature: 0.3,
        version: '1.0.0',
    },
    {
        id: 'sql-query-generator',
        title: 'SQL Query Generator',
        category: 'Engineering',
        template: `You are a database expert who writes efficient, safe SQL queries.

Generate a SQL query for: {{query_description}}

Database schema:
{{schema}}

Requirements:
- **Database**: {{database_type}}
- **Optimization**: Focus on performance
- **Safety**: Include appropriate WHERE clauses and limits
- **Readability**: Use clear formatting and comments

Provide:
1. The SQL query
2. Explanation of the query logic
3. Performance considerations
4. Potential indexes that would help`,
        variables: [
            { name: 'query_description', label: 'Query Description', type: 'multiline' },
            { name: 'schema', label: 'Database Schema', type: 'multiline' },
            { name: 'database_type', label: 'Database Type', type: 'string', default: 'PostgreSQL' },
        ],
        tags: ['sql', 'database', 'engineering'],
        temperature: 0.2,
        version: '1.0.0',
    },
    {
        id: 'user-story-writer',
        title: 'User Story Writer',
        category: 'Product',
        template: `You are a product manager who writes clear, testable user stories.

Create a user story for: {{feature_description}}

Context:
- **User Persona**: {{persona}}
- **Business Goal**: {{business_goal}}

Write a user story following this format:
**As a** [user type]
**I want** [goal]
**So that** [benefit]

**Acceptance Criteria**:
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

**Technical Notes**:
- Implementation considerations
- Dependencies
- Edge cases

Make it specific, measurable, and testable.`,
        variables: [
            { name: 'feature_description', label: 'Feature Description', type: 'multiline' },
            { name: 'persona', label: 'User Persona', type: 'string' },
            { name: 'business_goal', label: 'Business Goal', type: 'string' },
        ],
        tags: ['product', 'agile', 'user-stories'],
        temperature: 0.4,
        version: '1.0.0',
    },
    {
        id: 'incident-postmortem',
        title: 'Incident Postmortem Generator',
        category: 'Operations',
        template: `You are an SRE who creates thorough, blameless postmortem reports.

Create a postmortem for this incident:
{{incident_description}}

Structure:
1. **Summary**: Brief overview (2-3 sentences)
2. **Timeline**: Chronological events
3. **Root Cause**: What actually happened
4. **Impact**: Who/what was affected
5. **Resolution**: How it was fixed
6. **Action Items**: Preventive measures
7. **Lessons Learned**: Key takeaways

Follow blameless postmortem principles. Focus on systems and processes, not individuals.`,
        variables: [
            { name: 'incident_description', label: 'Incident Description', type: 'multiline' },
        ],
        tags: ['operations', 'sre', 'postmortem'],
        temperature: 0.3,
        version: '1.0.0',
    },
    {
        id: 'test-case-generator',
        title: 'Test Case Generator',
        category: 'QA',
        template: `You are a QA engineer who creates comprehensive test cases.

Generate test cases for: {{feature_description}}

Requirements:
{{requirements}}

Create test cases covering:
1. **Happy Path**: Normal, expected usage
2. **Edge Cases**: Boundary conditions
3. **Error Cases**: Invalid inputs and error handling
4. **Performance**: Load and stress scenarios
5. **Security**: Authentication, authorization, injection

Format each test case as:
**Test Case ID**: TC-XXX
**Description**: What is being tested
**Preconditions**: Setup required
**Steps**: 1. Step one 2. Step two
**Expected Result**: What should happen
**Priority**: High/Medium/Low`,
        variables: [
            { name: 'feature_description', label: 'Feature Description', type: 'string' },
            { name: 'requirements', label: 'Requirements', type: 'multiline' },
        ],
        tags: ['qa', 'testing', 'quality'],
        temperature: 0.3,
        version: '1.0.0',
    },
    {
        id: 'refactoring-advisor',
        title: 'Code Refactoring Advisor',
        category: 'Engineering',
        template: `You are a software architect who identifies refactoring opportunities.

Analyze this code for refactoring:
\`\`\`{{language}}
{{code}}
\`\`\`

Identify:
1. **Code Smells**: Duplicated code, long methods, large classes
2. **Design Patterns**: Opportunities to apply patterns
3. **SOLID Violations**: Single Responsibility, Open/Closed, etc.
4. **Complexity**: Cyclomatic complexity issues
5. **Testability**: Hard-to-test code

For each issue, provide:
- **Problem**: What's wrong
- **Impact**: Why it matters
- **Solution**: How to refactor
- **Example**: Code snippet showing the improvement

Prioritize refactorings by impact and effort.`,
        variables: [
            { name: 'language', label: 'Programming Language', type: 'string', default: 'javascript' },
            { name: 'code', label: 'Code to Analyze', type: 'multiline' },
        ],
        tags: ['refactoring', 'code-quality', 'engineering'],
        temperature: 0.3,
        version: '1.0.0',
    },
];

// Add timestamps
export function getStarterPromptsWithTimestamps() {
    const now = new Date().toISOString();
    return STARTER_PROMPTS.map(prompt => ({
        ...prompt,
        createdAt: now,
        updatedAt: now,
    }));
}
