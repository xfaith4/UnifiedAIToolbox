import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import type { Task } from '../types';
import { TaskStatus } from '../types';

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

const TaskGraph: React.FC<TaskGraphProps> = ({ tasks, onSelectTask, selectedTaskId }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (!svgRef.current || !graphContainerRef.current || tasks.length === 0) {
      if (svgRef.current) d3.select(svgRef.current).selectAll('*').remove();
      setRenderError(null);
      return;
    };

    setRenderError(null);

    try {
      const svg = d3.select(svgRef.current);
      const { width, height } = graphContainerRef.current.getBoundingClientRect();

      svg.attr('width', width).attr('height', height);
      svg.selectAll('*').remove(); // Clear previous render

      const g = svg.append('g');

      const tasksById = new Map(tasks.map(d => [d.id, { ...d }]));

      tasks.forEach(task => { (task as any).children = []; });

      tasks.forEach(task => {
        task.dependencies.forEach(depId => {
          const parent = tasksById.get(depId);
          if (parent) {
            if (!(parent as any).children) (parent as any).children = [];
            (parent as any).children.push(tasksById.get(task.id));
          }
        });
      });

      const rootTasks = tasks.filter(d => d.dependencies.length === 0);
      if (rootTasks.length === 0 && tasks.length > 0) {
        const childTaskIds = new Set(tasks.flatMap(t => t.dependencies));
        const potentialRoots = tasks.filter(t => !childTaskIds.has(t.id));
        rootTasks.push(...(potentialRoots.length > 0 ? potentialRoots : [tasks[0]]));
      }

      const root = { id: 'root', children: rootTasks.map(t => tasksById.get(t.id)) };
      const hierarchy = d3.hierarchy(root);

      const treeLayout = d3.tree().nodeSize([NODE_WIDTH + 40, NODE_HEIGHT + 60]);
      treeLayout(hierarchy as any);

      g.append('g')
        .selectAll('path')
        .data(hierarchy.links())
        .join('path')
        .attr('d', d3.linkVertical().x(d => (d as any).x).y(d => (d as any).y) as any)
        .attr('fill', 'none')
        .attr('stroke', '#4b5563') // gray-600
        .attr('stroke-width', 2);

      const nodes = g.append('g')
        .selectAll('g')
        .data(hierarchy.descendants().filter(d => d.data.id !== 'root'))
        .join('g')
        .attr('transform', d => `translate(${d.x},${d.y})`)
        .attr('cursor', 'pointer')
        .on('click', (_, d) => onSelectTask(d.data as unknown as Task));

      nodes.append('rect')
        .attr('width', NODE_WIDTH)
        .attr('height', NODE_HEIGHT)
        .attr('x', -NODE_WIDTH / 2)
        .attr('y', -NODE_HEIGHT / 2)
        .attr('rx', 8)
        .attr('ry', 8)
        .attr('fill', d => statusClasses[(d.data as unknown as Task).status].fill)
        .attr('stroke', d => (d.data as unknown as Task).id === selectedTaskId ? '#6366f1' : statusClasses[(d.data as unknown as Task).status].stroke)
        .attr('stroke-width', d => (d.data as unknown as Task).id === selectedTaskId ? 4 : 2)
        .classed('animate-pulse', d => (d.data as unknown as Task).status === TaskStatus.RUNNING);

      // Fix: Replaced .html() with programmatic D3 appends for robust text rendering.
      const foreignObject = nodes.append('foreignObject')
        .attr('width', NODE_WIDTH)
        .attr('height', NODE_HEIGHT)
        .attr('x', -NODE_WIDTH / 2)
        .attr('y', -NODE_HEIGHT / 2)
        .style('pointer-events', 'none');

      const div = foreignObject.append('xhtml:div')
        .attr('style', `
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
            word-wrap: break-word; /* For text wrapping */
          `)
        .style('color', d => statusClasses[(d.data as unknown as Task).status].text);

      const mainContent = div.append('xhtml:div')
        .style('flex-grow', '1')
        .style('display', 'flex')
        .style('flex-direction', 'column')
        .style('justify-content', 'center');

      mainContent.append('xhtml:span')
        .style('font-weight', 'bold')
        .text(d => (d.data as unknown as Task).name);

      mainContent.append('xhtml:div')
        .style('font-size', '11px')
        .style('opacity', '0.8')
        .style('margin-top', '5px')
        .style('font-weight', 'normal')
        .text(d => (d.data as unknown as Task).agent.role);

      div.append('xhtml:div')
        .style('font-size', '11px')
        .style('font-family', 'monospace')
        .style('color', '#6ee7b7') // emerald-300
        .style('padding-top', '4px')
        .style('border-top', d => (d.data as unknown as Task).cost !== undefined ? `1px solid ${statusClasses[(d.data as unknown as Task).status].stroke}` : 'none')
        .style('margin-top', '5px')
        .style('width', '100%')
        .text(d => (d.data as unknown as Task).cost !== undefined ? `$${(d.data as unknown as Task).cost!.toFixed(6)}` : '');

      // Add artifact indicator icon to nodes with artifacts
      nodes.filter(d => (d.data as unknown as Task).artifacts.length > 0)
        .append('path')
        .attr('d', "M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.122 2.122l7.81-7.81")
        .attr('fill', 'none')
        .attr('stroke', d => statusClasses[(d.data as unknown as Task).status].text)
        .attr('stroke-width', 2.5)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .attr('transform', `translate(${NODE_WIDTH / 2 - 24}, ${-NODE_HEIGHT / 2 + 8}) scale(0.75)`);

      // Setup zoom and pan
      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 2.5])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        });

      svg.call(zoom);

      const bounds = g.node()!.getBBox();
      if (bounds.width > 0 && bounds.height > 0) {
        // Auto-center and fit the graph initially
        const fullWidth = bounds.width;
        const fullHeight = bounds.height;
        const scale = Math.min(width / (fullWidth + 80), height / (fullHeight + 80)) * 0.95;
        const xTranslate = (width - fullWidth * scale) / 2 - bounds.x * scale;
        const yTranslate = (height - fullHeight * scale) / 2 - bounds.y * scale;

        const initialTransform = d3.zoomIdentity.translate(xTranslate, yTranslate).scale(scale);
        svg.call(zoom.transform, initialTransform);

      } else if (hierarchy.descendants().length > 1) { // for single node case
        const initialTransform = d3.zoomIdentity.translate(width / 2, 80);
        svg.call(zoom.transform, initialTransform);
      }

    } catch (e) {
      console.error("Failed to render D3 graph:", e);
      setRenderError("Could not render the task graph. The data returned by the AI may be malformed.");
    }

  }, [tasks, selectedTaskId]);

  const isEmpty = tasks.length === 0;

  return (
    <div ref={graphContainerRef} className="w-full h-full bg-gray-900 cursor-grab active:cursor-grabbing">
      {isEmpty && (
        <div className="flex-1 flex items-center justify-center text-gray-500 h-full">
          <p>The orchestration graph will appear here once started.</p>
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
