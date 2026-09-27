import React, { useState, useRef, useEffect, useMemo } from 'react';
import { DataModelTable, DataModelRelationship, RelationshipType } from '../../types';
import {
  Workflow,
  Key,
  Link as LinkIcon,
  Plus,
  Trash2,
  Edit3,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  SlidersHorizontal,
  Info,
  Check,
  X,
  Sparkles,
  Move,
  Database,
  ArrowRight,
  ChevronDown
} from 'lucide-react';

interface InteractiveErdCanvasProps {
  tables: DataModelTable[];
  relationships: DataModelRelationship[];
  onUpdateTables: (tables: DataModelTable[]) => void;
  onUpdateRelationships: (relationships: DataModelRelationship[]) => void;
  onSelectRelationship?: (rel: DataModelRelationship | null) => void;
  language?: 'ar' | 'en';
}

interface NodePosition {
  x: number;
  y: number;
}

export const InteractiveErdCanvas: React.FC<InteractiveErdCanvasProps> = ({
  tables,
  relationships,
  onUpdateTables,
  onUpdateRelationships,
  onSelectRelationship,
  language = 'ar',
}) => {
  const isAr = language === 'ar';

  // Canvas View Transform (Zoom & Pan)
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 20, y: 20 });
  const [isPanningCanvas, setIsPanningCanvas] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Node Dragging State
  const [nodePositions, setNodePositions] = useState<Record<string, NodePosition>>({});
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Interactive Drag-to-Connect Edge State
  const [connectingSource, setConnectingSource] = useState<{
    tableName: string;
    colName: string;
    x: number;
    y: number;
  } | null>(null);
  const [mouseCanvasPos, setMouseCanvasPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Selected Relationship & Modal Editing State
  const [selectedRelId, setSelectedRelId] = useState<string | null>(null);
  const [editingRel, setEditingRel] = useState<DataModelRelationship | null>(null);

  // Manual Link Creator Modal State
  const [showAddRelModal, setShowAddRelModal] = useState<boolean>(false);
  const [newSourceTable, setNewSourceTable] = useState<string>('');
  const [newSourceCol, setNewSourceCol] = useState<string>('');
  const [newTargetTable, setNewTargetTable] = useState<string>('');
  const [newTargetCol, setNewTargetCol] = useState<string>('');
  const [newRelType, setNewRelType] = useState<RelationshipType>('1:M');
  const [newJoinType, setNewJoinType] = useState<'INNER' | 'LEFT' | 'RIGHT' | 'FULL'>('LEFT');

  const canvasRef = useRef<HTMLDivElement>(null);

  // Initialize clean grid layout positions for table nodes
  useEffect(() => {
    const initialPositions: Record<string, NodePosition> = { ...nodePositions };
    let hasNew = false;

    tables.forEach((tbl, idx) => {
      if (!initialPositions[tbl.name]) {
        hasNew = true;
        const col = idx % 3;
        const row = Math.floor(idx / 3);
        initialPositions[tbl.name] = {
          x: 40 + col * 320,
          y: 40 + row * 260,
        };
      }
    });

    if (hasNew) {
      setNodePositions(initialPositions);
    }
  }, [tables]);

  // Handle Canvas Pan via Mouse Drag
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.table-node-card')) return;
    setIsPanningCanvas(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const cx = (e.clientX - rect.left - pan.x) / zoom;
      const cy = (e.clientY - rect.top - pan.y) / zoom;
      setMouseCanvasPos({ x: cx, y: cy });
    }

    if (isPanningCanvas) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    } else if (draggingNodeId) {
      const newX = Math.max(10, (e.clientX - (rect?.left || 0) - pan.x) / zoom - dragOffset.x);
      const newY = Math.max(10, (e.clientY - (rect?.top || 0) - pan.y) / zoom - dragOffset.y);
      setNodePositions(prev => ({
        ...prev,
        [draggingNodeId]: { x: newX, y: newY },
      }));
    }
  };

  const handleCanvasMouseUp = () => {
    setIsPanningCanvas(false);
    setDraggingNodeId(null);
    if (connectingSource) {
      setConnectingSource(null);
    }
  };

  // Node Drag Start
  const handleNodeMouseDown = (e: React.MouseEvent, tableName: string) => {
    e.stopPropagation();
    const pos = nodePositions[tableName] || { x: 0, y: 0 };
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = (e.clientX - rect.left - pan.x) / zoom;
    const mouseY = (e.clientY - rect.top - pan.y) / zoom;

    setDraggingNodeId(tableName);
    setDragOffset({
      x: mouseX - pos.x,
      y: mouseY - pos.y,
    });
  };

  // Start Interactive Drag-to-Connect Edge
  const handlePortMouseDown = (e: React.MouseEvent, tableName: string, colName: string) => {
    e.stopPropagation();
    const pos = nodePositions[tableName] || { x: 0, y: 0 };
    setConnectingSource({
      tableName,
      colName,
      x: pos.x + 280, // Right side port
      y: pos.y + 60,
    });
  };

  // Drop Line on Target Port / Column
  const handlePortMouseUp = (tableName: string, colName: string) => {
    if (connectingSource && connectingSource.tableName !== tableName) {
      // Create new relationship
      const newRel: DataModelRelationship = {
        id: `rel-drag-${Date.now()}`,
        sourceTable: connectingSource.tableName,
        sourceColumn: connectingSource.colName,
        targetTable: tableName,
        targetColumn: colName,
        relationshipType: '1:M',
        joinType: 'LEFT',
        confidence: 100,
        description: `Connected ${connectingSource.tableName}.${connectingSource.colName} -> ${tableName}.${colName}`,
        isAiGenerated: false,
      };

      // Check if relationship already exists
      const exists = relationships.some(
        r =>
          r.sourceTable === newRel.sourceTable &&
          r.sourceColumn === newRel.sourceColumn &&
          r.targetTable === newRel.targetTable &&
          r.targetColumn === newRel.targetColumn
      );

      if (!exists) {
        onUpdateRelationships([...relationships, newRel]);
      }
    }
    setConnectingSource(null);
  };

  // Auto-Arrange Layout (Clean Grid Positioning)
  const handleAutoLayout = () => {
    const newPositions: Record<string, NodePosition> = {};
    const cols = Math.ceil(Math.sqrt(tables.length || 1));
    tables.forEach((tbl, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      newPositions[tbl.name] = {
        x: 50 + col * 340,
        y: 50 + row * 280,
      };
    });
    setNodePositions(newPositions);
    setZoom(1);
    setPan({ x: 20, y: 20 });
  };

  // Toggle Primary Key on Column
  const handleTogglePk = (tableName: string, colName: string) => {
    const updated = tables.map(t => {
      if (t.name === tableName) {
        const pks = t.primaryKey || [];
        const newPks = pks.includes(colName) ? pks.filter(k => k !== colName) : [...pks, colName];
        return { ...t, primaryKey: newPks };
      }
      return t;
    });
    onUpdateTables(updated);
  };

  // Delete Relationship
  const handleDeleteRelationship = (relId: string) => {
    onUpdateRelationships(relationships.filter(r => r.id !== relId));
    if (selectedRelId === relId) setSelectedRelId(null);
    if (editingRel?.id === relId) setEditingRel(null);
  };

  // Open Add Relationship Modal
  const handleOpenAddModal = () => {
    if (tables.length < 2) return;
    const t1 = tables[0]?.name || '';
    const t2 = tables[1]?.name || t1;
    setNewSourceTable(t1);
    setNewSourceCol(tables[0]?.columns[0]?.name || '');
    setNewTargetTable(t2);
    setNewTargetCol(tables[1]?.primaryKey?.[0] || tables[1]?.columns[0]?.name || '');
    setNewRelType('1:M');
    setNewJoinType('LEFT');
    setShowAddRelModal(true);
  };

  // Save Relationship from Modal
  const handleSaveAddModal = () => {
    if (!newSourceTable || !newSourceCol || !newTargetTable || !newTargetCol) return;
    const newRel: DataModelRelationship = {
      id: `rel-manual-${Date.now()}`,
      sourceTable: newSourceTable,
      sourceColumn: newSourceCol,
      targetTable: newTargetTable,
      targetColumn: newTargetCol,
      relationshipType: newRelType,
      joinType: newJoinType,
      confidence: 100,
      description: `Manual relationship: ${newSourceTable}.${newSourceCol} -> ${newTargetTable}.${newTargetCol}`,
      isAiGenerated: false,
    };
    onUpdateRelationships([...relationships, newRel]);
    setShowAddRelModal(false);
  };

  // Save Edits to Relationship
  const handleSaveRelEdit = () => {
    if (!editingRel) return;
    onUpdateRelationships(relationships.map(r => (r.id === editingRel.id ? editingRel : r)));
    setEditingRel(null);
  };

  // Compute Edge Connection Coordinates between Source Node & Target Node
  const edgePaths = useMemo(() => {
    return relationships.map(rel => {
      const srcPos = nodePositions[rel.sourceTable] || { x: 0, y: 0 };
      const tgtPos = nodePositions[rel.targetTable] || { x: 0, y: 0 };

      // Calculate anchor points (Right side of source, Left side of target)
      const srcX = srcPos.x + 280;
      const srcY = srcPos.y + 70;
      const tgtX = tgtPos.x;
      const tgtY = tgtPos.y + 70;

      // Cubic Bezier control points
      const dx = Math.abs(tgtX - srcX) * 0.5;
      const pathStr = `M ${srcX} ${srcY} C ${srcX + dx} ${srcY}, ${tgtX - dx} ${tgtY}, ${tgtX} ${tgtY}`;

      // Midpoint for badge placement
      const midX = (srcX + tgtX) / 2;
      const midY = (srcY + tgtY) / 2;

      return {
        id: rel.id,
        rel,
        srcX,
        srcY,
        tgtX,
        tgtY,
        midX,
        midY,
        pathStr,
      };
    });
  }, [relationships, nodePositions]);

  return (
    <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-xl overflow-hidden shadow-xl flex flex-col h-[650px] relative">
      {/* Top Toolbar */}
      <div className="bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)] p-3 flex flex-wrap items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-[var(--cds-interactive-01)]/20 text-[var(--cds-interactive-01)] rounded-md">
            <Workflow className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-mono font-bold text-[var(--cds-text-01)] uppercase tracking-wider block">
              {isAr ? 'مخطط العلاقات الرسومي التفاعلي (Interactive ERD Diagram)' : 'Interactive ERD Canvas'}
            </span>
            <span className="text-[10px] text-[var(--cds-text-03)]">
              {isAr
                ? 'اسحب وأسقط الخطوط بين الأوراق لربط العقد، أو اضغط على أي رابط لتعديل كاردينال نوع الربط (1:1, 1:M, M:M)'
                : 'Drag lines between columns to create links. Click links to change cardinality (1:1, 1:M, M:M).'}
            </span>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Zoom Controls */}
          <div className="flex items-center bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg p-0.5">
            <button
              onClick={() => setZoom(prev => Math.min(2, prev + 0.15))}
              className="p-1.5 hover:bg-[var(--cds-hover-ui)] text-[var(--cds-text-02)] rounded cursor-pointer"
              title={isAr ? 'تكبير' : 'Zoom In'}
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono px-2 text-[var(--cds-text-02)]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(prev => Math.max(0.4, prev - 0.15))}
              className="p-1.5 hover:bg-[var(--cds-hover-ui)] text-[var(--cds-text-02)] rounded cursor-pointer"
              title={isAr ? 'تصغير' : 'Zoom Out'}
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { setZoom(1); setPan({ x: 20, y: 20 }); }}
              className="p-1.5 hover:bg-[var(--cds-hover-ui)] text-[var(--cds-text-02)] rounded cursor-pointer border-r border-[var(--cds-border-subtle)] rtl:border-l rtl:border-r-0"
              title={isAr ? 'إعادة ضبط العرض' : 'Reset View'}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Auto Layout */}
          <button
            onClick={handleAutoLayout}
            className="px-3 py-1.5 bg-[var(--cds-layer-01)] hover:bg-[var(--cds-hover-ui)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] text-xs font-mono flex items-center gap-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#78a9ff]" />
            <span>{isAr ? 'تنظيم تلقائي' : 'Auto Layout'}</span>
          </button>

          {/* Add Relationship Button */}
          <button
            onClick={handleOpenAddModal}
            disabled={tables.length < 2}
            className="px-3 py-1.5 bg-[var(--cds-interactive-01)] hover:bg-[var(--cds-interactive-01)]/80 text-white text-xs font-mono font-bold flex items-center gap-1.5 rounded-lg transition-colors disabled:opacity-50 cursor-pointer shadow-md"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isAr ? 'ربط علاقة جديدة' : 'Add Link'}</span>
          </button>
        </div>
      </div>

      {/* Interactive Drag & Drop Canvas Viewport */}
      <div
        ref={canvasRef}
        dir="ltr"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        className="flex-1 relative overflow-hidden bg-[#0d0d0d] select-none cursor-grab active:cursor-grabbing"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        {/* Transform Layer for Zoom and Pan */}
        <div
          dir="ltr"
          className="absolute inset-0 origin-top-left pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {/* SVG Overlay for Edges/Connecting Lines */}
          <svg className="absolute overflow-visible w-full h-full pointer-events-none z-0">
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#0f62fe" />
              </marker>
              <marker
                id="arrowhead-selected"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#8a3ffc" />
              </marker>
            </defs>

            {/* Rendered Existing Edge Lines */}
            {edgePaths.map(({ id, rel, pathStr, midX, midY }) => {
              const isSelected = selectedRelId === id;
              return (
                <g key={id} className="pointer-events-auto cursor-pointer group" onClick={() => { setSelectedRelId(id); onSelectRelationship?.(rel); }}>
                  {/* Outer Thick Hit Box Line */}
                  <path
                    d={pathStr}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="20"
                  />

                  {/* Main Visual Smooth Edge Path */}
                  <path
                    d={pathStr}
                    fill="none"
                    stroke={isSelected ? '#8a3ffc' : '#0f62fe'}
                    strokeWidth={isSelected ? '3.5' : '2'}
                    strokeDasharray={rel.isAiGenerated ? '6,4' : undefined}
                    markerEnd={isSelected ? 'url(#arrowhead-selected)' : 'url(#arrowhead)'}
                    className="transition-all group-hover:stroke-[#8a3ffc] group-hover:stroke-3"
                  />

                  {/* Relationship Cardinality & Join Badge overlay at Midpoint */}
                  <foreignObject
                    x={midX - 45}
                    y={midY - 14}
                    width="90"
                    height="28"
                    className="overflow-visible"
                  >
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingRel(rel);
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold shadow-lg border flex items-center justify-center gap-1 cursor-pointer transition-transform hover:scale-110 ${
                        isSelected
                          ? 'bg-[#8a3ffc] border-[#be95ff] text-white'
                          : 'bg-[#1f1f1f] border-[#0f62fe] text-[#78a9ff] hover:bg-[#0f62fe] hover:text-white'
                      }`}
                      title={isAr ? 'اضغط لتعديل نوع الربط والعلاقة' : 'Click to edit relationship'}
                    >
                      <span>{rel.relationshipType}</span>
                      <span className="opacity-60">|</span>
                      <span>{rel.joinType || 'LEFT'}</span>
                    </div>
                  </foreignObject>
                </g>
              );
            })}

            {/* Live Dragging Cable Line while connecting */}
            {connectingSource && (
              <path
                d={`M ${connectingSource.x} ${connectingSource.y} C ${connectingSource.x + 80} ${connectingSource.y}, ${mouseCanvasPos.x - 80} ${mouseCanvasPos.y}, ${mouseCanvasPos.x} ${mouseCanvasPos.y}`}
                fill="none"
                stroke="#8a3ffc"
                strokeWidth="2.5"
                strokeDasharray="4,4"
              />
            )}
          </svg>

          {/* Render Table Nodes Cards */}
          {tables.map(tbl => {
            const pos = nodePositions[tbl.name] || { x: 0, y: 0 };
            const tableRels = relationships.filter(
              r => r.sourceTable === tbl.name || r.targetTable === tbl.name
            );

            return (
              <div
                key={tbl.name}
                onMouseDown={e => handleNodeMouseDown(e, tbl.name)}
                className="table-node-card absolute left-0 top-0 pointer-events-auto w-[290px] bg-[#1f1f1f] border-2 border-[#393939] hover:border-[#0f62fe] rounded-xl shadow-2xl transition-colors overflow-hidden group"
                style={{
                  transform: `translate(${pos.x}px, ${pos.y}px)`,
                }}
              >
                {/* Node Card Header */}
                <div
                  className="p-3 border-b border-[#393939] flex items-center justify-between gap-2 cursor-move"
                  style={{ backgroundColor: `${tbl.color || '#0f62fe'}15` }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: tbl.color || '#0f62fe' }}
                    />
                    <h4 className="text-xs font-mono font-bold text-[#f4f4f4] truncate">
                      {tbl.name}
                    </h4>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 bg-[#262626] border border-[#393939] text-[#c6c6c6] rounded">
                      {tbl.rowCount} {isAr ? 'سجل' : 'rows'}
                    </span>
                    <span className="text-[9px] font-mono px-1 bg-[#0f62fe]/20 text-[#78a9ff] rounded">
                      {tableRels.length} 🔗
                    </span>
                  </div>
                </div>

                {/* Column List */}
                <div className="p-2 space-y-1 max-h-[220px] overflow-y-auto font-mono text-[11px] custom-scrollbar">
                  {tbl.columns.map(col => {
                    const isPk = tbl.primaryKey?.includes(col.name);
                    const isFk = relationships.some(
                      r => r.sourceTable === tbl.name && r.sourceColumn === col.name
                    );

                    return (
                      <div
                        key={col.name}
                        className="px-2 py-1 bg-[#161616] hover:bg-[#262626] border border-[#262626] rounded flex items-center justify-between gap-2 group/col"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isPk ? (
                            <button
                              onClick={e => { e.stopPropagation(); handleTogglePk(tbl.name, col.name); }}
                              className="text-[#f1c21b] hover:opacity-80"
                              title="Primary Key (PK)"
                            >
                              <Key className="w-3 h-3 fill-current" />
                            </button>
                          ) : (
                            <button
                              onClick={e => { e.stopPropagation(); handleTogglePk(tbl.name, col.name); }}
                              className="text-[#525252] hover:text-[#f1c21b] opacity-0 group-hover/col:opacity-100"
                              title="Set as PK"
                            >
                              <Key className="w-3 h-3" />
                            </button>
                          )}

                          {isFk && <span title="Foreign Key (FK)"><LinkIcon className="w-3 h-3 text-[#78a9ff]" /></span>}

                          <span className={`truncate ${isPk ? 'font-bold text-[#f1c21b]' : 'text-[#f4f4f4]'}`}>
                            {col.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[9px] text-[#8d8d8d] uppercase">
                            {col.type}
                          </span>

                          {/* Port Connection Handle */}
                          <div
                            onMouseDown={e => handlePortMouseDown(e, tbl.name, col.name)}
                            onMouseUp={() => handlePortMouseUp(tbl.name, col.name)}
                            className="w-3 h-3 rounded-full bg-[#393939] hover:bg-[#8a3ffc] border border-[#525252] hover:border-white cursor-crosshair transition-colors"
                            title={isAr ? 'اسحب من هنا لربط عمود مع شيت آخر' : 'Drag port to connect'}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit Relationship Modal Dialog */}
      {editingRel && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#1f1f1f] border border-[#393939] rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#393939] pb-3">
              <div className="flex items-center gap-2 text-[#be95ff]">
                <Edit3 className="w-5 h-5" />
                <h3 className="text-sm font-mono font-bold text-white">
                  {isAr ? 'تعديل خصائص علاقة الربط' : 'Edit Relationship Properties'}
                </h3>
              </div>
              <button
                onClick={() => setEditingRel(null)}
                className="p-1 hover:bg-[#393939] text-[#c6c6c6] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-2.5 bg-[#161616] border border-[#262626] rounded flex items-center justify-between">
                <div>
                  <span className="text-[#8d8d8d] block text-[10px]">Source (FK):</span>
                  <span className="text-[#78a9ff] font-bold">{editingRel.sourceTable}.{editingRel.sourceColumn}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-[#8d8d8d]" />
                <div>
                  <span className="text-[#8d8d8d] block text-[10px]">Target (PK):</span>
                  <span className="text-[#42be65] font-bold">{editingRel.targetTable}.{editingRel.targetColumn}</span>
                </div>
              </div>

              {/* Relationship Type Selection (1:1, 1:M, M:1, M:M) */}
              <div>
                <label className="block text-[#c6c6c6] mb-1">
                  {isAr ? 'نوع العلاقة الكاردينالية (Cardinality):' : 'Relationship Type (Cardinality):'}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['1:1', '1:M', 'M:1', 'M:M'] as RelationshipType[]).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setEditingRel({ ...editingRel, relationshipType: type })}
                      className={`p-2 border rounded text-center font-bold cursor-pointer transition-colors ${
                        editingRel.relationshipType === type
                          ? 'bg-[#8a3ffc]/20 border-[#8a3ffc] text-[#be95ff]'
                          : 'bg-[#161616] border-[#393939] text-[#8d8d8d] hover:text-white'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Join Type Selection (INNER, LEFT, RIGHT, FULL) */}
              <div>
                <label className="block text-[#c6c6c6] mb-1">
                  {isAr ? 'نوع الربط (JOIN Type):' : 'SQL Join Type:'}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['LEFT', 'INNER', 'RIGHT', 'FULL'] as const).map(jType => (
                    <button
                      key={jType}
                      type="button"
                      onClick={() => setEditingRel({ ...editingRel, joinType: jType })}
                      className={`p-2 border rounded text-center font-bold cursor-pointer transition-colors ${
                        (editingRel.joinType || 'LEFT') === jType
                          ? 'bg-[#0f62fe]/20 border-[#0f62fe] text-[#78a9ff]'
                          : 'bg-[#161616] border-[#393939] text-[#8d8d8d] hover:text-white'
                      }`}
                    >
                      {jType}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description / Notes */}
              <div>
                <label className="block text-[#c6c6c6] mb-1">
                  {isAr ? 'وصف العلاقة / الملاحظات:' : 'Notes / Description:'}
                </label>
                <input
                  type="text"
                  value={editingRel.description || ''}
                  onChange={e => setEditingRel({ ...editingRel, description: e.target.value })}
                  placeholder={isAr ? 'مثال: ربط طلبات العملاء برقم العميل...' : 'Notes...'}
                  className="w-full bg-[#161616] border border-[#393939] rounded p-2 text-white outline-none focus:border-[#0f62fe]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-[#393939] pt-3">
              <button
                onClick={() => handleDeleteRelationship(editingRel.id)}
                className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500 text-red-400 text-xs font-mono rounded flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isAr ? 'حذف الربط' : 'Delete'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingRel(null)}
                  className="px-3 py-1.5 bg-[#393939] text-white text-xs font-mono rounded cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={handleSaveRelEdit}
                  className="px-3.5 py-1.5 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-xs font-mono font-bold rounded cursor-pointer shadow"
                >
                  {isAr ? 'حفظ التغيرات' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Link Creator Modal Dialog */}
      {showAddRelModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#1f1f1f] border border-[#393939] rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#393939] pb-3">
              <div className="flex items-center gap-2 text-[#78a9ff]">
                <Plus className="w-5 h-5" />
                <h3 className="text-sm font-mono font-bold text-white">
                  {isAr ? 'إنشاء علاقة جديدة بين الجداول' : 'Create New Table Relationship'}
                </h3>
              </div>
              <button
                onClick={() => setShowAddRelModal(false)}
                className="p-1 hover:bg-[#393939] text-[#c6c6c6] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              {/* Source Table */}
              <div>
                <label className="block text-[#c6c6c6] mb-1">{isAr ? 'جدول المصدر (FK Source):' : 'Source Table:'}</label>
                <select
                  value={newSourceTable}
                  onChange={e => {
                    setNewSourceTable(e.target.value);
                    const tbl = tables.find(t => t.name === e.target.value);
                    setNewSourceCol(tbl?.columns[0]?.name || '');
                  }}
                  className="w-full bg-[#161616] border border-[#393939] rounded p-2 text-white outline-none"
                >
                  {tables.map(t => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Source Column */}
              <div>
                <label className="block text-[#c6c6c6] mb-1">{isAr ? 'عمود المصدر:' : 'Source Column:'}</label>
                <select
                  value={newSourceCol}
                  onChange={e => setNewSourceCol(e.target.value)}
                  className="w-full bg-[#161616] border border-[#393939] rounded p-2 text-white outline-none"
                >
                  {tables.find(t => t.name === newSourceTable)?.columns.map(c => (
                    <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
                  ))}
                </select>
              </div>

              {/* Target Table */}
              <div>
                <label className="block text-[#c6c6c6] mb-1">{isAr ? 'الجدول الهدف (PK Target):' : 'Target Table:'}</label>
                <select
                  value={newTargetTable}
                  onChange={e => {
                    setNewTargetTable(e.target.value);
                    const tbl = tables.find(t => t.name === e.target.value);
                    setNewTargetCol(tbl?.primaryKey?.[0] || tbl?.columns[0]?.name || '');
                  }}
                  className="w-full bg-[#161616] border border-[#393939] rounded p-2 text-white outline-none"
                >
                  {tables.map(t => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Target Column */}
              <div>
                <label className="block text-[#c6c6c6] mb-1">{isAr ? 'العمود الهدف:' : 'Target Column:'}</label>
                <select
                  value={newTargetCol}
                  onChange={e => setNewTargetCol(e.target.value)}
                  className="w-full bg-[#161616] border border-[#393939] rounded p-2 text-white outline-none"
                >
                  {tables.find(t => t.name === newTargetTable)?.columns.map(c => (
                    <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
                  ))}
                </select>
              </div>

              {/* Relationship Type */}
              <div>
                <label className="block text-[#c6c6c6] mb-1">{isAr ? 'نوع العلاقة:' : 'Cardinality:'}</label>
                <select
                  value={newRelType}
                  onChange={e => setNewRelType(e.target.value as RelationshipType)}
                  className="w-full bg-[#161616] border border-[#393939] rounded p-2 text-white outline-none"
                >
                  <option value="1:1">1:1 (One to One)</option>
                  <option value="1:M">1:M (One to Many)</option>
                  <option value="M:1">M:1 (Many to One)</option>
                  <option value="M:M">M:M (Many to Many)</option>
                </select>
              </div>

              {/* Join Type */}
              <div>
                <label className="block text-[#c6c6c6] mb-1">{isAr ? 'نوع الربط SQL:' : 'Join Type:'}</label>
                <select
                  value={newJoinType}
                  onChange={e => setNewJoinType(e.target.value as any)}
                  className="w-full bg-[#161616] border border-[#393939] rounded p-2 text-white outline-none"
                >
                  <option value="LEFT">LEFT JOIN</option>
                  <option value="INNER">INNER JOIN</option>
                  <option value="RIGHT">RIGHT JOIN</option>
                  <option value="FULL">FULL JOIN</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#393939] pt-3">
              <button
                onClick={() => setShowAddRelModal(false)}
                className="px-3.5 py-1.5 bg-[#393939] text-white text-xs font-mono rounded cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleSaveAddModal}
                className="px-4 py-1.5 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-xs font-mono font-bold rounded cursor-pointer shadow"
              >
                {isAr ? 'إضافة العلاقة' : 'Create Relationship'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
