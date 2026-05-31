import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Boxes, CheckCircle2, Circle, ClipboardCopy, FileText, Hammer, Layers, Workflow } from 'lucide-react'
import type { SwarmAgent, SwarmEdge, SwarmNode } from '../types'
import { summarizeRunMessage } from '@/lib/runs/runFailureSummary'

type Point = { x: number; y: number }

type SwarmCanvasProps = {
  agents: SwarmAgent[]
  nodes: SwarmNode[]
  edges: SwarmEdge[]
  phases: string[]
  groupByPhase: boolean
  followLive: boolean
  resetSignal: number
}

function phaseLabel(phase: string): string {
  return phase
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

function nodeTone(status: SwarmNode['status']): string {
  if (status === 'error') return 'border-rose-600/80 bg-rose-950/40 text-rose-100'
  if (status === 'blocked') return 'border-amber-600/80 bg-amber-950/40 text-amber-100'
  if (status === 'working') return 'border-blue-600/80 bg-blue-950/40 text-blue-100'
  if (status === 'complete') return 'border-emerald-600/80 bg-emerald-950/40 text-emerald-100'
  return 'border-slate-700 bg-slate-900/70 text-slate-200'
}

function agentTone(status: SwarmAgent['status']): string {
  if (status === 'error') return 'border-rose-600/70 bg-rose-950/40 text-rose-100'
  if (status === 'working') return 'border-blue-600/70 bg-blue-950/40 text-blue-100'
  if (status === 'complete') return 'border-emerald-600/70 bg-emerald-950/40 text-emerald-100'
  if (status === 'skipped') return 'border-slate-700/50 bg-slate-900/40 text-slate-500'
  return 'border-slate-700 bg-slate-900/70 text-slate-200'
}

function statusDot(status: SwarmAgent['status']): string {
  if (status === 'error') return 'bg-rose-400'
  if (status === 'working') return 'bg-blue-400 animate-pulse'
  if (status === 'complete') return 'bg-emerald-400'
  if (status === 'skipped') return 'bg-slate-600'
  return 'bg-slate-500'
}

function edgeTone(kind: SwarmEdge['kind']): string {
  return kind === 'assignment' ? 'rgba(59, 130, 246, 0.5)' : 'rgba(148, 163, 184, 0.35)'
}

function nodeIcon(kind: SwarmNode['kind']) {
  if (kind === 'phase') return <Layers className="h-4 w-4" />
  if (kind === 'gate') return <Workflow className="h-4 w-4" />
  if (kind === 'artifact') return <FileText className="h-4 w-4" />
  if (kind === 'export') return <AlertTriangle className="h-4 w-4" />
  if (kind === 'task') return <Hammer className="h-4 w-4" />
  return <Boxes className="h-4 w-4" />
}

function nodeContextText(node: SwarmNode): string {
  const lines = [
    `Node: ${node.label}`,
    `Status: ${node.status}`,
    `Kind: ${node.kind}`,
    `Phase: ${node.phase || '—'}`,
    `Agent: ${node.agent || '—'}`,
    `Events: ${node.eventCount}`,
    `First seen: ${node.firstTs}`,
    `Last updated: ${node.lastTs}`,
  ]
  if (node.message) lines.push(`Message: ${summarizeRunMessage(node.message)}`)
  return lines.join('\n')
}

const MIN_SCALE = 0.35
const MAX_SCALE = 2
const ZOOM_STEP = 0.15

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

type ViewportButtonProps = {
  label: string
  onClick: () => void
}

function ViewportButton({ label, onClick }: ViewportButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-xs font-medium text-slate-200 transition-colors hover:border-slate-600 hover:text-white"
    >
      {label}
    </button>
  )
}

export default function SwarmCanvas({ agents, nodes, edges, phases, groupByPhase, followLive, resetSignal }: SwarmCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [expandedNode, setExpandedNode] = useState<string | null>(null)
  const [copiedNodeId, setCopiedNodeId] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [expanded, setExpanded] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const panStateRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null)

  const handleCopyNode = async (node: SwarmNode) => {
    try {
      await navigator.clipboard.writeText(nodeContextText(node))
      setCopiedNodeId(node.id)
      setTimeout(() => setCopiedNodeId(null), 2000)
    } catch { /* clipboard unavailable */ }
  }

  const layout = useMemo(() => {
    const nodePoints = new Map<string, Point>()
    const agentPoints = new Map<string, Point>()
    const phaseAnchors = new Map<string, Point>()

    const orderedNodes = [...nodes].sort((a, b) => {
      if (a.firstTs === b.firstTs) return a.id.localeCompare(b.id)
      return a.firstTs.localeCompare(b.firstTs)
    })

    const phaseOrder = phases.length ? phases : Array.from(new Set(orderedNodes.map((node) => node.phase || 'misc')))
    const phaseIndex = new Map(phaseOrder.map((phase, idx) => [phase, idx]))

    if (groupByPhase) {
      const buckets = new Map<string, SwarmNode[]>()
      for (const node of orderedNodes) {
        const phase = node.phase || 'misc'
        const list = buckets.get(phase) || []
        list.push(node)
        buckets.set(phase, list)
      }

      for (const phase of phaseOrder) {
        const column = phaseIndex.get(phase) || 0
        const x = 300 + column * 320
        phaseAnchors.set(phase, { x, y: 155 })

        const nodesInPhase = buckets.get(phase) || []
        nodesInPhase.forEach((node, row) => {
          nodePoints.set(node.id, { x, y: 200 + row * 180 })
        })
      }
    } else {
      orderedNodes.forEach((node, idx) => {
        const col = idx % 4
        const row = Math.floor(idx / 4)
        nodePoints.set(node.id, { x: 280 + col * 320, y: 200 + row * 180 })
      })
      phaseOrder.forEach((phase, idx) => {
        phaseAnchors.set(phase, { x: 280 + idx * 220, y: 155 })
      })
    }

    agents.forEach((agent, idx) => {
      const col = idx % 6
      const row = Math.floor(idx / 6)
      agentPoints.set(`agent:${agent.id}`, { x: 220 + col * 180, y: 28 + row * 72 })
    })

    const allPoints = [
      ...Array.from(nodePoints.values()),
      ...Array.from(agentPoints.values()),
      ...Array.from(phaseAnchors.values()),
    ]

    const maxX = allPoints.length ? Math.max(...allPoints.map((point) => point.x)) : 0
    const maxY = allPoints.length ? Math.max(...allPoints.map((point) => point.y)) : 0

    return {
      nodePoints,
      agentPoints,
      phaseAnchors,
      width: Math.max(1300, maxX + 260),
      height: Math.max(760, maxY + 260),
      latestNodeId: orderedNodes.length ? orderedNodes[orderedNodes.length - 1].id : null,
      phaseOrder,
    }
  }, [agents, nodes, phases, groupByPhase])

  useEffect(() => {
    if (resetSignal === 0) return
    const id = window.setTimeout(() => {
      const viewport = containerRef.current
      setExpandedNode(null)
      setScale(1)
      if (!viewport) return
      window.requestAnimationFrame(() => {
        viewport.scrollTo({ left: 0, top: 0, behavior: 'smooth' })
      })
    }, 0)
    return () => window.clearTimeout(id)
  }, [resetSignal])

  useEffect(() => {
    if (!expanded) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpanded(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [expanded])

  const centerGraph = useCallback((targetScale: number, behavior: ScrollBehavior = 'smooth') => {
    const viewport = containerRef.current
    if (!viewport) return
    const maxLeft = Math.max(0, layout.width * targetScale - viewport.clientWidth)
    const maxTop = Math.max(0, layout.height * targetScale - viewport.clientHeight)
    viewport.scrollTo({
      left: maxLeft / 2,
      top: maxTop / 2,
      behavior,
    })
  }, [layout.height, layout.width])

  const centerNode = useCallback((nodeId: string, targetScale: number, behavior: ScrollBehavior = 'smooth') => {
    const viewport = containerRef.current
    const point = layout.nodePoints.get(nodeId)
    if (!viewport || !point) return

    const nodeWidth = expandedNode === nodeId ? 320 : 224
    const targetX = point.x + nodeWidth / 2
    const targetY = point.y + 48
    const maxLeft = Math.max(0, layout.width * targetScale - viewport.clientWidth)
    const maxTop = Math.max(0, layout.height * targetScale - viewport.clientHeight)

    viewport.scrollTo({
      left: clamp(targetX * targetScale - viewport.clientWidth / 2, 0, maxLeft),
      top: clamp(targetY * targetScale - viewport.clientHeight / 2, 0, maxTop),
      behavior,
    })
  }, [expandedNode, layout.height, layout.nodePoints, layout.width])

  const applyScale = useCallback((nextScale: number) => {
    const viewport = containerRef.current
    const clamped = clamp(nextScale, MIN_SCALE, MAX_SCALE)
    if (!viewport) {
      setScale(clamped)
      return
    }

    const centerX = viewport.scrollLeft + viewport.clientWidth / 2
    const centerY = viewport.scrollTop + viewport.clientHeight / 2
    const worldX = centerX / scale
    const worldY = centerY / scale

    setScale(clamped)
    window.requestAnimationFrame(() => {
      const maxLeft = Math.max(0, layout.width * clamped - viewport.clientWidth)
      const maxTop = Math.max(0, layout.height * clamped - viewport.clientHeight)
      viewport.scrollTo({
        left: clamp(worldX * clamped - viewport.clientWidth / 2, 0, maxLeft),
        top: clamp(worldY * clamped - viewport.clientHeight / 2, 0, maxTop),
        behavior: 'auto',
      })
    })
  }, [layout.height, layout.width, scale])

  const handleFitView = useCallback(() => {
    const viewport = containerRef.current
    if (!viewport) return
    const nextScale = clamp(
      Math.min(
        (viewport.clientWidth - 48) / layout.width,
        (viewport.clientHeight - 48) / layout.height,
        1,
      ),
      MIN_SCALE,
      MAX_SCALE,
    )
    setScale(nextScale)
    window.requestAnimationFrame(() => centerGraph(nextScale))
  }, [centerGraph, layout.height, layout.width])

  const handleResetView = useCallback(() => {
    const viewport = containerRef.current
    setExpandedNode(null)
    setScale(1)
    if (!viewport) return
    window.requestAnimationFrame(() => {
      viewport.scrollTo({ left: 0, top: 0, behavior: 'smooth' })
    })
  }, [])

  const stopPanning = useCallback(() => {
    panStateRef.current = null
    setIsPanning(false)
  }, [])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement | null
    if (target?.closest('[data-swarm-interactive="true"]')) return
    const viewport = containerRef.current
    if (!viewport) return
    panStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    }
    setIsPanning(true)
  }, [])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const panState = panStateRef.current
    const viewport = containerRef.current
    if (!panState || !viewport) return
    event.preventDefault()
    viewport.scrollLeft = panState.scrollLeft - (event.clientX - panState.startX)
    viewport.scrollTop = panState.scrollTop - (event.clientY - panState.startY)
  }, [])

  useEffect(() => {
    if (!followLive || !layout.latestNodeId) return
    centerNode(layout.latestNodeId, scale)
  }, [centerNode, followLive, layout.latestNodeId, nodes.length, scale])

  const lines = edges
    .map((edge) => {
      const from = layout.agentPoints.get(edge.from) || layout.nodePoints.get(edge.from)
      const to = layout.nodePoints.get(edge.to) || layout.agentPoints.get(edge.to)
      if (!from || !to) return null
      return { edge, from, to }
    })
    .filter((edge): edge is { edge: SwarmEdge; from: Point; to: Point } => Boolean(edge))

  const canvasMarkup = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <ViewportButton label="Fit" onClick={handleFitView} />
          <ViewportButton label="Zoom +" onClick={() => applyScale(scale + ZOOM_STEP)} />
          <ViewportButton label="Zoom -" onClick={() => applyScale(scale - ZOOM_STEP)} />
          <ViewportButton label="Reset" onClick={handleResetView} />
          <ViewportButton label={expanded ? 'Close' : 'Expand'} onClick={() => setExpanded((prev) => !prev)} />
        </div>
        <div className="text-[11px] text-slate-500">
          {Math.round(scale * 100)}% · drag the canvas to pan
        </div>
      </div>

      <div
        ref={containerRef}
        className={`min-h-0 min-w-0 flex-1 select-none overflow-auto rounded-b-2xl ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopPanning}
        onPointerLeave={stopPanning}
      >
        <div className="relative" style={{ width: layout.width * scale, height: layout.height * scale }}>
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}
          >
            <svg className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height}>
              {lines.map(({ edge, from, to }) => (
                <line
                  key={edge.id}
                  x1={from.x}
                  y1={from.y + 16}
                  x2={to.x}
                  y2={to.y + 16}
                  stroke={edgeTone(edge.kind)}
                  strokeDasharray={edge.kind === 'assignment' ? '4 4' : '0'}
                  strokeWidth={edge.kind === 'assignment' ? 1.25 : 1}
                />
              ))}
            </svg>

            {layout.phaseOrder.map((phase) => {
              const anchor = layout.phaseAnchors.get(phase)
              if (!anchor) return null
              return (
                <div
                  key={`phase-anchor-${phase}`}
                  className="absolute -translate-x-1/2 rounded-full border border-slate-700 bg-slate-950/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300"
                  style={{ left: anchor.x, top: anchor.y }}
                >
                  {phaseLabel(phase)}
                </div>
              )
            })}

            {agents.map((agent) => {
              const point = layout.agentPoints.get(`agent:${agent.id}`)
              if (!point) return null
              return (
                <div
                  key={`agent-${agent.id}`}
                  className={`absolute -translate-x-1/2 rounded-xl border px-3 py-2 text-xs shadow ${agentTone(agent.status)}`}
                  style={{ left: point.x, top: point.y }}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${statusDot(agent.status)}`} />
                    <span className="font-semibold">{agent.name}</span>
                  </div>
                  <div className="mt-1 text-[10px] opacity-80">{agent.phase ? phaseLabel(agent.phase) : 'No phase yet'}</div>
                </div>
              )
            })}

            {nodes.map((node) => {
              const point = layout.nodePoints.get(node.id)
              if (!point) return null
              const isExpanded = expandedNode === node.id
              const isCopied = copiedNodeId === node.id
              return (
                <div
                  key={node.id}
                  ref={(element) => {
                    nodeRefs.current[node.id] = element
                  }}
                  data-swarm-interactive="true"
                  className={`absolute -translate-x-1/2 cursor-pointer rounded-xl border px-3 py-2 text-xs shadow-sm transition-all ${
                    isExpanded ? 'w-80 z-20' : 'w-56'
                  } ${nodeTone(node.status)}`}
                  style={{ left: point.x, top: point.y }}
                  onClick={() => setExpandedNode(isExpanded ? null : node.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2 font-semibold">
                      {nodeIcon(node.kind)}
                      <span className={isExpanded ? 'break-words' : 'truncate'}>{node.label}</span>
                    </div>
                    {node.status === 'complete' ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : node.status === 'working' ? (
                      <Circle className="h-4 w-4 shrink-0 animate-pulse" />
                    ) : node.status === 'error' || node.status === 'blocked' ? (
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                    ) : null}
                  </div>

                  <div className="mt-1 text-[10px] opacity-80">
                    {node.phase ? phaseLabel(node.phase) : 'Unmapped phase'}
                    {node.agent ? ` · ${node.agent}` : ''}
                  </div>
                  <div className="mt-1 text-[10px] opacity-70">{new Date(node.lastTs).toLocaleTimeString()} · {node.eventCount} event(s)</div>
                  {node.message && (
                    <p className={`mt-1 text-[10px] opacity-80 ${isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                      {summarizeRunMessage(node.message)}
                    </p>
                  )}

                  {isExpanded && (
                    <div className="mt-2 space-y-1 border-t border-current/20 pt-2">
                      <div className="text-[10px] opacity-70">Kind: {node.kind} · Status: {node.status}</div>
                      <div className="text-[10px] opacity-70">First: {new Date(node.firstTs).toLocaleString()}</div>
                      <div className="text-[10px] opacity-70">Last: {new Date(node.lastTs).toLocaleString()}</div>
                      <button
                        type="button"
                        data-swarm-interactive="true"
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleCopyNode(node)
                        }}
                        className="mt-1 inline-flex items-center gap-1 rounded-md border border-current/30 bg-black/20 px-2 py-1 text-[10px] font-medium hover:bg-black/30"
                      >
                        <ClipboardCopy className="h-3 w-3" />
                        {isCopied ? 'Copied!' : 'Copy Node Context'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
                Waiting for swarm task nodes from run events...
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )

  return (
    <>
      {expanded && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm"
          onClick={() => setExpanded(false)}
          aria-hidden="true"
        />
      )}

      <section
        className={
          expanded
            ? 'fixed inset-4 z-50 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/95 shadow-2xl'
            : 'flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/45'
        }
        role={expanded ? 'dialog' : undefined}
        aria-modal={expanded || undefined}
        aria-label="Swarm graph viewport"
      >
        {canvasMarkup}
      </section>
    </>
  )
}
