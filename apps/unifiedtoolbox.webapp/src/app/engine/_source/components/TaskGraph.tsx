import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import dagre from 'dagre';
import type { Task } from '../types';
import { TaskStatus } from '../types';
import { GRAPH_LIMITS, buildGraphTasks, findCycle, graphSignature } from './taskGraphUtils'

interface TaskGraphProps {
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  selectedTaskId: string | null;
}

const statusClasses: Record<TaskStatus, { fill: string; stroke: string; text: string }> = {
  [TaskStatus.PENDING]: { fill: '#374151', stroke: '#6b7280', text: '#d1d5db' }, // gray-700, gray-500, gray-300
  [TaskStatus.RUNNING]: { fill: '#1e3a8a', stroke: '#3b82f6', text: '#bfdbfe' }, // blue-900, blue-500, blue-200
  [TaskStatus.COMPLETED]: { fill: '#14532d', stroke: '#22c55e', text: '#bbf7d0' }, // green-900, green-500, green-200
  [TaskStatus.FAILED]: { fill: '#7f1d1d', stroke: '#ef4444', text: '#fecaca' }, // red-900, red-500, red-200
};

const NODE_WIDTH = 180;
const NODE_HEIGHT = 100; // Increased height for cost display
const { MAX_GRAPH_NODES, MAX_GRAPH_EDGES, GRAPH_PADDING } = GRAPH_LIMITS

const TaskGraph: React.FC<TaskGraphProps> = ({ tasks, onSelectTask, selectedTaskId }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 })

  const graphTasks = buildGraphTasks(tasks)
  const signature = graphSignature(graphTasks)

  useEffect(() => {
    if (!graphContainerRef.current) return

    const el = graphContainerRef.current
    const update = () => {
      const rect = el.getBoundingClientRect()
      const width = Math.max(0, Math.floor(rect.width))
      const height = Math.max(0, Math.floor(rect.height))
      setContainerSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    }

    update()
    const ro = new ResizeObserver(() => update())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!svgRef.current || !graphContainerRef.current || graphTasks.length === 0) {
      if (svgRef.current) d3.select(svgRef.current).selectAll('*').remove();
      setRenderError(null);
      return;
    }

    if (graphTasks.length > MAX_GRAPH_NODES) {
      if (svgRef.current) d3.select(svgRef.current).selectAll('*').remove()
      setRenderError(`Graph view is disabled for runs with more than ${MAX_GRAPH_NODES} tasks to keep the UI responsive. Use Clusters view instead.`)
      return
    }

    setRenderError(null);

    let raf = 0
    const scheduleRender = () => {
      const { width, height } = containerSize.width && containerSize.height ? containerSize : graphContainerRef.current!.getBoundingClientRect()
      if (!width || !height) return

      const svg = d3.select(svgRef.current!)
      svg.attr('width', width).attr('height', height)
      svg.selectAll('*').remove() // Clear previous render

      const g = svg.append('g')

      const ids = graphTasks.map((t) => t.id)
      const idSet = new Set(ids)
      const edges: Array<[string, string]> = []
      const taskById = new Map(graphTasks.map((t) => [t.id, t]))

      for (const task of graphTasks) {
        for (const depId of task.dependencies) {
          if (!depId || depId === task.id) continue
          if (!idSet.has(depId)) continue
          edges.push([depId, task.id])
        }
      }

      if (edges.length > MAX_GRAPH_EDGES) {
        setRenderError(`Graph view is disabled for runs with more than ${MAX_GRAPH_EDGES} dependency edges to keep the UI responsive. Use Clusters view instead.`)
        return
      }

      const cycle = findCycle(ids, edges)
      if (cycle) {
        const snippet = cycle.slice(0, 8).join(' → ')
        setRenderError(`Cycle detected in task dependencies (example path: ${snippet}). Graph view requires a DAG; use Clusters view or rerun with corrected dependencies.`)
        return
      }

      try {
        const dagreGraph = new dagre.graphlib.Graph({ multigraph: false, compound: false })
        dagreGraph.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80, marginx: 20, marginy: 20 })
        dagreGraph.setDefaultEdgeLabel(() => ({}))

        for (const t of graphTasks) {
          dagreGraph.setNode(t.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
        }

        for (const [from, to] of edges) {
          if (!dagreGraph.hasNode(from) || !dagreGraph.hasNode(to)) continue
          dagreGraph.setEdge(from, to)
        }

        dagre.layout(dagreGraph)

        // Edges
        const edgeGroup = g.append('g').attr('stroke', '#4b5563').attr('stroke-width', 2).attr('fill', 'none')
        const line = d3.line<{ x: number; y: number }>().x((d) => d.x).y((d) => d.y).curve(d3.curveMonotoneY)

        for (const e of dagreGraph.edges()) {
          const edge = dagreGraph.edge(e) as { points?: Array<{ x: number; y: number }> }
          if (!edge?.points?.length) continue
          edgeGroup.append('path').attr('d', line(edge.points) || '')
        }

        // Nodes
        const nodeGroup = g.append('g')
        const nodeData = dagreGraph.nodes().map((id) => {
          const node = dagreGraph.node(id) as { x: number; y: number; width: number; height: number }
          const task = taskById.get(id)!
          return { id, x: node.x, y: node.y, task }
        })

        const nodes = nodeGroup
          .selectAll('g')
          .data(nodeData, (d: any) => d.id)
          .join('g')
          .attr('transform', (d) => `translate(${d.x},${d.y})`)
          .attr('cursor', 'pointer')
          .on('click', (_, d) => {
            const fullTask = tasks.find((t) => t.id === d.id) ?? (d.task as unknown as Task)
            onSelectTask(fullTask as Task)
          })

        nodes
          .append('rect')
          .attr('width', NODE_WIDTH)
          .attr('height', NODE_HEIGHT)
          .attr('x', -NODE_WIDTH / 2)
          .attr('y', -NODE_HEIGHT / 2)
          .attr('rx', 8)
          .attr('ry', 8)
          .attr('fill', (d) => statusClasses[d.task.status].fill)
          .attr('stroke', (d) => (d.id === selectedTaskId ? '#6366f1' : statusClasses[d.task.status].stroke))
          .attr('stroke-width', (d) => (d.id === selectedTaskId ? 4 : 2))
          .classed('animate-pulse', (d) => d.task.status === TaskStatus.RUNNING)

        const foreignObject = nodes
          .append('foreignObject')
          .attr('width', NODE_WIDTH)
          .attr('height', NODE_HEIGHT)
          .attr('x', -NODE_WIDTH / 2)
          .attr('y', -NODE_HEIGHT / 2)
          .style('pointer-events', 'none')

        const div = foreignObject
          .append('xhtml:div')
          .attr(
            'style',
            `
            width: ${NODE_WIDTH}px;
            height: ${NODE_HEIGHT}px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 8px;
            box-sizing: border-box;
            font-size: 13px;
            line-height: 1.3;
            word-wrap: break-word;
          `
          )
          .style('color', (d) => statusClasses[d.task.status].text)

        const mainContent = div
          .append('xhtml:div')
          .style('flex-grow', '1')
          .style('display', 'flex')
          .style('flex-direction', 'column')
          .style('justify-content', 'center')

        mainContent.append('xhtml:span').style('font-weight', 'bold').text((d) => d.task.name)

        mainContent
          .append('xhtml:div')
          .style('font-size', '11px')
          .style('opacity', '0.8')
          .style('margin-top', '5px')
          .style('font-weight', 'normal')
          .text((d) => d.task.agentRole)

        div
          .append('xhtml:div')
          .style('font-size', '11px')
          .style('font-family', 'monospace')
          .style('color', '#6ee7b7')
          .style('padding-top', '4px')
          .style('border-top', (d) => (d.task.cost !== undefined ? `1px solid ${statusClasses[d.task.status].stroke}` : 'none'))
          .style('margin-top', '5px')
          .style('width', '100%')
          .text((d) => (d.task.cost !== undefined ? `$${d.task.cost.toFixed(6)}` : ''))

        nodes
          .filter((d) => d.task.artifactCount > 0)
          .append('path')
          .attr('d', 'M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.122 2.122l7.81-7.81')
          .attr('fill', 'none')
          .attr('stroke', (d) => statusClasses[d.task.status].text)
          .attr('stroke-width', 2.5)
          .attr('stroke-linecap', 'round')
          .attr('stroke-linejoin', 'round')
          .attr('transform', `translate(${NODE_WIDTH / 2 - 24}, ${-NODE_HEIGHT / 2 + 8}) scale(0.75)`)

        // Zoom + fit using dagre's computed graph dimensions (avoids expensive getBBox on foreignObject content).
        const zoom = d3
          .zoom<SVGSVGElement, unknown>()
          .scaleExtent([0.1, 2.5])
          .on('zoom', (event) => g.attr('transform', event.transform))

        svg.call(zoom as any)

        const graphW = Number(dagreGraph.graph().width || 0)
        const graphH = Number(dagreGraph.graph().height || 0)
        if (graphW > 0 && graphH > 0) {
          const scale = Math.min(width / (graphW + GRAPH_PADDING), height / (graphH + GRAPH_PADDING)) * 0.95
          const xTranslate = (width - graphW * scale) / 2
          const yTranslate = (height - graphH * scale) / 2
          const initialTransform = d3.zoomIdentity.translate(xTranslate, yTranslate).scale(scale)
          svg.call(zoom.transform as any, initialTransform)
        } else {
          svg.call(zoom.transform as any, d3.zoomIdentity.translate(width / 2, 80).scale(1))
        }
      } catch (e) {
        console.error('Failed to render task graph:', e)
        setRenderError('Could not render the task graph. The data returned by the AI may be malformed.')
      }
    }

    // Render on the next frame to avoid blocking the view-mode switch paint.
    raf = window.requestAnimationFrame(scheduleRender)
    return () => {
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [signature, selectedTaskId, containerSize.width, containerSize.height]);

  const isEmpty = tasks.length === 0;

  return (
    <div ref={graphContainerRef} className="w-full h-full bg-gray-900 cursor-grab active:cursor-grabbing">
      {isEmpty && (
        <div className="flex-1 flex items-center justify-center text-gray-500 h-full">
          <p>The build graph will appear here once started.</p>
        </div>
      )}
      {renderError && (
        <div className="flex-1 flex items-center justify-center text-red-400 h-full p-4">
          <p className="text-center"><strong>Graph Error:</strong> {renderError}</p>
        </div>
      )}
      <svg ref={svgRef} className={renderError ? 'hidden' : ''}></svg>
    </div>
  );
};

export default TaskGraph;
