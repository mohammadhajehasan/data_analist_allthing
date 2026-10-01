import React, { useState } from 'react';
import {
  X,
  History,
  RotateCcw,
  Save,
  Trash2,
  Download,
  Calendar,
  Layers,
  Sparkles,
  CheckCircle2,
  Search,
  Tag,
  ChevronDown,
  ChevronUp,
  FileJson,
  Copy,
  Check,
  AlertCircle,
  Plus,
  GitBranch,
  Edit2,
  Clock
} from 'lucide-react';
import { WorkflowVersion, CustomWorkflowNode } from './types';
import { Edge } from '@xyflow/react';

interface WorkflowVersionHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  workflowId: string;
  workflowName: string;
  workflowNameAr?: string;
  currentNodes: CustomWorkflowNode[];
  currentEdges: Edge[];
  versions: WorkflowVersion[];
  onSaveVersion: (name: string, description?: string, tag?: string) => void;
  onRevertVersion: (version: WorkflowVersion) => void;
  onDeleteVersion: (versionId: string) => void;
  onUpdateVersion: (versionId: string, updates: Partial<WorkflowVersion>) => void;
  isAr: boolean;
}

export const WorkflowVersionHistoryDrawer: React.FC<WorkflowVersionHistoryDrawerProps> = ({
  isOpen,
  onClose,
  workflowId,
  workflowName,
  workflowNameAr,
  currentNodes,
  currentEdges,
  versions,
  onSaveVersion,
  onRevertVersion,
  onDeleteVersion,
  onUpdateVersion,
  isAr,
}) => {
  if (!isOpen) return null;

  // Filter versions belonging to this workflow
  const workflowVersions = versions
    .filter((v) => v.workflowId === workflowId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const nextVersionNumber = workflowVersions.length > 0 
    ? Math.max(...workflowVersions.map((v) => v.versionNumber || 1)) + 1 
    : 1;

  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [newVersionName, setNewVersionName] = useState<string>(
    isAr ? `نسخة v${nextVersionNumber}.0 - نقطة حفظ` : `v${nextVersionNumber}.0 - Checkpoint`
  );
  const [newVersionDesc, setNewVersionDesc] = useState<string>('');
  const [newVersionTag, setNewVersionTag] = useState<string>('checkpoint');

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editDesc, setEditDesc] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredVersions = workflowVersions.filter((v) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      v.name.toLowerCase().includes(q) ||
      (v.description && v.description.toLowerCase().includes(q)) ||
      (v.tag && v.tag.toLowerCase().includes(q)) ||
      `v${v.versionNumber}`.toLowerCase().includes(q)
    );
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVersionName.trim()) return;
    onSaveVersion(newVersionName.trim(), newVersionDesc.trim(), newVersionTag);
    setIsCreating(false);
    setNewVersionDesc('');
    setNewVersionName(
      isAr ? `نسخة v${nextVersionNumber + 1}.0 - نقطة حفظ` : `v${nextVersionNumber + 1}.0 - Checkpoint`
    );
  };

  const handleStartEdit = (v: WorkflowVersion) => {
    setEditingVersionId(v.id);
    setEditName(v.name);
    setEditDesc(v.description || '');
  };

  const handleSaveEdit = (versionId: string) => {
    if (!editName.trim()) return;
    onUpdateVersion(versionId, {
      name: editName.trim(),
      description: editDesc.trim(),
    });
    setEditingVersionId(null);
  };

  const handleExportJson = (v: WorkflowVersion) => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(v, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `pipeline_${workflowId}_v${v.versionNumber}_${v.name.replace(/\s+/g, '_')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleCopySummary = (v: WorkflowVersion) => {
    const summary = `${v.name} (v${v.versionNumber}) - ${v.nodeCount} nodes, ${v.edgeCount} connections. Created: ${new Date(v.timestamp).toLocaleString()}`;
    navigator.clipboard.writeText(summary);
    setCopiedId(v.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Helper to categorize node counts
  const getNodeCategoriesCount = (nodes: CustomWorkflowNode[]) => {
    const counts = { trigger: 0, ai: 0, logic: 0, action: 0 };
    nodes.forEach((n) => {
      const cat = n.data?.category;
      if (cat && counts[cat as keyof typeof counts] !== undefined) {
        counts[cat as keyof typeof counts]++;
      }
    });
    return counts;
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString(isAr ? 'ar-SA' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-y-0 end-0 z-40 w-full sm:w-[440px] bg-[var(--cds-layer-01)] border-s border-[var(--cds-border-subtle)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-[#0f62fe]/15 text-[#78a9ff] rounded-lg border border-[#0f62fe]/30">
            <History className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span>{isAr ? 'سجل النسخ والإصدارات' : 'Pipeline Version History'}</span>
              <span className="px-2 py-0.5 bg-[var(--cds-layer-03)] text-[var(--cds-text-02)] text-[10px] font-mono rounded-full">
                {workflowVersions.length}
              </span>
            </h2>
            <p className="text-[11px] text-[var(--cds-text-03)] truncate max-w-[240px]">
              {isAr ? (workflowNameAr || workflowName) : workflowName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--cds-text-02)] hover:text-white rounded-lg hover:bg-[var(--cds-layer-03)] transition-colors cursor-pointer"
            title={isAr ? 'إغلاق' : 'Close'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Snapshot Actions Bar */}
      <div className="p-3 bg-[var(--cds-layer-01)] border-b border-[var(--cds-border-subtle)] space-y-3">
        {!isCreating ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setNewVersionName(
                  isAr ? `نسخة v${nextVersionNumber}.0 - نقطة حفظ` : `v${nextVersionNumber}.0 - Checkpoint`
                );
                setIsCreating(true);
              }}
              className="flex-1 py-2 px-3 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-xs font-mono font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'حفظ نسخة جديدة الآن' : 'Save New Snapshot'}</span>
            </button>

            <div className="px-2.5 py-1.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg text-[10px] font-mono text-[var(--cds-text-02)] text-center">
              <span className="block text-white font-bold">{currentNodes.length}</span>
              <span>{isAr ? 'عقد حالية' : 'current nodes'}</span>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateSubmit} className="p-3 bg-[var(--cds-layer-02)] rounded-lg border border-[#0f62fe]/40 space-y-2.5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between text-xs text-white font-bold">
              <span className="flex items-center gap-1.5 text-[#78a9ff]">
                <Save className="w-3.5 h-3.5" />
                {isAr ? 'إنشاء نقطة حفظ جديدة' : 'Create Version Snapshot'}
              </span>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="text-[11px] text-[var(--cds-text-03)] hover:text-white"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
            </div>

            <div>
              <label className="text-[10px] font-mono text-[var(--cds-text-03)] block mb-1">
                {isAr ? 'اسم النسخة / العنوان' : 'Version Name'} *
              </label>
              <input
                type="text"
                value={newVersionName}
                onChange={(e) => setNewVersionName(e.target.value)}
                placeholder={isAr ? 'مثال: v2.0 - قبل تنقية العناوين' : 'e.g. v2.0 - Pre-cleanup'}
                required
                className="w-full px-2.5 py-1.5 bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] rounded-lg text-xs text-white placeholder-[#6f6f6f] focus:outline-none focus:border-[#0f62fe]"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-mono text-[var(--cds-text-03)] block mb-1">
                  {isAr ? 'نوع النسخة' : 'Snapshot Tag'}
                </label>
                <select
                  value={newVersionTag}
                  onChange={(e) => setNewVersionTag(e.target.value)}
                  className="w-full px-2 py-1.5 bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] rounded-lg text-xs text-white focus:outline-none focus:border-[#0f62fe]"
                >
                  <option value="checkpoint">{isAr ? 'نقطة حفظ عادية' : 'Checkpoint'}</option>
                  <option value="stable">{isAr ? 'مستقرة (Stable)' : 'Stable'}</option>
                  <option value="milestone">{isAr ? 'إنجاز (Milestone)' : 'Milestone'}</option>
                  <option value="backup">{isAr ? 'نسخة احتياطية' : 'Backup'}</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-mono text-[var(--cds-text-03)] block mb-1">
                  {isAr ? 'حجم المخطط' : 'Pipeline Scope'}
                </label>
                <div className="px-2 py-1.5 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg text-xs text-[var(--cds-text-02)] font-mono">
                  {currentNodes.length} nodes · {currentEdges.length} links
                </div>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-[var(--cds-text-03)] block mb-1">
                {isAr ? 'ملاحظات التغيير (اختياري)' : 'Change Notes (Optional)'}
              </label>
              <textarea
                value={newVersionDesc}
                onChange={(e) => setNewVersionDesc(e.target.value)}
                placeholder={isAr ? 'ما التعديلات التي أجريتها في هذا الإصدار؟' : 'What changed in this version?'}
                rows={2}
                className="w-full px-2.5 py-1.5 bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] rounded-lg text-xs text-white placeholder-[#6f6f6f] focus:outline-none focus:border-[#0f62fe] resize-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-1.5 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-xs font-mono font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isAr ? 'تأكيد وحفظ النسخة' : 'Confirm & Save'}</span>
            </button>
          </form>
        )}

        {/* Search Versions */}
        {workflowVersions.length > 2 && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--cds-text-03)] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? 'بحث في النسخ المحفوظة...' : 'Search versions...'}
              className="w-full pl-8 pr-3 py-1.5 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg text-xs text-white placeholder-[#6f6f6f] focus:outline-none focus:border-[#0f62fe]"
            />
          </div>
        )}
      </div>

      {/* Version List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[var(--cds-background)]">
        {filteredVersions.length === 0 ? (
          <div className="text-center py-12 px-4 space-y-3">
            <div className="w-12 h-12 rounded-xl bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] flex items-center justify-center mx-auto text-[var(--cds-text-03)]">
              <History className="w-6 h-6 opacity-40 text-[#78a9ff]" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-white">
                {searchQuery ? (isAr ? 'لا توجد نتائج تطابق البحث' : 'No matching versions found') : (isAr ? 'لا توجد نسخ محفوظة بعد' : 'No version snapshots yet')}
              </h3>
              <p className="text-[11px] text-[var(--cds-text-03)] max-w-[240px] mx-auto leading-relaxed">
                {isAr
                  ? 'احفظ نسخاً متتالية من مخطط الأتمتة للرجوع إليها في أي وقت أو للتجربة بأمان.'
                  : 'Save snapshots of your pipeline to easily revert changes or experiment safely.'}
              </p>
            </div>
            {!searchQuery && (
              <button
                onClick={() => {
                  onSaveVersion(
                    isAr ? 'الإصدار الأولي v1.0' : 'Initial Version v1.0',
                    isAr ? 'النسخة التأسيسية لسير العمل' : 'Initial pipeline checkpoint',
                    'stable'
                  );
                }}
                className="px-3.5 py-1.5 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] text-[#78a9ff] border border-[#0f62fe]/40 rounded-lg text-xs font-mono font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isAr ? 'إنشاء النسخة الأولى v1.0' : 'Create Initial v1.0'}</span>
              </button>
            )}
          </div>
        ) : (
          filteredVersions.map((v, index) => {
            const isExpanded = expandedVersionId === v.id;
            const isEditing = editingVersionId === v.id;
            const catCounts = getNodeCategoriesCount(v.nodes);
            const isLatest = index === 0;

            const tagColor =
              v.tag === 'stable'
                ? 'bg-[#24a148]/15 text-[#42be65] border-[#24a148]/30'
                : v.tag === 'milestone'
                ? 'bg-[#8a3ffc]/15 text-[#be95ff] border-[#8a3ffc]/30'
                : v.tag === 'backup'
                ? 'bg-[#f1c21b]/15 text-[#f1c21b] border-[#f1c21b]/30'
                : 'bg-[#0f62fe]/15 text-[#78a9ff] border-[#0f62fe]/30';

            return (
              <div
                key={v.id}
                className={`bg-[var(--cds-layer-01)] border rounded-lg transition-all duration-150 overflow-hidden ${
                  isExpanded ? 'border-[#0f62fe]/60 shadow-lg' : 'border-[var(--cds-border-subtle)] hover:border-[var(--cds-border-strong)]'
                }`}
              >
                {/* Main Card Header */}
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="px-2 py-0.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-strong)] text-white text-[11px] font-mono font-bold rounded-md shrink-0">
                        v{v.versionNumber || 1}
                      </span>
                      <div className="min-w-0">
                        {isEditing ? (
                          <div className="space-y-1.5 my-1">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full px-2 py-1 bg-[var(--cds-layer-01)] border border-[#0f62fe] rounded text-xs text-white focus:outline-none"
                            />
                            <input
                              type="text"
                              value={editDesc}
                              onChange={(e) => setEditDesc(e.target.value)}
                              placeholder={isAr ? 'ملاحظة...' : 'Note...'}
                              className="w-full px-2 py-1 bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] rounded text-[11px] text-white focus:outline-none"
                            />
                            <div className="flex items-center gap-1 pt-1">
                              <button
                                onClick={() => handleSaveEdit(v.id)}
                                className="px-2 py-0.5 bg-[#0f62fe] text-white text-[10px] rounded font-bold"
                              >
                                {isAr ? 'حفظ' : 'Save'}
                              </button>
                              <button
                                onClick={() => setEditingVersionId(null)}
                                className="px-2 py-0.5 bg-[var(--cds-layer-03)] text-[var(--cds-text-02)] text-[10px] rounded"
                              >
                                {isAr ? 'إلغاء' : 'Cancel'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <h4 className="text-xs font-bold text-white truncate leading-tight flex items-center gap-1.5">
                              <span>{v.name}</span>
                              {isLatest && (
                                <span className="px-1.5 py-0.2 bg-[#0f62fe]/20 text-[#78a9ff] text-[9px] font-mono rounded">
                                  {isAr ? 'الأحدث' : 'Latest'}
                                </span>
                              )}
                            </h4>
                            {v.description && (
                              <p className="text-[11px] text-[var(--cds-text-02)] mt-0.5 leading-relaxed line-clamp-2">
                                {v.description}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Tag badge */}
                    {v.tag && (
                      <span className={`px-2 py-0.5 border text-[10px] font-mono rounded-full shrink-0 ${tagColor}`}>
                        {v.tag}
                      </span>
                    )}
                  </div>

                  {/* Metadata Row */}
                  <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-[var(--cds-border-subtle)] text-[10px] font-mono text-[var(--cds-text-03)]">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[var(--cds-text-03)]" />
                      <span>{formatDate(v.timestamp)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[var(--cds-text-02)]">
                        {v.nodeCount} {isAr ? 'عقدة' : 'nodes'}
                      </span>
                      <span>·</span>
                      <span className="text-[var(--cds-text-02)]">
                        {v.edgeCount} {isAr ? 'رابط' : 'links'}
                      </span>
                    </div>
                  </div>

                  {/* Actions Toolbar */}
                  <div className="flex items-center justify-between gap-1.5 mt-2.5 pt-2 border-t border-[var(--cds-border-subtle)]">
                    {/* Revert Action */}
                    <button
                      onClick={() => onRevertVersion(v)}
                      className="flex-1 py-1.5 px-2 bg-[#0f62fe]/15 hover:bg-[#0f62fe]/25 text-[#78a9ff] border border-[#0f62fe]/30 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      title={isAr ? 'استعادة هذه النسخة وتطبيقها على مساحة العمل' : 'Revert canvas to this version'}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{isAr ? 'استعادة هذه النسخة' : 'Revert to This'}</span>
                    </button>

                    {/* Expand Details */}
                    <button
                      onClick={() => setExpandedVersionId(isExpanded ? null : v.id)}
                      className="p-1.5 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-02)] hover:text-white rounded-lg border border-[var(--cds-border-subtle)] transition-colors cursor-pointer"
                      title={isAr ? 'عرض التفاصيل' : 'Toggle details'}
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {/* Edit info */}
                    <button
                      onClick={() => handleStartEdit(v)}
                      className="p-1.5 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-02)] hover:text-white rounded-lg border border-[var(--cds-border-subtle)] transition-colors cursor-pointer"
                      title={isAr ? 'تعديل الاسم والملاحظة' : 'Edit name & note'}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Download JSON */}
                    <button
                      onClick={() => handleExportJson(v)}
                      className="p-1.5 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-02)] hover:text-white rounded-lg border border-[var(--cds-border-subtle)] transition-colors cursor-pointer"
                      title={isAr ? 'تصدير كملف JSON' : 'Export JSON'}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => onDeleteVersion(v.id)}
                      className="p-1.5 bg-[var(--cds-layer-02)] hover:bg-[#da1e28]/20 text-[var(--cds-text-03)] hover:text-[#fa4d56] rounded-lg border border-[var(--cds-border-subtle)] hover:border-[#da1e28]/40 transition-colors cursor-pointer"
                      title={isAr ? 'حذف هذه النسخة' : 'Delete version'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded Breakdown */}
                {isExpanded && (
                  <div className="p-3 bg-[var(--cds-layer-01)] border-t border-[var(--cds-border-subtle)] space-y-2.5 text-[11px] font-mono animate-in fade-in duration-150">
                    <div className="flex items-center justify-between text-[var(--cds-text-03)]">
                      <span>{isAr ? 'توزيع عقد المخطط:' : 'Node Distribution:'}</span>
                      <button
                        onClick={() => handleCopySummary(v)}
                        className="text-[#78a9ff] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {copiedId === v.id ? <Check className="w-3 h-3 text-[#42be65]" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedId === v.id ? (isAr ? 'تم النسخ' : 'Copied') : (isAr ? 'نسخ الملخص' : 'Copy')}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 text-center">
                      <div className="p-1.5 bg-[var(--cds-layer-02)] rounded border border-[var(--cds-border-subtle)]">
                        <span className="text-[10px] text-[#78a9ff] block font-bold">{catCounts.trigger}</span>
                        <span className="text-[9px] text-[var(--cds-text-03)]">{isAr ? 'مشغل' : 'Trigger'}</span>
                      </div>
                      <div className="p-1.5 bg-[var(--cds-layer-02)] rounded border border-[var(--cds-border-subtle)]">
                        <span className="text-[10px] text-[#be95ff] block font-bold">{catCounts.ai}</span>
                        <span className="text-[9px] text-[var(--cds-text-03)]">{isAr ? 'ذكاء' : 'AI'}</span>
                      </div>
                      <div className="p-1.5 bg-[var(--cds-layer-02)] rounded border border-[var(--cds-border-subtle)]">
                        <span className="text-[10px] text-[#08bdba] block font-bold">{catCounts.logic}</span>
                        <span className="text-[9px] text-[var(--cds-text-03)]">{isAr ? 'منطق' : 'Logic'}</span>
                      </div>
                      <div className="p-1.5 bg-[var(--cds-layer-02)] rounded border border-[var(--cds-border-subtle)]">
                        <span className="text-[10px] text-[#42be65] block font-bold">{catCounts.action}</span>
                        <span className="text-[9px] text-[var(--cds-text-03)]">{isAr ? 'إجراء' : 'Action'}</span>
                      </div>
                    </div>

                    {/* Nodes list summary */}
                    <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                      <span className="text-[10px] text-[var(--cds-text-03)] block">{isAr ? 'العقد المشمولة:' : 'Included Nodes:'}</span>
                      {v.nodes.map((node, i) => (
                        <div
                          key={node.id || i}
                          className="flex items-center justify-between px-2 py-1 bg-[var(--cds-layer-02)]/50 rounded text-[10px] text-[var(--cds-text-02)]"
                        >
                          <span className="truncate max-w-[200px]">
                            {isAr ? (node.data?.labelAr || node.data?.label || node.id) : (node.data?.label || node.id)}
                          </span>
                          <span className="text-[var(--cds-text-03)] text-[9px] uppercase">
                            {node.data?.category}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Drawer Footer info */}
      <div className="p-3 bg-[var(--cds-layer-01)] border-t border-[var(--cds-border-subtle)] flex items-center justify-between text-[11px] font-mono text-[var(--cds-text-03)]">
        <span className="flex items-center gap-1 text-[#78a9ff]">
          <GitBranch className="w-3.5 h-3.5" />
          <span>{isAr ? 'حفظ محلي آمن 100%' : '100% Local Snapshots'}</span>
        </span>
        <span>
          {workflowVersions.length} {isAr ? 'نسخة مسجلة' : 'snapshots recorded'}
        </span>
      </div>
    </div>
  );
};
