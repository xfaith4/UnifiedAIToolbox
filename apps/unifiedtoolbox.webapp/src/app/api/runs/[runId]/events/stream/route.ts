import { GET as appFactoryEventsGet } from '@/app/api/app-factory/runs/[runId]/events/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { runId: string } }) {
  const url = new URL(req.url)
  url.searchParams.set('stream', '1')
  const proxied = new Request(url.toString(), {
    method: 'GET',
    headers: req.headers,
  })
  return appFactoryEventsGet(proxied, { params })
}
