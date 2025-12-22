// Script to migrate YAML prompts to the new prompt library format
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

interface YAMLPrompt {
    id: string;
    version?: string;
    variables?: Record<string, { type?: string; default?: string }>;
    blocks?: {
        system?: string;
        instructions?: string;
        constraints?: string;
        style?: string;
    };
    telemetry?: {
        tags?: string[];
    };
    models?: {
        recommended?: string[];
        max_tokens?: number;
        temperature?: number;
    };
}

interface PromptItem {
    id: string;
    title: string;
    template: string;
    createdAt: string;
    updatedAt: string;
    version?: string;
    category?: string;
    context?: string;
    description?: string;
    tags?: string[];
    role?: string;
    style?: string;
    variables?: Array<{
        name: string;
        label?: string;
        type?: 'string' | 'multiline';
        default?: string;
    }>;
    temperature?: number;
}

function convertYAMLToPrompt(yamlPrompt: YAMLPrompt): PromptItem {
    // Build template from blocks
    let template = '';
    if (yamlPrompt.blocks?.system) {
        template += `${yamlPrompt.blocks.system}\n\n`;
    }
    if (yamlPrompt.blocks?.instructions) {
        template += `${yamlPrompt.blocks.instructions}\n\n`;
    }
    if (yamlPrompt.blocks?.constraints) {
        template += `Constraints:\n${yamlPrompt.blocks.constraints}\n\n`;
    }
    if (yamlPrompt.blocks?.style) {
        template += `Style:\n${yamlPrompt.blocks.style}`;
    }

    // Extract variables
    const variables = yamlPrompt.variables
        ? Object.entries(yamlPrompt.variables).map(([name, config]) => ({
            name,
            label: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            type: config?.type === 'array' ? 'multiline' : 'string',
            default: config?.default,
        }))
        : [];

    // Generate title from ID
    const title = yamlPrompt.id
        .split('.')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    // Determine category from ID
    const category = yamlPrompt.id.split('.')[0] || 'general';

    return {
        id: yamlPrompt.id,
        title,
        template: template.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: yamlPrompt.version || '1.0.0',
        category: category.charAt(0).toUpperCase() + category.slice(1),
        tags: yamlPrompt.telemetry?.tags || [],
        variables,
        temperature: yamlPrompt.models?.temperature ?? 0.2,
    };
}

async function migratePrompts() {
    const promptsDir = join(process.cwd(), '..', '..', 'data', 'prompts');
    const files = readdirSync(promptsDir).filter(f => f.endsWith('.prompt.yaml'));

    const prompts: PromptItem[] = [];

    for (const file of files) {
        try {
            const content = readFileSync(join(promptsDir, file), 'utf-8');
            const yamlPrompt = yaml.load(content) as YAMLPrompt;
            const prompt = convertYAMLToPrompt(yamlPrompt);
            prompts.push(prompt);
            console.log(`✓ Converted: ${prompt.title}`);
        } catch (error) {
            console.error(`✗ Failed to convert ${file}:`, error);
        }
    }

    // Save to localStorage format (JSON)
    const output = JSON.stringify(prompts, null, 2);
    console.log(`\n✓ Converted ${prompts.length} prompts`);
    console.log('\nCopy this JSON to localStorage key "ai-toolbox-prompt-library":\n');
    console.log(output);

    return prompts;
}

// Run if executed directly
if (require.main === module) {
    migratePrompts().catch(console.error);
}

export { migratePrompts, convertYAMLToPrompt };
