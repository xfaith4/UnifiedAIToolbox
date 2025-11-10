import http from 'http';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

async function ensureBuild() {
  try {
    await fs.access(path.join(distDir, 'index.html'));
  } catch {
    console.log('ℹ️  Build artifacts missing; running npm run build…');
    await import('./build.mjs');
  }
}

const mimeMap = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function resolveMime(ext) {
  return mimeMap[ext.toLowerCase()] ?? 'text/plain; charset=utf-8';
}

async function start() {
  await ensureBuild();

  const server = http.createServer(async (req, res) => {
    const urlPath = req.url === '/' ? '/index.html' : req.url;
    const filePath = path.join(distDir, decodeURI(urlPath));

    try {
      const data = await fs.readFile(filePath);
      res.writeHead(200, { 'Content-Type': resolveMime(path.extname(filePath)) });
      res.end(data);
    } catch (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      res.end(err.code === 'ENOENT' ? 'Not found' : 'Server error');
    }
  });

  const port = Number(process.env.PORT ?? 4173);
  server.listen(port, () => {
    console.log(`PromptWeb preview running at http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
