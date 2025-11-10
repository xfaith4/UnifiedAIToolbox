import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const srcDir = path.join(projectRoot, 'src');
const repoRoot = path.resolve(projectRoot, '..', '..');
const promptsDir = path.join(repoRoot, 'data', 'prompts');

async function ensureDist() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });
}

async function copyStatic() {
  await copyDir(srcDir, distDir);
}

async function copyDir(source, destination) {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function collectPromptFiles() {
  async function* walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const nextPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        yield* walk(nextPath);
      } else if (entry.isFile() && entry.name.endsWith('.prompt.yaml')) {
        yield nextPath;
      }
    }
  }

  const results = [];
  try {
    for await (const file of walk(promptsDir)) {
      results.push(file);
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  return results;
}

function summarizePrompt(doc, filePath) {
  const id = doc.id || path.basename(filePath).replace('.prompt.yaml', '');
  const title = doc.title || id;
  const instructions = doc.blocks?.instructions ?? doc.user_template ?? '';
  const system = doc.blocks?.system ?? doc.system ?? '';
  const descriptionSource = instructions || system;
  const description = descriptionSource
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) || 'Prompt definition';
  const preview = [
    system ? `System: ${system.trim()}` : null,
    instructions ? `Instructions: ${instructions.trim()}` : null
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 600);

  return {
    id,
    title,
    category: id.split('.')[0] || 'general',
    description,
    preview
  };
}

async function buildPromptIndex() {
  const files = await collectPromptFiles();
  const prompts = [];

  for (const file of files) {
    try {
      const raw = await fs.readFile(file, 'utf8');
      const document = parse(raw);
      prompts.push(summarizePrompt(document ?? {}, file));
    } catch (err) {
      console.warn(`⚠️  Skipping ${file}: ${err.message}`);
    }
  }

  const payload = {
    generatedUtc: new Date().toISOString(),
    total: prompts.length,
    prompts: prompts.sort((a, b) => a.title.localeCompare(b.title))
  };

  await fs.writeFile(
    path.join(distDir, 'prompts.json'),
    JSON.stringify(payload, null, 2),
    'utf8'
  );
}

async function main() {
  await ensureDist();
  await copyStatic();
  await buildPromptIndex();
  console.log(`✨ Built PromptWeb assets → ${path.relative(projectRoot, distDir)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
