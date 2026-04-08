import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Boxes, CheckCircle2, Circle, ClipboardCopy, FileText, Hammer, Layers, Workflow } from 'lucide-react'
import type { SwarmAgent, SwarmEdge, SwarmNode } from '../types'

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
  if (node.message) lines.push(`Message: ${node.message}`)
  return lines.join('\n')
}

export default function SwarmCanvas({ agents, nodes, edges, phases, groupByPhase, followLive, resetSignal }: SwarmCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [expandedNode, setExpandedNode] = useState<string | null>(null)
  const [copiedNodeId, setCopiedNodeId] = useState<string | null>(null)

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
    if (!containerRef.current) return
    containerRef.current.scrollTo({ left: 0, top: 0, behavior: 'smooth' })
  }, [resetSignal])

  useEffect(() => {
    if (!followLive || !layout.latestNodeId) return
    const element = nodeRefs.current[layout.latestNodeId]
    if (!element) return
    element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  }, [followLive, layout.latestNodeId, nodes.length])

  const lines = edges
    .map((edge) => {
      const from = layout.agentPoints.get(edge.from) || layout.nodePoints.get(edge.from)
      const to = layout.nodePoints.get(edge.to) || layout.agentPoints.get(edge.to)
      if (!from || !to) return null
      return { edge, from, to }
    })
    .filter((edge): edge is { edge: SwarmEdge; from: Point; to: Point } => Boolean(edge))

  return (
    <section className="h-full rounded-2xl border border-slate-800 bg-slate-900/45">
      <div ref={containerRef} className="h-full overflow-auto rounded-2xl">
        <div className="relative" style={{ width: layout.width, height: layout.height }}>
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
                className={`absolute -translate-x-1/2 rounded-xl border px-3 py-2 text-xs shadow-sm cursor-pointer transition-all ${
                  isExpanded ? 'w-80 z-20' : 'w-56'
                } ${nodeTone(node.status)}`}
                style={{ left: point.x, top: point.y }}
                onClick={() => setExpandedNode(isExpanded ? null : node.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-semibold">
                    {nodeIcon(node.kind)}
                    <span className={isExpanded ? '' : 'truncate'}>{node.label}</span>
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
                {node.message && <p className={`mt-1 text-[10px] opacity-80 ${isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>{node.message}</p>}

                {isExpanded && (
                  <div className="mt-2 space-y-1 border-t border-current/20 pt-2">
                    <div className="text-[10px] opacity-70">Kind: {node.kind} · Status: {node.status}</div>
                    <div className="text-[10px] opacity-70">First: {new Date(node.firstTs).toLocaleString()}</div>
                    <div className="text-[10px] opacity-70">Last: {new Date(node.lastTs).toLocaleString()}</div>
                    <button
                      type="button"
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
    </section>
  )
}
