import { GET as appFactoryEventsGet } from '@/app/api/app-factory/runs/[runId]/events/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params: _params }: { params: Promise<{ runId: string }> }) {
  const params = await _params
  const url = new URL(req.url)
  if (!url.searchParams.has('offset')) {
    url.searchParams.set('offset', '0')
  }
  const proxied = new Request(url.toString(), {
    method: 'GET',
    headers: req.headers,
  })
  return appFactoryEventsGet(proxied, { params: Promise.resolve(params) })
}
