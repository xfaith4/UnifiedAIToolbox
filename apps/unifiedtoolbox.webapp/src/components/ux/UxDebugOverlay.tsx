'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  getInflightFetchCount,
  getUxEvents,
  subscribeUxEvents,
  type UxEvent,
} from '@/lib/ux/telemetry'

export function UxDebugOverlay({ enabled }: { enabled: boolean }) {
  const pathname = usePathname()
  const [events, setEvents] = useState<readonly UxEvent[]>(() => getUxEvents())
  const [inflight, setInflight] = useState(() => getInflightFetchCount())
  const [renderAt] = useState(() => Date.now())

  useEffect(() => {
    if (!enabled) return
    return subscribeUxEvents((next) => {
      setEvents(next)
      setInflight(getInflightFetchCount())
    })
  }, [enabled])

  const last10 = useMemo(() => [...events].slice(-10).reverse(), [events])

  if (!enabled) return null

  const width = typeof window !== 'undefined' ? window.innerWidth : 0
  const breakpoint = width >= 1024 ? 'desktop' : width >= 768 ? 'tablet' : 'mobile'

  return (
    <div className="fixed bottom-3 right-3 z-[9999] w-[360px] max-w-[calc(100vw-24px)] rounded-2xl border border-slate-700 bg-slate-950/90 p-3 text-xs text-slate-100 shadow-2xl">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold text-slate-200">UX Debug</div>
          <div className="mt-0.5 text-[10px] text-slate-400">
            route <span className="text-slate-200">{pathname}</span> • {breakpoint} • inflight{' '}
            <span className="text-slate-200">{inflight}</span>
          </div>
        </div>
        <div className="text-[10px] text-slate-500">since {new Date(renderAt).toLocaleTimeString()}</div>
      </div>

      <div className="mt-2 max-h-[220px] overflow-auto rounded-xl border border-slate-800 bg-slate-900/50 p-2">
        {last10.length === 0 ? (
          <div className="text-slate-400">No events yet…</div>
        ) : (
          <ul className="space-y-2">
            {last10.map((ev, index) => (
              <li key={`${ev.ts}-${index}`} className="border-b border-slate-800 pb-2 last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-slate-100">{ev.name}</div>
                  <div className="text-[10px] text-slate-500">{new Date(ev.ts).toLocaleTimeString()}</div>
                </div>
                <div className="mt-0.5 text-[10px] text-slate-400">
                  {ev.route ? ev.route : pathname}
                </div>
                {ev.details && (
                  <pre className="mt-1 overflow-auto rounded-lg bg-slate-950/60 p-2 text-[10px] leading-snug text-slate-200">
                    {JSON.stringify(ev.details, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-2 text-[10px] text-slate-500">
        Tip: append <span className="text-slate-200">?uxdebug=1</span> to any URL.
      </div>
    </div>
  )
}
