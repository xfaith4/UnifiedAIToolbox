// AI-powered prompt analysis service
import { analyzePromptWithGPT4, type OpenAIConfig } from './openai';

export interface QualityMetrics {
    overall: number;
    clarity: number;
    specificity: number;
    structure: number;
    completeness: number;
    effectiveness?: number;
    suggestions: Suggestion[];
    lastAnalyzed: string;
}

export interface Suggestion {
    id: string;
    type: 'clarity' | 'specificity' | 'structure' | 'examples' | 'constraints' | 'effectiveness';
    severity: 'low' | 'medium' | 'high';
    message: string;
    suggestedChange?: string;
    lineNumber?: number;
}

export interface AnalysisResult {
    qualityScore: number;
    metrics: QualityMetrics;
    improvedVersion?: string;
    reasoning?: string;
    usedGPT4?: boolean;
}

/**
 * Analyze a prompt using AI to assess quality and provide suggestions
 */
export async function analyzePrompt(
    promptTemplate: string,
    apiKey?: string
): Promise<AnalysisResult> {
    // Try GPT-4 analysis if API key is provided
    if (apiKey) {
        try {
            const gpt4Result = await analyzePromptWithGPT4(promptTemplate, {
                apiKey,
                model: 'gpt-4o',
                temperature: 0.3,
            });

            // Convert GPT-4 result to our format
            const suggestions: Suggestion[] = gpt4Result.suggestions.map((s, i) => ({
                id: `gpt4-${i}`,
                type: s.category as any,
                severity: s.severity,
                message: s.issue,
                suggestedChange: s.recommendation + (s.example ? `\n\nExample: ${s.example}` : ''),
            }));

            return {
                qualityScore: gpt4Result.qualityScore,
                metrics: {
                    overall: gpt4Result.qualityScore,
                    clarity: gpt4Result.metrics.clarity,
                    specificity: gpt4Result.metrics.specificity,
                    structure: gpt4Result.metrics.structure,
                    completeness: gpt4Result.metrics.completeness,
                    effectiveness: gpt4Result.metrics.effectiveness,
                    suggestions,
                    lastAnalyzed: new Date().toISOString(),
                },
                improvedVersion: gpt4Result.improvedVersion,
                reasoning: gpt4Result.reasoning,
                usedGPT4: true,
            };
        } catch (error) {
            console.error('GPT-4 analysis failed, falling back to heuristics:', error);
            // Fall through to heuristic analysis
        }
    }

    // Fallback to heuristic-based analysis
    const metrics = calculateHeuristicMetrics(promptTemplate);
    const suggestions = generateSuggestions(promptTemplate, metrics);

    const qualityScore = (
        metrics.clarity +
        metrics.specificity +
        metrics.structure +
        metrics.completeness
    ) / 4;

    return {
        qualityScore,
        metrics: {
            ...metrics,
            overall: qualityScore,
            suggestions,
            lastAnalyzed: new Date().toISOString(),
        },
        usedGPT4: false,
    };
}

/**
 * Calculate quality metrics using heuristics
 */
function calculateHeuristicMetrics(template: string): Omit<QualityMetrics, 'overall' | 'suggestions' | 'lastAnalyzed' | 'effectiveness'> {
    const lines = template.split('\n');
    const wordCount = template.split(/\s+/).length;
    const hasVariables = /\{\{.+?\}\}/.test(template);
    const hasStructure = /^(#{1,6}|\d+\.|[-*])\s/.test(template);
    const hasConstraints = /constraint|requirement|must|should|rule/i.test(template);
    const hasExamples = /example|for instance|such as/i.test(template);

    // Clarity: Is the prompt easy to understand?
    const clarity = Math.min(10, (
        (wordCount > 20 ? 3 : 1) +
        (wordCount < 500 ? 3 : 1) +
        (lines.length > 3 ? 2 : 1) +
        (hasStructure ? 2 : 0)
    ));

    // Specificity: Does it have specific instructions?
    const specificity = Math.min(10, (
        (hasVariables ? 3 : 0) +
        (hasConstraints ? 3 : 0) +
        (hasExamples ? 2 : 0) +
        (wordCount > 50 ? 2 : 0)
    ));

    // Structure: Is it well-organized?
    const structure = Math.min(10, (
        (hasStructure ? 4 : 0) +
        (lines.length > 5 ? 3 : 1) +
        (template.includes('\n\n') ? 3 : 0)
    ));

    // Completeness: Does it cover all necessary aspects?
    const completeness = Math.min(10, (
        (hasVariables ? 2 : 0) +
        (hasConstraints ? 2 : 0) +
        (hasExamples ? 2 : 0) +
        (wordCount > 100 ? 2 : 0) +
        (template.toLowerCase().includes('output') || template.toLowerCase().includes('format') ? 2 : 0)
    ));

    return {
        clarity,
        specificity,
        structure,
        completeness,
    };
}

/**
 * Generate improvement suggestions based on metrics
 */
function generateSuggestions(template: string, metrics: Omit<QualityMetrics, 'overall' | 'suggestions' | 'lastAnalyzed' | 'effectiveness'>): Suggestion[] {
    const suggestions: Suggestion[] = [];

    // Clarity suggestions
    if (metrics.clarity < 6) {
        if (template.split(/\s+/).length < 20) {
            suggestions.push({
                id: 'clarity-1',
                type: 'clarity',
                severity: 'high',
                message: 'Prompt is too brief. Add more context and instructions to make expectations clear.',
                suggestedChange: 'Expand the prompt with specific instructions, context, and desired output format.',
            });
        }
        if (template.split(/\s+/).length > 500) {
            suggestions.push({
                id: 'clarity-2',
                type: 'clarity',
                severity: 'medium',
                message: 'Prompt is very long. Consider breaking it into sections or simplifying.',
                suggestedChange: 'Use headings and bullet points to organize the content.',
            });
        }
    }

    // Specificity suggestions
    if (metrics.specificity < 6) {
        if (!/\{\{.+?\}\}/.test(template)) {
            suggestions.push({
                id: 'specificity-1',
                type: 'specificity',
                severity: 'medium',
                message: 'No variables detected. Consider adding placeholders for dynamic content using {{variable_name}} syntax.',
                suggestedChange: 'Add variables like {{topic}}, {{context}}, or {{requirements}} where appropriate.',
            });
        }
        if (!/constraint|requirement|must|should|rule/i.test(template)) {
            suggestions.push({
                id: 'specificity-2',
                type: 'constraints',
                severity: 'medium',
                message: 'No explicit constraints found. Add requirements or rules to guide the AI.',
                suggestedChange: 'Add a "Constraints:" or "Requirements:" section with specific rules.',
            });
        }
    }

    // Structure suggestions
    if (metrics.structure < 6) {
        if (!/^(#{1,6}|\d+\.|[-*])\s/m.test(template)) {
            suggestions.push({
                id: 'structure-1',
                type: 'structure',
                severity: 'medium',
                message: 'Prompt lacks clear structure. Use headings, numbered lists, or bullet points.',
                suggestedChange: 'Organize with markdown headings (# Title) and lists (1. Item or - Item).',
            });
        }
    }

    // Completeness suggestions
    if (metrics.completeness < 6) {
        if (!/example|for instance|such as/i.test(template)) {
            suggestions.push({
                id: 'completeness-1',
                type: 'examples',
                severity: 'low',
                message: 'Consider adding examples to clarify expectations.',
                suggestedChange: 'Include 1-2 examples of desired output or behavior.',
            });
        }
        if (!/output|format|response/i.test(template)) {
            suggestions.push({
                id: 'completeness-2',
                type: 'structure',
                severity: 'high',
                message: 'No output format specified. Define how the AI should structure its response.',
                suggestedChange: 'Add an "Output Format:" section specifying the desired structure (e.g., JSON, markdown, bullet points).',
            });
        }
    }

    return suggestions;
}

/**
 * Generate an improved version of the prompt using AI
 * TODO: Implement with GPT-4 API
 */
export async function generateImprovedPrompt(
    originalPrompt: string,
    apiKey?: string
): Promise<string> {
    // Placeholder for AI-powered improvement
    // For now, return the original with a note
    return `${originalPrompt}\n\n<!-- AI-powered improvement coming soon -->`;
}
