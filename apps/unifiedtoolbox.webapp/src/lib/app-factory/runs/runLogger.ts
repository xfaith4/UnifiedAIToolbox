import 'server-only'

/**
 * Minimal run-lifecycle logger.
 *
 * No central logger exists in this app yet; the codebase logs via `console.*`.
 * This wrapper standardises run-lifecycle log lines so we can later swap the
 * sink without touching call sites, and sanitises obvious secrets so they
 * never reach stdout.
 *
 * Log shape (one JSON object per line):
 *   {"ts":"...","level":"info|warn|error","event":"<event>","...fields"}
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const SECRET_KEY_RE = /token|authorization|api[_-]?key|secret|password/i

function redactString(value: string): string {
  let next = value
  next = next.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [REDACTED]')
  next = next.replace(/sk-[A-Za-z0-9]{10,}/g, 'sk-[REDACTED]')
  next = next.replace(/(api[_-]?key|token|authorization|secret|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
  return next
}

function sanitize(input: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!input) return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    if (SECRET_KEY_RE.test(k)) {
      out[k] = '[REDACTED]'
      continue
    }
    if (typeof v === 'string') out[k] = redactString(v)
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = sanitize(v as Record<string, unknown>)
    } else out[k] = v
  }
  return out
}

function emit(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...sanitize(fields),
  }
  const json = JSON.stringify(line)
  switch (level) {
    case 'error':
      console.error(json)
      break
    case 'warn':
      console.warn(json)
      break
    case 'debug':
      if (process.env.NODE_ENV === 'development') console.debug(json)
      break
    default:
      console.log(json)
  }
}

export const runLogger = {
  debug: (event: string, fields?: Record<string, unknown>) => emit('debug', event, fields),
  info: (event: string, fields?: Record<string, unknown>) => emit('info', event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit('warn', event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit('error', event, fields),
}

export type RunLogger = typeof runLogger
