// OpenAI API client for prompt analysis
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export interface OpenAIConfig {
    apiKey: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
}

export interface GPT4AnalysisResult {
    qualityScore: number;
    metrics: {
        clarity: number;
        specificity: number;
        structure: number;
        completeness: number;
        effectiveness: number;
    };
    suggestions: Array<{
        category: string;
        severity: 'high' | 'medium' | 'low';
        issue: string;
        recommendation: string;
        example?: string;
    }>;
    improvedVersion: string;
    reasoning: string;
}

/**
 * Analyze a prompt using GPT-4
 */
export async function analyzePromptWithGPT4(
    promptTemplate: string,
    config: OpenAIConfig
): Promise<GPT4AnalysisResult> {
    const systemPrompt = `You are an expert prompt engineer who analyzes and improves AI prompts.

Your task is to analyze the given prompt and provide:
1. Quality scores (0-10) for: clarity, specificity, structure, completeness, effectiveness
2. Specific suggestions for improvement with severity levels
3. An improved version of the prompt
4. Reasoning for your recommendations

Respond in JSON format with this structure:
{
  "qualityScore": <overall score 0-10>,
  "metrics": {
    "clarity": <0-10>,
    "specificity": <0-10>,
    "structure": <0-10>,
    "completeness": <0-10>,
    "effectiveness": <0-10>
  },
  "suggestions": [
    {
      "category": "clarity|specificity|structure|completeness|effectiveness",
      "severity": "high|medium|low",
      "issue": "description of the issue",
      "recommendation": "specific recommendation",
      "example": "optional example"
    }
  ],
  "improvedVersion": "the improved prompt text",
  "reasoning": "explanation of improvements made"
}`;

    const userPrompt = `Analyze this prompt and provide improvement suggestions:

\`\`\`
${promptTemplate}
\`\`\`

Provide detailed analysis and an improved version.`;

    try {
        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                model: config.model || 'gpt-4o',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: config.temperature ?? 0.3,
                max_tokens: config.maxTokens ?? 2000,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content;

        if (!content) {
            throw new Error('No response from OpenAI API');
        }

        const result = JSON.parse(content) as GPT4AnalysisResult;
        return result;
    } catch (error) {
        console.error('GPT-4 analysis error:', error);
        throw error;
    }
}

/**
 * Generate an improved prompt using GPT-4
 */
export async function improvePromptWithGPT4(
    originalPrompt: string,
    focusAreas: string[],
    config: OpenAIConfig
): Promise<string> {
    const systemPrompt = `You are an expert prompt engineer. Improve the given prompt focusing on: ${focusAreas.join(', ')}.

Make the prompt:
- Clear and unambiguous
- Specific with well-defined requirements
- Well-structured with logical flow
- Complete with all necessary context
- Effective at producing desired outputs

Return ONLY the improved prompt text, no explanations.`;

    try {
        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                model: config.model || 'gpt-4o',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: originalPrompt },
                ],
                temperature: config.temperature ?? 0.3,
                max_tokens: config.maxTokens ?? 1500,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || originalPrompt;
    } catch (error) {
        console.error('GPT-4 improvement error:', error);
        throw error;
    }
}

/**
 * Check if API key is valid
 */
export async function validateOpenAIKey(apiKey: string): Promise<boolean> {
    try {
        const response = await fetch('https://api.openai.com/v1/models', {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        });
        return response.ok;
    } catch {
        return false;
    }
}
