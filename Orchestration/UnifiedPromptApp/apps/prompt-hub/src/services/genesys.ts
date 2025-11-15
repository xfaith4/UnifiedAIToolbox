/**
 * Minimal client stubs for Genesys Cloud via your own backend proxy (Pode).
 * In production, never call Genesys APIs directly from the browser with secrets.
 * Point VITE_API_BASE to your proxy that handles OAuth and calls GC securely.
 */
const BASE = (
  import.meta.env.VITE_API_BASE || 'http://localhost:5050/api'
).replace(/\/$/, '')

export interface GenesysContext {
  region: string
  org: string
  token: string
}

export interface GenesysDivision {
  id: string
  name: string
  [key: string]: unknown
}

export type GenesysMetrics = Record<string, unknown>

async function request<T>(
  path: string,
  init: globalThis.RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Proxy error ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  return (await res.json()) as T
}

export async function listDivisions(
  ctx: GenesysContext
): Promise<GenesysDivision[]> {
  // Your Pode API should implement: GET /genesys/:region/:org/divisions
  return request<GenesysDivision[]>(
    `/genesys/${encodeURIComponent(ctx.region)}/${encodeURIComponent(ctx.org)}/divisions`,
    {
      headers: { Authorization: `Bearer ${ctx.token}` },
    }
  )
}

export async function sampleMetrics(
  ctx: GenesysContext
): Promise<GenesysMetrics> {
  // Your Pode API should implement: POST /genesys/:region/:org/metrics
  // Body would include analytics queries you care about.
  return request<GenesysMetrics>(
    `/genesys/${encodeURIComponent(ctx.region)}/${encodeURIComponent(ctx.org)}/metrics`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Example payload placeholders:
        webRtcDisconnects: true,
        sipResponseCounts: true,
        abandonRates: true,
        mosThreshold: 3.5,
      }),
    }
  )
}
