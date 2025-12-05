/**
 * Client-side telemetry library for dashboard
 * 
 * Batches and throttles telemetry events before sending to backend.
 * Events are stored locally and sent in batches to reduce network overhead.
 */

export interface TelemetryEvent {
  timestamp: string
  eventType: string
  source: string
  metadata: Record<string, any>
  schema_version: string
}

interface TelemetryConfig {
  enabled: boolean
  batchSize: number
  flushInterval: number // milliseconds
  endpoint: string
}

class TelemetryClient {
  private config: TelemetryConfig
  private eventQueue: TelemetryEvent[] = []
  private flushTimer: number | null = null
  private lastFlushTime: number = Date.now()

  constructor(config?: Partial<TelemetryConfig>) {
    this.config = {
      enabled: true,
      batchSize: 10,
      flushInterval: 30000, // 30 seconds
      endpoint: '/api/telemetry',
      ...config,
    }

    // Flush on page unload using synchronous sendBeacon
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flushOnUnload())
    }

    // Start periodic flush timer
    this.startFlushTimer()
  }

  /**
   * Send a telemetry event
   */
  public track(eventType: string, metadata: Record<string, any> = {}): void {
    if (!this.config.enabled) {
      return
    }

    const event: TelemetryEvent = {
      timestamp: new Date().toISOString(),
      eventType,
      source: 'DashboardWebApp',
      metadata: {
        ...metadata,
        userAgent: navigator.userAgent,
        url: window.location.href,
        pathname: window.location.pathname,
      },
      schema_version: '1.0',
    }

    this.eventQueue.push(event)

    // Auto-flush if batch size reached
    if (this.eventQueue.length >= this.config.batchSize) {
      this.flush()
    }
  }

  /**
   * Flush queued events to backend
   */
  public async flush(): Promise<void> {
    if (this.eventQueue.length === 0) {
      return
    }

    const eventsToSend = [...this.eventQueue]
    this.eventQueue = []
    this.lastFlushTime = Date.now()

    try {
      // Send to backend
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ events: eventsToSend }),
      })

      if (!response.ok) {
        console.warn('Failed to send telemetry events:', response.statusText)
        // Don't re-queue events to avoid infinite loops
      }
    } catch (error) {
      console.warn('Failed to send telemetry events:', error)
      // Don't re-queue events to avoid infinite loops
    }
  }

  /**
   * Synchronous flush using sendBeacon for page unload
   */
  private flushOnUnload(): void {
    if (this.eventQueue.length === 0) {
      return
    }

    const eventsToSend = [...this.eventQueue]
    this.eventQueue = []

    // Use sendBeacon for reliable delivery on page unload
    if (navigator.sendBeacon) {
      const blob = new Blob(
        [JSON.stringify({ events: eventsToSend })],
        { type: 'application/json' }
      )
      navigator.sendBeacon(this.config.endpoint, blob)
    }
  }

  /**
   * Start periodic flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
    }

    this.flushTimer = window.setInterval(() => {
      const timeSinceLastFlush = Date.now() - this.lastFlushTime
      
      // Only flush if we have events and enough time has passed
      if (this.eventQueue.length > 0 && timeSinceLastFlush >= this.config.flushInterval) {
        this.flush()
      }
    }, this.config.flushInterval)
  }

  /**
   * Enable or disable telemetry
   */
  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled
    
    if (!enabled) {
      // Clear queue when disabling
      this.eventQueue = []
    }
  }

  /**
   * Update configuration
   */
  public configure(config: Partial<TelemetryConfig>): void {
    this.config = { ...this.config, ...config }
    
    if (config.flushInterval) {
      this.startFlushTimer()
    }
  }
}

// Singleton instance
let telemetryClient: TelemetryClient | null = null

/**
 * Get or initialize the telemetry client
 */
export function getTelemetryClient(config?: Partial<TelemetryConfig>): TelemetryClient {
  if (!telemetryClient) {
    telemetryClient = new TelemetryClient(config)
  } else if (config) {
    telemetryClient.configure(config)
  }
  
  return telemetryClient
}

/**
 * Track a telemetry event (convenience function)
 */
export function track(eventType: string, metadata: Record<string, any> = {}): void {
  const client = getTelemetryClient()
  client.track(eventType, metadata)
}

/**
 * Track page view
 */
export function trackPageView(pageName: string, metadata: Record<string, any> = {}): void {
  track('PRDashboard.View', {
    page: pageName,
    ...metadata,
  })
}

/**
 * Track filter change
 */
export function trackFilterChange(filterType: string, filterValue: string): void {
  track('PRDashboard.FilterChange', {
    filterType,
    filterValue,
  })
}

/**
 * Track sort change
 */
export function trackSortChange(sortBy: string): void {
  track('PRDashboard.SortChange', {
    sortBy,
  })
}

/**
 * Track search
 */
export function trackSearch(query: string): void {
  track('PRDashboard.Search', {
    query,
    queryLength: query.length,
  })
}
