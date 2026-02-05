import { promises as fs } from 'fs'
import path from 'path'
import type { RepoContract } from '../contracts/RepoContract'

export type AssembleChange = { filePath: string; action: 'created' | 'skipped'; reason: string }

export type AssembleRepoResult = {
  changes: AssembleChange[]
  reportPath: string
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath)
    return stat.isFile()
  } catch {
    return false
  }
}

async function ensureFile(repoDir: string, rel: string, content: string, changes: AssembleChange[], reason: string): Promise<void> {
  const full = path.join(repoDir, rel)
  if (await fileExists(full)) {
    changes.push({ filePath: rel.replace(/\\/g, '/'), action: 'skipped', reason: 'already exists' })
    return
  }
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, content.replace(/\r\n/g, '\n'), 'utf8')
  changes.push({ filePath: rel.replace(/\\/g, '/'), action: 'created', reason })
}

function sanitizeStackId(stackId: string): string {
  return stackId.replace(/[^a-z0-9._-]+/gi, '-')
}

export async function assembleRepo(repoDir: string, contract: RepoContract): Promise<AssembleRepoResult> {
  const changes: AssembleChange[] = []

  if (contract.stackId === 'node-next-fastify-pnpm') {
    const rootPkg = JSON.stringify(
      {
        name: 'app-factory-generated',
        private: true,
        packageManager: 'pnpm@9.15.0',
        scripts: {
          build: 'pnpm -r build',
          typecheck: 'pnpm -r typecheck',
          lint: 'pnpm -r lint',
        },
      },
      null,
      2
    )

    await ensureFile(repoDir, 'pnpm-workspace.yaml', `packages:\n  - "apps/*"\n  - "packages/*"\n`, changes, 'pnpm workspace definition')
    await ensureFile(repoDir, 'package.json', `${rootPkg}\n`, changes, 'root workspace package.json')

    const webPkg = JSON.stringify(
      {
        name: 'web',
        private: true,
        scripts: {
          dev: 'next dev -p 3000',
          build: 'next build',
          start: 'next start -p 3000',
          lint: 'next lint',
          typecheck: 'tsc -p tsconfig.json --noEmit',
        },
        dependencies: {
          next: '^16.0.8',
          react: '^19.2.0',
          'react-dom': '^19.2.0',
        },
        devDependencies: {
          typescript: '^5',
          '@types/node': '^20',
          '@types/react': '^19',
          '@types/react-dom': '^19',
          eslint: '^9',
          'eslint-config-next': '^16.0.3',
        },
      },
      null,
      2
    )

    await ensureFile(repoDir, 'apps/web/package.json', `${webPkg}\n`, changes, 'Next.js app package.json')
    await ensureFile(
      repoDir,
      'apps/web/next.config.mjs',
      `/** @type {import('next').NextConfig} */\nconst nextConfig = { reactStrictMode: true }\n\nexport default nextConfig\n`,
      changes,
      'Next.js config'
    )
    await ensureFile(repoDir, 'apps/web/next-env.d.ts', `/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n\nexport {}\n`, changes, 'Next.js type env')
    await ensureFile(
      repoDir,
      'apps/web/tsconfig.json',
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            lib: ['dom', 'dom.iterable', 'esnext'],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: 'esnext',
            moduleResolution: 'bundler',
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: 'preserve',
            incremental: true,
            types: ['node'],
          },
          include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
          exclude: ['node_modules'],
        },
        null,
        2
      ) + '\n',
      changes,
      'Next.js tsconfig'
    )
    await ensureFile(
      repoDir,
      'apps/web/app/layout.tsx',
      `export default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  )\n}\n`,
      changes,
      'Next.js app router layout'
    )
    await ensureFile(
      repoDir,
      'apps/web/app/page.tsx',
      `export default function HomePage() {\n  return (\n    <main style={{ padding: 24, fontFamily: 'system-ui' }}>\n      <h1>App Factory</h1>\n      <p>Generated repo booted successfully.</p>\n    </main>\n  )\n}\n`,
      changes,
      'Next.js app router page'
    )

    const apiPkg = JSON.stringify(
      {
        name: 'api',
        private: true,
        type: 'module',
        scripts: {
          dev: 'tsx watch src/server.ts',
          build: 'tsc -p tsconfig.json',
          start: 'node dist/server.js',
          lint: 'node -e \"console.log(\\\"lint not configured\\\")\"',
          typecheck: 'tsc -p tsconfig.json --noEmit',
        },
        dependencies: {
          fastify: '^4.28.1',
        },
        devDependencies: {
          typescript: '^5',
          tsx: '^4.19.2',
          '@types/node': '^20',
        },
      },
      null,
      2
    )

    await ensureFile(repoDir, 'apps/api/package.json', `${apiPkg}\n`, changes, 'Fastify API package.json')
    await ensureFile(
      repoDir,
      'apps/api/tsconfig.json',
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'ES2022',
            moduleResolution: 'bundler',
            outDir: 'dist',
            rootDir: 'src',
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
          },
          include: ['src/**/*.ts'],
          exclude: ['node_modules', 'dist'],
        },
        null,
        2
      ) + '\n',
      changes,
      'API tsconfig'
    )
    await ensureFile(
      repoDir,
      'apps/api/src/server.ts',
      `import Fastify from 'fastify'\n\nconst port = Number.parseInt(process.env.PORT ?? '3001', 10)\nconst host = process.env.HOST ?? '127.0.0.1'\n\nconst app = Fastify({ logger: true })\n\napp.get('/health', async () => ({ ok: true }))\n\napp.get('/', async () => ({ name: 'api', ok: true }))\n\nawait app.listen({ port, host })\n`,
      changes,
      'Fastify server with /health'
    )

    await ensureFile(repoDir, 'README.md', `# ${sanitizeStackId(contract.stackId)}\n\nGenerated by App Factory.\n`, changes, 'basic readme')
  }

  if (contract.stackId === 'node-next-app-npm') {
    const pkgPath = path.join(repoDir, 'package.json')
    const hasPkg = await fileExists(pkgPath)
    if (!hasPkg) {
      const pkg = JSON.stringify(
        {
          name: 'app-factory-generated',
          private: true,
          scripts: {
            dev: 'next dev -p 3000',
            build: 'next build',
            start: 'next start -p 3000',
            lint: 'next lint',
            typecheck: 'tsc -p tsconfig.json --noEmit',
          },
          dependencies: {
            next: '^16.0.8',
            react: '^19.2.0',
            'react-dom': '^19.2.0',
          },
          devDependencies: {
            typescript: '^5',
            '@types/node': '^20',
            '@types/react': '^19',
            '@types/react-dom': '^19',
            eslint: '^9',
            'eslint-config-next': '^16.0.3',
          },
        },
        null,
        2
      )
      await ensureFile(repoDir, 'package.json', `${pkg}\n`, changes, 'Next.js app package.json')
    }

    await ensureFile(
      repoDir,
      'next.config.mjs',
      `/** @type {import('next').NextConfig} */\nconst nextConfig = { reactStrictMode: true }\n\nexport default nextConfig\n`,
      changes,
      'Next.js config'
    )
    await ensureFile(repoDir, 'next-env.d.ts', `/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n\nexport {}\n`, changes, 'Next.js type env')
    await ensureFile(
      repoDir,
      'tsconfig.json',
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            lib: ['dom', 'dom.iterable', 'esnext'],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: 'esnext',
            moduleResolution: 'bundler',
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: 'preserve',
            incremental: true,
            types: ['node'],
          },
          include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
          exclude: ['node_modules'],
        },
        null,
        2
      ) + '\n',
      changes,
      'Next.js tsconfig'
    )

    await ensureFile(
      repoDir,
      '.eslintrc.json',
      JSON.stringify(
        {
          extends: ['next/core-web-vitals'],
        },
        null,
        2
      ) + '\n',
      changes,
      'ESLint config for next lint'
    )

    const hasSrcApp = await fileExists(path.join(repoDir, 'src', 'app', 'page.tsx'))
    const hasRootApp = await fileExists(path.join(repoDir, 'app', 'page.tsx'))
    const appRoot = hasRootApp ? 'app' : 'src/app'

    await ensureFile(
      repoDir,
      `${appRoot}/layout.tsx`,
      `export default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  )\n}\n`,
      changes,
      'Next.js app router layout'
    )
    await ensureFile(
      repoDir,
      `${appRoot}/page.tsx`,
      `export default function HomePage() {\n  return (\n    <main style={{ padding: 24, fontFamily: 'system-ui' }}>\n      <h1>App Factory</h1>\n      <p>Generated repo booted successfully.</p>\n    </main>\n  )\n}\n`,
      changes,
      'Next.js app router page'
    )
    await ensureFile(
      repoDir,
      `${appRoot}/api/health/route.ts`,
      `import { NextResponse } from 'next/server'\n\nexport function GET() {\n  return NextResponse.json({ ok: true })\n}\n`,
      changes,
      'Health check endpoint'
    )

    await ensureFile(repoDir, 'README.md', `# ${sanitizeStackId(contract.stackId)}\n\nGenerated by App Factory.\n`, changes, 'basic readme')
  }

  const reportPath = path.join(repoDir, 'ASSEMBLY_REPORT.md')
  const reportLines: string[] = [
    '# Assembly Report',
    '',
    `- Stack: ${contract.stackId}`,
    `- Created: ${changes.filter((c) => c.action === 'created').length}`,
    `- Skipped: ${changes.filter((c) => c.action === 'skipped').length}`,
    '',
    '## Changes',
    '',
    ...changes.map((c) => `- \`${c.filePath}\`: ${c.action} (${c.reason})`),
    '',
  ]
  await fs.writeFile(reportPath, reportLines.join('\n'), 'utf8')
  return { changes, reportPath }
}
