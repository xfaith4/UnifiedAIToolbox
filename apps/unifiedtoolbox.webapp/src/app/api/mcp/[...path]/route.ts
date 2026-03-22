import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FETCH_TIMEOUT_MS = 10000

function resolveBackendBase(): string {
  const raw = (
    process.env.NEXT_PUBLIC_API_BASE ??
    process.env.NEXT_PUBLIC_PROMPT_API_BASE ??
    ''
  ).trim()
  return (raw || 'http://localhost:8000').replace(/\/$/, '')
}

async function proxyMcpRequest(
  req: Request,
  pathSegments: string[]
): Promise<Response> {
  const base = resolveBackendBase()
  const subPath = pathSegments.join('/')
  const reqUrl = new URL(req.url)
  const targetUrl = `${base}/api/mcp/${subPath}${reqUrl.search}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  const forwardHeaders: Record<string, string> = {}
  const contentType = req.headers.get('content-type')
  if (contentType) {
    forwardHeaders['content-type'] = contentType
  }

  let body: BodyInit | null = null
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await req.text()
  }

  let res: Response
  try {
    res = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: body ?? undefined,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }

  const responseText = await res.text()
  return new NextResponse(responseText, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/json',
    },
  })
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  try {
    return await proxyMcpRequest(req, path)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Backend unreachable'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  try {
    return await proxyMcpRequest(req, path)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Backend unreachable'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  try {
    return await proxyMcpRequest(req, path)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Backend unreachable'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  try {
    return await proxyMcpRequest(req, path)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Backend unreachable'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
