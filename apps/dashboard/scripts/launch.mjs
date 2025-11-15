#!/usr/bin/env node

import { spawn } from 'node:child_process'
import net from 'node:net'
import process from 'node:process'

const DEFAULT_PORT = 5173
const RANDOM_PORT_MIN = 1024
const RANDOM_PORT_MAX = 65535
const RANDOM_PORT_SPAN = RANDOM_PORT_MAX - RANDOM_PORT_MIN + 1
const MAX_RANDOM_ATTEMPTS = RANDOM_PORT_SPAN + 1

const envPort =
  Number.parseInt(process.env.PORT ?? process.env.VITE_PORT ?? '', 10) || 0
const requestedPort =
  Number.isInteger(envPort) && envPort > 0 ? envPort : DEFAULT_PORT
const extraArgs = process.argv.slice(2)

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()

    server.once('error', () => {
      resolve(false)
    })

    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true))
    })
  })
}

async function findAvailablePort(startPort, maxAttempts = MAX_RANDOM_ATTEMPTS) {
  const attempted = new Set()
  let attemptedRandom = 0

  function pickRandomPort() {
    if (attemptedRandom >= RANDOM_PORT_SPAN) {
      throw new Error(
        `Exhausted random port attempts between ${RANDOM_PORT_MIN}-${RANDOM_PORT_MAX}.`
      )
    }

    let candidate = 0
    do {
      candidate =
        RANDOM_PORT_MIN + Math.floor(Math.random() * RANDOM_PORT_SPAN)
    } while (attempted.has(candidate))

    return candidate
  }

  let port = startPort
  let attempts = 0

  while (attempts < maxAttempts) {
    if (attempted.has(port)) {
      port = pickRandomPort()
      continue
    }

    attempted.add(port)
    attempts += 1

    if (await checkPort(port)) {
      return port
    }

    if (port >= RANDOM_PORT_MIN && port <= RANDOM_PORT_MAX) {
      attemptedRandom += 1
    }

    if (attempts >= maxAttempts) {
      break
    }

    port = pickRandomPort()
  }

  throw new Error(
    `No open port found after ${attempts} attempts (checked starting from ${startPort}).`
  )
}

function runVite(port) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const args = ['run', 'dev', '--', '--port', String(port), ...extraArgs]

  const child = spawn(npmCommand, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(port),
      VITE_PORT: String(port),
    },
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 0)
  })

  child.on('error', (err) => {
    console.error('Failed to launch Vite:', err)
    process.exit(1)
  })
}

async function main() {
  try {
    const port = await findAvailablePort(requestedPort)
    if (port !== requestedPort) {
      console.log(
        `Port ${requestedPort} is busy. Launching dev server on ${port} instead.`
      )
    } else {
      console.log(`Launching dev server on port ${port}.`)
    }
    runVite(port)
  } catch (err) {
    console.error((err && err.message) || err)
    process.exit(1)
  }
}

await main()
