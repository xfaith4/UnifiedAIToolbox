export type UxEventName =
  | 'page_view'
  | 'cta_click'
  | 'form_submit'
  | 'validation_error'
  | 'api_error'
  | 'empty_state_seen'
  | 'time_to_interactive'
  | 'rage_click'
  | 'dead_click'
  | 'scroll_depth'
  | 'dropoff'
  | 'exception'

export type UxEvent = {
  name: UxEventName
  ts: string
  sessionId: string
  route?: string
  details?: Record<string, unknown>
}

type Subscriber = (events: readonly UxEvent[]) => void

const MAX_EVENTS = 200

let sessionId: string | null = null
let events: UxEvent[] = []
let subscribers: Subscriber[] = []
let inflightFetches = 0
const lastPageHideAt = 0

function getOrCreateSessionId() {
  if (sessionId) return sessionId
  if (typeof window === 'undefined') {
    sessionId = 'server'
    return sessionId
  }

  const existing = window.sessionStorage.getItem('utb_ux_session')
  if (existing) {
    sessionId = existing
    return sessionId
  }

  const created = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  window.sessionStorage.setItem('utb_ux_session', created)
  sessionId = created
  return created
}

export function getInflightFetchCount() {
  return inflightFetches
}

export function getUxEvents() {
  return events
}

export function subscribeUxEvents(subscriber: Subscriber) {
  subscribers = [...subscribers, subscriber]
  subscriber(events)
  return () => {
    subscribers = subscribers.filter((s) => s !== subscriber)
  }
}

function notify() {
  for (const subscriber of subscribers) subscriber(events)
}

async function postToTelemetryApi(event: UxEvent) {
  if (typeof window === 'undefined') return
  if (process.env.NODE_ENV === 'production') return

  try {
    const payload = JSON.stringify(event)

    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' })
      navigator.sendBeacon('/api/telemetry', blob)
      return
    }

    void fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      keepalive: true,
    })
  } catch {
    // best-effort
  }
}

export function trackUxEvent(name: UxEventName, input?: { route?: string; details?: Record<string, unknown> }) {
  const event: UxEvent = {
    name,
    ts: new Date().toISOString(),
    sessionId: getOrCreateSessionId(),
    route: input?.route,
    details: input?.details,
  }

  events = [...events, event].slice(-MAX_EVENTS)

  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
    // Playwright + local debugging friendly
    console.log('UX_EVENT', JSON.stringify(event))
  }

  void postToTelemetryApi(event)
  notify()
}

export function installUxInstrumentation(options: {
  getRoute: () => string
}) {
  if (typeof window === 'undefined') return

  // Only install once
  const key = '__utbUxInstalled'
  if ((window as unknown as Record<string, unknown>)[key]) return
  ;(window as unknown as Record<string, unknown>)[key] = true

  const getRoute = options.getRoute

  // Track when the page is unloading/hidden so we can avoid logging noisy "api_error"
  // events caused by navigation/unmount cancellations.
  let pageUnloading = false
  const markUnloading = () => {
    pageUnloading = true
  }

  window.addEventListener('pagehide', markUnloading)
  window.addEventListener('beforeunload', markUnloading)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') markUnloading()
  })

  // Time to interactive (rough)
  window.addEventListener('load', () => {
    trackUxEvent('time_to_interactive', {
      route: getRoute(),
      details: { navigationType: performance.getEntriesByType('navigation')[0]?.entryType },
    })
  })

  // Fetch instrumentation
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {

    const startedAt = performance.now()
    inflightFetches += 1
    notify()
    try {
      const response = await originalFetch(input, init)
      const durationMs = Math.round(performance.now() - startedAt)
      if (!response.ok) {
        // Only track API errors if the page isn't unloading
        if (!pageUnloading) {
          trackUxEvent('api_error', {
            route: getRoute(),
            details: {
              url: typeof input === 'string' ? input : (input as URL).toString?.() ?? 'request',
              status: response.status,
              durationMs,
            },
          })
        }
      }
      return response
    } catch (error) {
      const aborted = Boolean(init?.signal?.aborted)
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'

      // Ignore fetch failures caused by navigation/unmount aborts or page unloading.
      // This keeps synthetic navigation runs from producing noisy "Failed to fetch" api_error events.
      if (!aborted && !pageUnloading && !hidden) {
        const durationMs = Math.round(performance.now() - startedAt)
        trackUxEvent('api_error', {
          route: getRoute(),
          details: {
            url: typeof input === 'string' ? input : (input as URL).toString?.() ?? 'request',
            status: 'network_error',
            durationMs,
            message: error instanceof Error ? error.message : String(error),
          },
        })
      }

      throw error
    } finally {
      inflightFetches = Math.max(0, inflightFetches - 1)
      notify()
    }
  }

  // Click instrumentation (rage/dead clicks, CTA clicks)
  const recentClicks: Array<{ ts: number; signature: string }> = []
  window.addEventListener(
    'click',
    (event) => {
      const target = event.target as HTMLElement
      const cta = target.closest('[data-cta]')
      if (!cta) return

      const signature = cta.getAttribute('data-cta') || cta.textContent?.trim() || 'unknown_cta'
      if (!signature) return

      const now = Date.now()
      recentClicks.push({ ts: now, signature })

      // Keep last 2s
      while (recentClicks.length > 0 && now - recentClicks[0].ts > 2000) recentClicks.shift()

      const same = recentClicks.filter((c) => c.signature === signature && now - c.ts < 1000)
      if (same.length >= 4) {
        trackUxEvent('rage_click', {
          route: getRoute(),
          details: { signature, count: same.length },
        })
      }

      trackUxEvent('cta_click', {
        route: getRoute(),
        details: { signature },
      })
    },
    { capture: true }
  )

  // Scroll depth
  const seenDepthByRoute = new Map<string, Set<number>>()
  const depthThresholds = [25, 50, 75, 100]

  const onScroll = () => {
    const route = getRoute()
    const doc = document.documentElement
    const maxScroll = Math.max(1, doc.scrollHeight - doc.clientHeight)
    const pct = Math.min(100, Math.round((window.scrollY / maxScroll) * 100))

    const seen = seenDepthByRoute.get(route) ?? new Set<number>()
    seenDepthByRoute.set(route, seen)

    for (const t of depthThresholds) {
      if (pct >= t && !seen.has(t)) {
        seen.add(t)
        trackUxEvent('scroll_depth', { route, details: { pct: t } })
      }
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true })
}
