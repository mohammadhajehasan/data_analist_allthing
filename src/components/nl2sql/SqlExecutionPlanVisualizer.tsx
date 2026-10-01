import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ExecutionPlanNode } from '../../types';
import {
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ListTree,
  Network,
  Cpu,
  Clock,
  Database,
  ArrowDown,
  Info,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

interface SqlExecutionPlanVisualizerProps {
  plan: ExecutionPlanNode;
  language?: 'ar' | 'en';
}

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  SCAN: { bg: '#0f62fe15', border: '#0f62fe', text: '#78a9ff', icon: 'Database' },
  FILTER: { bg: '#f1c21b15', border: '#f1c21b', text: '#f1c21b', icon: 'Filter' },
  AGGREGATE: { bg: '#8a3ffc15', border: '#8a3ffc', text: '#be95ff', icon: 'Sigma' },
  SORT: { bg: '#1192e815', border: '#1192e8', text: '#33b1ff', icon: 'ArrowUpDown' },
  LIMIT: { bg: '#0072c315', border: '#0072c3', text: '#82cfff', icon: 'Scissors' },
  JOIN: { bg: '#6929c415', border: '#6929c4', text: '#d4bbff', icon: 'GitMerge' },
  OUTPUT: { bg: '#24a14815', border: '#24a148', text: '#42be65', icon: 'CheckCircle' },
  PROJECTION: { bg: '#005d5d15', border: '#005d5d', text: '#08bdba', icon: 'Columns' },
};

export const SqlExecutionPlanVisualizer: React.FC<SqlExecutionPlanVisualizerProps> = ({
  plan,
  language = 'ar',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<ExecutionPlanNode | null>(plan);
  const [viewMode, setViewMode] = useState<'graph' | 'tree'>('graph');
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const isAr = language === 'ar';

  useEffect(() => {
    if (viewMode !== 'graph' || !svgRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 800;
    const height = 380;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg.attr('width', width).attr('height', height);

    // Defs for grid and gradients
    const defs = svg.append('defs');

    // Grid pattern
    const pattern = defs
      .append('pattern')
      .attr('id', 'd3-grid-pattern')
      .attr('width', 24)
      .attr('height', 24)
      .attr('patternUnits', 'userSpaceOnUse');

    pattern
      .append('path')
      .attr('d', 'M 24 0 L 0 0 0 24')
      .attr('fill', 'none')
      .attr('stroke', '#333333')
      .attr('stroke-width', 0.5);

    // Background rect with grid
    svg
      .append('rect')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('fill', '#161616')
      .attr('stroke', 'none');

    svg
      .append('rect')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('fill', 'url(#d3-grid-pattern)')
      .attr('opacity', 0.4);

    const g = svg.append('g').attr('class', 'plan-content-group');

    // Setup zoom
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 2.5])
      .on('zoom', event => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);
    zoomBehaviorRef.current = zoom;

    // Create D3 hierarchy
    const root = d3.hierarchy(plan);

    // Vertical top-down layout
    const nodeWidth = 220;
    const nodeHeight = 70;
    const treeLayout = d3.tree<ExecutionPlanNode>().nodeSize([nodeWidth + 40, nodeHeight + 50]);

    treeLayout(root);

    // Links with smooth curved cubic bezier
    g.selectAll('.plan-link')
      .data(root.links())
      .enter()
      .append('path')
      .attr('class', 'plan-link')
      .attr('d', d3.linkVertical<any, any>()
        .x(d => d.x)
        .y(d => d.y)
      )
      .attr('fill', 'none')
      .attr('stroke', '#525252')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '4,4')
      .attr('opacity', 0.85);

    // Link flow direction markers/circles
    g.selectAll('.plan-link-dot')
      .data(root.links())
      .enter()
      .append('circle')
      .attr('cx', d => (d.source.x + d.target.x) / 2)
      .attr('cy', d => (d.source.y + d.target.y) / 2)
      .attr('r', 3)
      .attr('fill', '#0f62fe');

    // Node groups
    const nodes = g
      .selectAll('.plan-node')
      .data(root.descendants())
      .enter()
      .append('g')
      .attr('class', 'plan-node')
      .attr('transform', d => `translate(${d.x - nodeWidth / 2}, ${d.y - nodeHeight / 2})`)
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        setSelectedNode(d.data);
      });

    // Node Box Rectangle
    nodes
      .append('rect')
      .attr('width', nodeWidth)
      .attr('height', nodeHeight)
      .attr('rx', 2)
      .attr('fill', d => TYPE_COLORS[d.data.type]?.bg || '#262626')
      .attr('stroke', d => TYPE_COLORS[d.data.type]?.border || '#525252')
      .attr('stroke-width', d => (selectedNode?.id === d.data.id ? 2 : 1))
      .attr('filter', 'drop-shadow(0px 2px 4px rgba(0,0,0,0.4))');

    // Top Accent Border Bar
    nodes
      .append('rect')
      .attr('width', nodeWidth)
      .attr('height', 3)
      .attr('fill', d => TYPE_COLORS[d.data.type]?.border || '#0f62fe');

    // Stage Type Badge
    nodes
      .append('text')
      .attr('x', 10)
      .attr('y', 18)
      .attr('font-size', '9px')
      .attr('font-family', 'monospace')
      .attr('font-weight', 'bold')
      .attr('fill', d => TYPE_COLORS[d.data.type]?.text || '#c6c6c6')
      .text(d => d.data.type);

    // Node Name Title
    nodes
      .append('text')
      .attr('x', 10)
      .attr('y', 36)
      .attr('font-size', '11px')
      .attr('font-family', 'sans-serif')
      .attr('font-weight', 'bold')
      .attr('fill', '#f4f4f4')
      .text(d => {
        const text = isAr && d.data.nameAr ? d.data.nameAr : d.data.name;
        return text.length > 24 ? text.substring(0, 22) + '...' : text;
      });

    // Subtitle / Cost & Cardinality
    nodes
      .append('text')
      .attr('x', 10)
      .attr('y', 54)
      .attr('font-size', '10px')
      .attr('font-family', 'monospace')
      .attr('fill', '#8d8d8d')
      .text(d => `Cost: ${d.data.cost} | ~${d.data.estimatedRows.toLocaleString()} rows`);

    // Execution time pill on top right
    nodes
      .append('text')
      .attr('x', nodeWidth - 8)
      .attr('y', 18)
      .attr('text-anchor', 'end')
      .attr('font-size', '9px')
      .attr('font-family', 'monospace')
      .attr('fill', '#42be65')
      .text(d => `${d.data.durationMs || 0.4}ms`);

    // Initial center transform
    const initialTransform = d3.zoomIdentity
      .translate(width / 2, 40)
      .scale(0.88);

    svg.call(zoom.transform, initialTransform);
  }, [plan, viewMode, isAr, selectedNode]);

  const handleZoomIn = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(250).call(zoomBehaviorRef.current.scaleBy, 1.25);
  };

  const handleZoomOut = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(250).call(zoomBehaviorRef.current.scaleBy, 0.8);
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current || !containerRef.current) return;
    const width = containerRef.current.clientWidth || 800;
    const initialTransform = d3.zoomIdentity.translate(width / 2, 40).scale(0.88);
    d3.select(svgRef.current).transition().duration(350).call(zoomBehaviorRef.current.transform, initialTransform);
  };

  // Helper to render tree table recursively
  const renderTreeRows = (node: ExecutionPlanNode, depth: number = 0): React.ReactNode => {
    const color = TYPE_COLORS[node.type] || TYPE_COLORS.SCAN;
    return (
      <React.Fragment key={node.id}>
        <tr
          onClick={() => setSelectedNode(node)}
          className={`cursor-pointer border-b border-[var(--cds-border-subtle)] transition-colors ${
            selectedNode?.id === node.id ? 'bg-[var(--cds-layer-03)]/80' : 'hover:bg-[var(--cds-layer-02)]'
          }`}
        >
          <td className="p-2.5 font-mono text-xs text-[var(--cds-text-01)]">
            <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 20}px` }}>
              {depth > 0 && <span className="text-[var(--cds-text-03)]">└──</span>}
              <span
                className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                style={{
                  backgroundColor: color.bg,
                  color: color.text,
                  border: `1px solid ${color.border}`,
                }}
              >
                {node.type}
              </span>
              <span className="font-semibold">{isAr && node.nameAr ? node.nameAr : node.name}</span>
            </div>
          </td>
          <td className="p-2.5 font-mono text-xs text-[#33b1ff] truncate max-w-xs">
            {node.expression || '-'}
          </td>
          <td className="p-2.5 font-mono text-xs text-[var(--cds-text-02)] text-right">
            {node.cost}
          </td>
          <td className="p-2.5 font-mono text-xs text-[var(--cds-text-02)] text-right">
            {node.estimatedRows.toLocaleString()}
          </td>
          <td className="p-2.5 font-mono text-xs text-[#42be65] text-right">
            {node.durationMs || 0.4}ms
          </td>
        </tr>
        {node.children?.map(child => renderTreeRows(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] flex flex-col">
      {/* Top Action Bar */}
      <div className="p-3 bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#0f62fe]" />
          <h4 className="text-xs font-mono font-bold uppercase text-[var(--cds-text-01)] tracking-wide">
            {isAr ? 'خطة تنفيذ الاستعلام التفاعلية (EXPLAIN Plan)' : 'Interactive SQL Execution Plan (D3.js)'}
          </h4>
          <span className="carbon-tag-blue text-[10px] uppercase font-bold ml-1">
            Engine: Vectorized OLAP
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-0.5 mr-2">
            <button
              onClick={() => setViewMode('graph')}
              className={`px-2 py-1 text-xs font-mono flex items-center gap-1.5 transition-colors ${
                viewMode === 'graph' ? 'bg-[#0f62fe] text-white font-bold' : 'text-[var(--cds-text-02)] hover:text-white'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>{isAr ? 'مخطط بياني' : 'DAG Graph'}</span>
            </button>
            <button
              onClick={() => setViewMode('tree')}
              className={`px-2 py-1 text-xs font-mono flex items-center gap-1.5 transition-colors ${
                viewMode === 'tree' ? 'bg-[#0f62fe] text-white font-bold' : 'text-[var(--cds-text-02)] hover:text-white'
              }`}
            >
              <ListTree className="w-3.5 h-3.5" />
              <span>{isAr ? 'شجرة هيكلية' : 'Tree List'}</span>
            </button>
          </div>

          {viewMode === 'graph' && (
            <>
              <button
                onClick={handleZoomIn}
                className="p-1.5 bg-[var(--cds-layer-03)] hover:bg-[var(--cds-border-strong)] text-[var(--cds-text-01)] transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleZoomOut}
                className="p-1.5 bg-[var(--cds-layer-03)] hover:bg-[var(--cds-border-strong)] text-[var(--cds-text-01)] transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleResetZoom}
                className="p-1.5 bg-[var(--cds-layer-03)] hover:bg-[var(--cds-border-strong)] text-[var(--cds-text-01)] transition-colors"
                title="Fit View"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[380px]">
        {/* Left Diagram / Table Area */}
        <div
          ref={containerRef}
          className="lg:col-span-8 bg-[var(--cds-layer-01)] border-b lg:border-b-0 lg:border-e border-[var(--cds-border-subtle)] relative overflow-hidden flex flex-col justify-center"
        >
          {viewMode === 'graph' ? (
            <svg ref={svgRef} className="w-full h-[380px] select-none outline-none block" />
          ) : (
            <div className="max-h-[380px] overflow-y-auto p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--cds-border-subtle)] text-[var(--cds-text-03)] font-mono text-[10px] uppercase">
                    <th className="p-2">{isAr ? 'عقدة العملية' : 'Operator Node'}</th>
                    <th className="p-2">{isAr ? 'التعبير / الشرط' : 'Expression / Predicate'}</th>
                    <th className="p-2 text-right">{isAr ? 'الكلفة' : 'Cost'}</th>
                    <th className="p-2 text-right">{isAr ? 'الصفوف' : 'Rows'}</th>
                    <th className="p-2 text-right">{isAr ? 'الزمن' : 'Time'}</th>
                  </tr>
                </thead>
                <tbody>{renderTreeRows(plan)}</tbody>
              </table>
            </div>
          )}

          {/* Quick legend on bottom left */}
          {viewMode === 'graph' && (
            <div className="absolute bottom-2 left-2 bg-[var(--cds-layer-01)]/90 border border-[var(--cds-border-subtle)] p-1.5 flex flex-wrap gap-2 text-[10px] font-mono text-[var(--cds-text-02)] backdrop-blur-sm pointer-events-none">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#0f62fe]" /> Scan
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#f1c21b]" /> Filter
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#8a3ffc]" /> Group/Agg
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#1192e8]" /> Sort
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#24a148]" /> Output
              </span>
            </div>
          )}
        </div>

        {/* Right Node Inspector Panel */}
        <div className="lg:col-span-4 bg-[var(--cds-layer-02)] p-4 flex flex-col justify-between space-y-4">
          {selectedNode ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--cds-border-subtle)] pb-2">
                <span
                  className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase"
                  style={{
                    backgroundColor: TYPE_COLORS[selectedNode.type]?.bg,
                    color: TYPE_COLORS[selectedNode.type]?.text,
                    border: `1px solid ${TYPE_COLORS[selectedNode.type]?.border}`,
                  }}
                >
                  {selectedNode.type} NODE
                </span>
                <span className="text-[10px] font-mono text-[var(--cds-text-03)]">ID: {selectedNode.id}</span>
              </div>

              <div>
                <h5 className="text-sm font-bold text-[var(--cds-text-01)]">
                  {isAr && selectedNode.nameAr ? selectedNode.nameAr : selectedNode.name}
                </h5>
                <p className="text-xs text-[var(--cds-text-02)] mt-1 leading-relaxed">
                  {isAr && selectedNode.detailsAr ? selectedNode.detailsAr : selectedNode.details}
                </p>
              </div>

              {selectedNode.expression && (
                <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-2.5">
                  <span className="text-[10px] font-mono uppercase text-[var(--cds-text-03)] block mb-1">
                    {isAr ? 'العبارة المنطقية' : 'Evaluated Expression'}
                  </span>
                  <code className="text-xs font-mono text-[#33b1ff] break-all block">
                    {selectedNode.expression}
                  </code>
                </div>
              )}

              {/* Node Metrics Grid */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="bg-[var(--cds-layer-01)] p-2 border border-[var(--cds-border-subtle)] text-center">
                  <span className="text-[9px] font-mono text-[var(--cds-text-03)] uppercase block">
                    {isAr ? 'الكلفة التقديرية' : 'Est. Cost'}
                  </span>
                  <span className="text-xs font-mono font-bold text-[var(--cds-text-01)]">
                    {selectedNode.cost} units
                  </span>
                </div>
                <div className="bg-[var(--cds-layer-01)] p-2 border border-[var(--cds-border-subtle)] text-center">
                  <span className="text-[9px] font-mono text-[var(--cds-text-03)] uppercase block">
                    {isAr ? 'تعداد الصفوف' : 'Cardinality'}
                  </span>
                  <span className="text-xs font-mono font-bold text-[var(--cds-text-01)]">
                    {selectedNode.estimatedRows.toLocaleString()}
                  </span>
                </div>
                <div className="bg-[var(--cds-layer-01)] p-2 border border-[var(--cds-border-subtle)] text-center">
                  <span className="text-[9px] font-mono text-[var(--cds-text-03)] uppercase block">
                    {isAr ? 'زمن التنفيذ' : 'Duration'}
                  </span>
                  <span className="text-xs font-mono font-bold text-[#42be65]">
                    {selectedNode.durationMs || 0.4}ms
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-[var(--cds-text-03)] py-12">
              <Info className="w-8 h-8 mx-auto mb-2 text-[var(--cds-text-03)]" />
              <p className="text-xs font-mono">
                {isAr ? 'انقر على أي عقدة لعرض تفاصيلها' : 'Click on any operator node to inspect details'}
              </p>
            </div>
          )}

          <div className="border-t border-[var(--cds-border-subtle)] pt-3 text-[11px] font-mono text-[var(--cds-text-03)] flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[#42be65]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isAr ? 'تخصيص الذاكرة مُحسّن' : 'SIMD Vector Memory OK'}</span>
            </span>
            <span>Total Plan Cost: {plan.cost}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
