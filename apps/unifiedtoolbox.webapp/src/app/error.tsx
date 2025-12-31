'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { trackUxEvent } from '@/lib/ux/telemetry'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    trackUxEvent('exception', {
      route: typeof window !== 'undefined' ? window.location.pathname : undefined,
      details: {
        message: error.message,
        digest: error.digest,
      },
    })
  }, [error])

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
          <div className="mx-auto max-w-2xl rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm text-slate-300">
              The portal hit an unexpected error. You can retry, or return to the dashboard.
            </p>

            <pre className="mt-4 overflow-auto rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-200">
              {error.message}
            </pre>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={reset}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
              >
                Try again
              </button>
              <Link
                href="/dashboard"
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
              >
                Go to dashboard
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
