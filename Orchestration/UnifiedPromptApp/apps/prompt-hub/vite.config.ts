import { createServer } from 'node:net'
import process from 'node:process'

import react from '@vitejs/plugin-react-swc'
import { defineConfig, loadEnv, type PluginOption } from 'vite'

const DEFAULT_DEV_PORT = 5173
const DEFAULT_PREVIEW_PORT = 4173
const DEFAULT_MAX_ATTEMPTS = 25
const DEFAULT_HOST = '127.0.0.1'

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const value = Number(raw)
  if (Number.isInteger(value) && value > 0 && value < 65_535) {
    return value
  }
  return fallback
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const value = Number(raw)
  if (Number.isInteger(value) && value > 0) {
    return value
  }
  return fallback
}

async function canBind(host: string, port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()

    server.once('error', (err) => {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? /** @type {{ code?: string }} */ (err).code
          : undefined
      if (code === 'EADDRINUSE' || code === 'EACCES') {
        resolve(false)
        return
      }
      reject(err instanceof Error ? err : new Error(String(err)))
    })

    server.listen({ host, port, exclusive: true }, () => {
      server.close(() => resolve(true))
    })
  })
}

async function findAvailablePort(
  host: string,
  preferredPort: number,
  maxAttempts: number
): Promise<number> {
  let attempts = 0
  let candidate = preferredPort

  while (attempts < maxAttempts && candidate < 65_535) {
    if (await canBind(host, candidate)) {
      return candidate
    }

    attempts += 1
    candidate += 1
  }

  throw new Error(
    `Unable to find an available port (host: ${host}, starting from: ${preferredPort})`
  )
}

interface PortGuardOptions {
  host: string
  devPort: number
  previewPort: number
  maxAttempts: number
}

function ensureFreePort({
  host,
  devPort,
  previewPort,
  maxAttempts,
}: PortGuardOptions): PluginOption {
  return {
    name: 'prompt-library:ensure-free-port',
    enforce: 'pre',
    async config(userConfig, ctx) {
      if (ctx.command !== 'serve' && ctx.command !== 'preview') {
        return
      }

      const requestedPort = ctx.command === 'serve' ? devPort : previewPort
      const resolvedPort = await findAvailablePort(
        host,
        requestedPort,
        maxAttempts
      )

      if (resolvedPort !== requestedPort) {
        process.stdout.write(
          `\n[prompt-library] Port ${requestedPort} unavailable. Using ${resolvedPort}.\n`
        )
      }

      process.env.PORT = String(resolvedPort)
      process.env.VITE_PORT = String(resolvedPort)

      if (ctx.command === 'serve') {
        return {
          server: {
            ...(userConfig.server ?? {}),
            host,
            port: resolvedPort,
            strictPort: true,
            cors: true,
          },
        }
      }

      return {
        preview: {
          ...(userConfig.preview ?? {}),
          host,
          port: resolvedPort,
          strictPort: true,
        },
      }
    },
  }
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const host = env.VITE_HOST || env.HOST || DEFAULT_HOST
  const devPort = parsePort(
    env.VITE_DEV_PORT || env.VITE_PORT || env.PORT,
    DEFAULT_DEV_PORT
  )
  const previewPort = parsePort(
    env.VITE_PREVIEW_PORT || env.PREVIEW_PORT,
    DEFAULT_PREVIEW_PORT
  )
  const maxAttempts = parsePositiveInt(
    env.VITE_PORT_SCAN_MAX,
    DEFAULT_MAX_ATTEMPTS
  )

  const drop =
    command === 'build'
      ? (['console', 'debugger'] as ('console' | 'debugger')[])
      : []

  return {
    plugins: [
      react(),
      ensureFreePort({ host, devPort, previewPort, maxAttempts }),
    ],
    server: {
      host,
      strictPort: true,
      cors: true,
    },
    preview: {
      host,
      strictPort: true,
    },
    build: {
      target: 'es2019',
      sourcemap: false,
      minify: 'esbuild',
      reportCompressedSize: false,
      chunkSizeWarningLimit: 1024,
      assetsInlineLimit: 4096,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
    },
    esbuild: {
      drop,
      logOverride: {
        'this-is-undefined-in-esm': 'silent',
      },
    },
    css: {
      devSourcemap: false,
    },
    envPrefix: 'VITE_',
  }
})
