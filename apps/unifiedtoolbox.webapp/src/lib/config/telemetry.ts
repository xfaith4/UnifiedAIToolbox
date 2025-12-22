/**
 * Telemetry configuration for dashboard time windows and refresh intervals
 */
export const TELEMETRY_CONFIG = {
    // Default time window for metrics
    defaultTimeWindow: '7d' as const,

    // Available time windows in milliseconds
    timeWindows: {
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
    },

    // Dashboard refresh interval (1 minute)
    refreshInterval: 60000,

    // Quality score thresholds
    qualityThresholds: {
        experimental: 0,
        validated: 7,
        production: 9,
    },
} as const

export type TimeWindow = keyof typeof TELEMETRY_CONFIG.timeWindows
