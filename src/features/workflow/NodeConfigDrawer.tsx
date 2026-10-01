import React, { useState } from 'react';
import { 
  X, 
  Settings2, 
  Trash2, 
  Play, 
  Bot, 
  Database, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  Layers,
  Wand2,
  Lock,
  Bell,
  Cpu,
  Filter,
  TrendingUp,
  Calendar,
  ShieldAlert,
  Link2,
  Unlink,
  ArrowRight,
  Plus,
  GitBranch,
  Info
} from 'lucide-react';
import { CustomWorkflowNode, WorkflowNodeData } from './types';
import { Edge } from '@xyflow/react';
import { useApp } from '../../context/AppContext';

interface NodeConfigDrawerProps {
  node: CustomWorkflowNode | null;
  allNodes?: CustomWorkflowNode[];
  edges?: Edge[];
  onClose: () => void;
  onUpdateNodeData: (nodeId: string, newData: Partial<WorkflowNodeData>) => void;
  onDeleteNode: (nodeId: string) => void;
  onTestNode: (node: CustomWorkflowNode) => Promise<void>;
  onConnectNodes?: (sourceId: string, targetId: string, sourceHandle?: string) => void;
  onDeleteEdge?: (edgeId: string) => void;
  isTesting?: boolean;
}

export const NodeConfigDrawer: React.FC<NodeConfigDrawerProps> = ({
  node,
  allNodes = [],
  edges = [],
  onClose,
  onUpdateNodeData,
  onDeleteNode,
  onTestNode,
  onConnectNodes,
  onDeleteEdge,
  isTesting = false,
}) => {
  const { language, datasets, activeDataset, availableAIModels, activeAIModelDef, toast } = useApp();
  const isAr = language === 'ar';

  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [selectedConditionBranch, setSelectedConditionBranch] = useState<'pass' | 'fail'>('pass');

  if (!node) return null;

  const data = node.data;
  const config = data.config || {};
  const currentCols = activeDataset?.columns || [];
  const isConditionNode = data.nodeType === 'condition_rule';

  // Find incoming & outgoing edges for this node
  const incomingEdges = edges.filter((e) => e.target === node.id);
  const outgoingEdges = edges.filter((e) => e.source === node.id);

  // Available target nodes to connect to (excluding this node and already connected nodes)
  const availableTargetNodes = allNodes.filter((n) => {
    if (n.id === node.id) return false;
    // Disallow triggers as target
    if (n.data.category === 'trigger') return false;
    return true;
  });

  const handleQuickConnect = () => {
    if (!selectedTargetId) {
      toast.warning(
        isAr ? 'حدد العقدة المستهدفة' : 'Select Target Node',
        isAr ? 'يرجى اختيار عقدة من القائمة لتوصيلها.' : 'Please select a node to connect.'
      );
      return;
    }

    if (onConnectNodes) {
      onConnectNodes(
        node.id, 
        selectedTargetId, 
        isConditionNode ? selectedConditionBranch : undefined
      );
      setSelectedTargetId('');
      toast.success(
        isAr ? 'تم ربط العقدتين بنجاح' : 'Nodes Connected',
        isAr ? 'تم إنشاء مسار التدفق بين العقدتين.' : 'Flow link created.'
      );
    }
  };

  const handleConfigChange = (key: string, value: any) => {
    onUpdateNodeData(node.id, {
      config: {
        ...config,
        [key]: value,
      }
    });
  };

  const handleFieldChange = (field: 'label' | 'labelAr' | 'description' | 'descriptionAr', value: string) => {
    onUpdateNodeData(node.id, {
      [field]: value,
    });
  };

  return (
    <div className="w-80 md:w-96 bg-[var(--cds-layer-01)] border-s border-[var(--cds-border-subtle)] flex flex-col h-full z-20 shadow-2xl animate-in slide-in-from-right duration-200" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="p-4 border-b border-[var(--cds-border-subtle)] flex items-center justify-between bg-[var(--cds-layer-02)]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[var(--cds-layer-03)] text-[#78a9ff]">
            <Settings2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white font-mono">
              {isAr ? 'خصائص وإعدادات العقدة' : 'Node Properties'}
            </h3>
            <span className="text-[10px] text-[var(--cds-text-02)] font-mono">
              ID: {node.id} ({data.nodeType})
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-[var(--cds-layer-03)] rounded text-[var(--cds-text-02)] hover:text-white transition-colors"
          title={isAr ? 'إغلاق' : 'Close'}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body / Scrollable Form */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* Connection Management Section (Quick Connect & Active Links) */}
        <div className="space-y-3 p-3 bg-[var(--cds-layer-02)] rounded-lg border border-[#0f62fe]/40 shadow-sm">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-white flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-[#78a9ff]" />
              {isAr ? 'مسارات وتوصيلات العقدة' : 'Node Connections & Flow'}
            </h4>
            <span className="text-[10px] font-mono text-[#78a9ff] bg-[#0f62fe]/15 px-1.5 py-0.5 rounded border border-[#0f62fe]/30">
              {incomingEdges.length} دخل / {outgoingEdges.length} خرج
            </span>
          </div>

          <div className="p-2 rounded-lg bg-[#0f62fe]/10 border border-[#0f62fe]/20 text-[10px] text-[var(--cds-text-02)] flex items-start gap-1.5 leading-relaxed">
            <Info className="w-3.5 h-3.5 text-[#78a9ff] shrink-0 mt-0.5" />
            <span>
              {isAr 
                ? 'يمكنك ربط العقد إما بسحب الدائرة السفلية في اللوحة إلى العقدة التالية، أو عبر التوصيل السريع أدناه.' 
                : 'Connect nodes by dragging handles on canvas or using the quick connect below.'}
            </span>
          </div>

          {/* Quick Connect Dropdown */}
          <div className="space-y-2 pt-1 border-t border-[var(--cds-border-subtle)]">
            <label className="text-[11px] font-bold text-[var(--cds-text-01)] block">
              {isAr ? '⚡ توصيل سريع بعقدة أخرى (بنقرة واحدة):' : '⚡ Quick Connect to Another Node:'}
            </label>
            
            <div className="space-y-1.5">
              <select
                value={selectedTargetId}
                onChange={(e) => setSelectedTargetId(e.target.value)}
                className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-[#0f62fe]"
              >
                <option value="">{isAr ? '-- اختر العقدة التالية للربط بها --' : '-- Select Target Node --'}</option>
                {availableTargetNodes.map((targetNode) => {
                  const label = isAr ? (targetNode.data.labelAr || targetNode.data.label) : (targetNode.data.label || targetNode.data.labelAr);
                  return (
                    <option key={targetNode.id} value={targetNode.id}>
                      [{targetNode.data.category.toUpperCase()}] {label} ({targetNode.id})
                    </option>
                  );
                })}
              </select>

              {/* If condition node, allow selecting which branch */}
              {isConditionNode && (
                <div className="flex gap-2 text-[10px] font-mono">
                  <label className="flex-1 flex items-center justify-center gap-1.5 p-1.5 rounded-lg border cursor-pointer transition-all bg-[#24a148]/10 border-[#24a148]/30 text-[#42be65]">
                    <input
                      type="radio"
                      name="conditionBranch"
                      value="pass"
                      checked={selectedConditionBranch === 'pass'}
                      onChange={() => setSelectedConditionBranch('pass')}
                      className="text-[#24a148]"
                    />
                    <span>{isAr ? 'مسار النجاح (Pass)' : 'Pass Branch'}</span>
                  </label>
                  <label className="flex-1 flex items-center justify-center gap-1.5 p-1.5 rounded-lg border cursor-pointer transition-all bg-[#da1e28]/10 border-[#da1e28]/30 text-[#fa4d56]">
                    <input
                      type="radio"
                      name="conditionBranch"
                      value="fail"
                      checked={selectedConditionBranch === 'fail'}
                      onChange={() => setSelectedConditionBranch('fail')}
                      className="text-[#da1e28]"
                    />
                    <span>{isAr ? 'مسار الفشل (Fail)' : 'Fail Branch'}</span>
                  </label>
                </div>
              )}

              <button
                type="button"
                onClick={handleQuickConnect}
                disabled={!selectedTargetId}
                className="w-full py-1.5 px-3 bg-[#0f62fe] hover:bg-[#0353e9] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'إنشاء رابط التوصيل الآن' : 'Create Connection Now'}</span>
              </button>
            </div>
          </div>

          {/* Current Outgoing Links List */}
          {outgoingEdges.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-[var(--cds-border-subtle)]">
              <span className="text-[10px] font-mono text-[var(--cds-text-02)] block">
                {isAr ? 'العقد اللاحقة المتصلة (Outputs):' : 'Connected Outputs:'}
              </span>
              <div className="space-y-1">
                {outgoingEdges.map((edge) => {
                  const targetNode = allNodes.find((n) => n.id === edge.target);
                  const targetLabel = targetNode ? (isAr ? (targetNode.data.labelAr || targetNode.data.label) : (targetNode.data.label || targetNode.data.labelAr)) : edge.target;
                  const isPass = edge.sourceHandle === 'pass';
                  const isFail = edge.sourceHandle === 'fail';

                  return (
                    <div key={edge.id} className="p-1.5 bg-[var(--cds-layer-01)] rounded-lg border border-[var(--cds-border-subtle)] flex items-center justify-between gap-1 text-[10px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ArrowRight className="w-3 h-3 text-[#78a9ff] shrink-0" />
                        <span className="text-white truncate font-bold">{targetLabel}</span>
                        {isPass && <span className="text-[9px] text-[#42be65] px-1 bg-[#24a148]/20 rounded shrink-0">Pass</span>}
                        {isFail && <span className="text-[9px] text-[#fa4d56] px-1 bg-[#da1e28]/20 rounded shrink-0">Fail</span>}
                      </div>
                      {onDeleteEdge && (
                        <button
                          type="button"
                          onClick={() => onDeleteEdge(edge.id)}
                          className="p-1 text-[var(--cds-text-03)] hover:text-[#fa4d56] hover:bg-[var(--cds-layer-03)] rounded transition-colors shrink-0"
                          title={isAr ? 'فصل الرابط' : 'Disconnect'}
                        >
                          <Unlink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Current Incoming Links List */}
          {incomingEdges.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-[var(--cds-border-subtle)]">
              <span className="text-[10px] font-mono text-[var(--cds-text-02)] block">
                {isAr ? 'العقد السابقة المغذية لهذه العقدة (Inputs):' : 'Connected Inputs:'}
              </span>
              <div className="space-y-1">
                {incomingEdges.map((edge) => {
                  const sourceNode = allNodes.find((n) => n.id === edge.source);
                  const sourceLabel = sourceNode ? (isAr ? (sourceNode.data.labelAr || sourceNode.data.label) : (sourceNode.data.label || sourceNode.data.labelAr)) : edge.source;

                  return (
                    <div key={edge.id} className="p-1.5 bg-[var(--cds-layer-01)] rounded-lg border border-[var(--cds-border-subtle)] flex items-center justify-between gap-1 text-[10px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[#08bdba] font-mono shrink-0">📥</span>
                        <span className="text-white truncate font-bold">{sourceLabel}</span>
                      </div>
                      {onDeleteEdge && (
                        <button
                          type="button"
                          onClick={() => onDeleteEdge(edge.id)}
                          className="p-1 text-[var(--cds-text-03)] hover:text-[#fa4d56] hover:bg-[var(--cds-layer-03)] rounded transition-colors shrink-0"
                          title={isAr ? 'فصل الرابط' : 'Disconnect'}
                        >
                          <Unlink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Node Basic Info */}
        <div className="space-y-3 p-3 bg-[var(--cds-layer-02)] rounded-lg border border-[var(--cds-border-subtle)]">
          <h4 className="font-bold text-[var(--cds-text-01)] flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#78a9ff]" />
            {isAr ? 'التعريف والاسم' : 'Node Identity'}
          </h4>

          <div>
            <label className="text-[11px] text-[var(--cds-text-02)] block mb-1">
              {isAr ? 'الاسم بالعربية' : 'Arabic Label'}
            </label>
            <input
              type="text"
              value={data.labelAr || ''}
              onChange={(e) => handleFieldChange('labelAr', e.target.value)}
              className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#0f62fe]"
              dir="rtl"
            />
          </div>

          <div>
            <label className="text-[11px] text-[var(--cds-text-02)] block mb-1">
              {isAr ? 'الاسم بالإنجليزية' : 'English Label'}
            </label>
            <input
              type="text"
              value={data.label || ''}
              onChange={(e) => handleFieldChange('label', e.target.value)}
              className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#0f62fe]"
              dir="ltr"
            />
          </div>

          <div>
            <label className="text-[11px] text-[var(--cds-text-02)] block mb-1">
              {isAr ? 'الوصف التوضيحي' : 'Description'}
            </label>
            <textarea
              rows={2}
              value={isAr ? (data.descriptionAr || '') : (data.description || '')}
              onChange={(e) => handleFieldChange(isAr ? 'descriptionAr' : 'description', e.target.value)}
              className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#0f62fe] text-[11px]"
            />
          </div>
        </div>

        {/* Dynamic Node Specific Settings */}
        <div className="space-y-3 p-3 bg-[var(--cds-layer-02)] rounded-lg border border-[var(--cds-border-subtle)]">
          <h4 className="font-bold text-[var(--cds-text-01)] flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-[#be95ff]" />
            {isAr ? 'المعايير وعمليات المعالجة' : 'Operation Parameters'}
          </h4>

          {/* Target Dataset Selection (for applicable nodes) */}
          {['trigger_dataset', 'ai_profiler', 'ai_cleaner', 'ai_enricher', 'ai_summarizer', 'aggregation_kpi', 'filter_transform'].includes(data.nodeType) && (
            <div>
              <label className="text-[11px] text-[var(--cds-text-02)] block mb-1">
                {isAr ? 'الجدول المستهدف' : 'Target Dataset'}
              </label>
              <select
                value={config.datasetId || 'active'}
                onChange={(e) => handleConfigChange('datasetId', e.target.value)}
                className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#0f62fe]"
              >
                <option value="active">{isAr ? '📌 الجدول النشط حالياً' : '📌 Currently Active Dataset'}</option>
                <option value="all">{isAr ? '🌐 جميع الجداول (All Datasets)' : '🌐 All Datasets'}</option>
                {datasets.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name} ({ds.rowCount} {isAr ? 'سجل' : 'rows'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* AI Model Selection for AI nodes */}
          {data.category === 'ai' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-[var(--cds-text-02)]">
                  {isAr ? 'نموذج الذكاء الاصطناعي المستهدف' : 'Target AI Model / Engine'}
                </label>
                <span className="text-[9px] text-[#78a9ff] font-mono">
                  {availableAIModels.find(m => m.id === (config.model || activeAIModelDef.id))?.isLocal ? (isAr ? '🔒 محلي 100%' : '🔒 Local 100%') : (isAr ? '☁️ سحابي' : '☁️ Cloud')}
                </span>
              </div>
              <select
                value={config.model || activeAIModelDef.id || 'gemini-3.8-flash'}
                onChange={(e) => handleConfigChange('model', e.target.value)}
                className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#0f62fe] text-xs font-mono"
              >
                <optgroup label={isAr ? '🤖 النماذج المحلية (Local / Ollama)' : '🤖 Local Models (Ollama / LocalAI)'}>
                  {availableAIModels.filter(m => m.isLocal).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.parameterSize || 'Local'} • Zero-Egress)
                    </option>
                  ))}
                </optgroup>
                <optgroup label={isAr ? '☁️ النماذج السحابية (Cloud Providers)' : '☁️ Cloud AI Models'}>
                  {availableAIModels.filter(m => !m.isLocal).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.providerName})
                    </option>
                  ))}
                </optgroup>
              </select>
              <p className="text-[10px] text-[var(--cds-text-03)] mt-1">
                {isAr
                  ? 'يمكنك تشغيل هذه العقدة عبر Ollama محلياً على جهازك دون مشاركة البيانات خارجياً.'
                  : 'You can execute this node using local Ollama on your machine without external data transmission.'}
              </p>
            </div>
          )}

          {/* Trigger Frequency for Schedules */}
          {data.nodeType === 'trigger_schedule' && (
            <div>
              <label className="text-[11px] text-[var(--cds-text-02)] block mb-1">
                {isAr ? 'تكرار الجدولة' : 'Schedule Frequency'}
              </label>
              <select
                value={config.frequency || 'daily'}
                onChange={(e) => handleConfigChange('frequency', e.target.value)}
                className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#0f62fe]"
              >
                <option value="hourly">{isAr ? 'كل ساعة (Hourly)' : 'Hourly'}</option>
                <option value="daily">{isAr ? 'يومياً الساعة 08:00 صباحاً (Daily)' : 'Daily at 08:00 AM'}</option>
                <option value="weekly">{isAr ? 'أسبوعياً كل يوم أحد (Weekly)' : 'Weekly on Sunday'}</option>
                <option value="monthly">{isAr ? 'شهرياً في اليوم الأول (Monthly)' : 'Monthly on 1st'}</option>
              </select>
            </div>
          )}

          {/* Filter Transform Settings */}
          {data.nodeType === 'filter_transform' && (
            <div className="space-y-2">
              <div>
                <label className="text-[11px] text-[var(--cds-text-02)] block mb-1">
                  {isAr ? 'حقل التصفية' : 'Filter Column'}
                </label>
                <input
                  type="text"
                  placeholder={currentCols[0]?.name || 'status'}
                  value={config.field || ''}
                  onChange={(e) => handleConfigChange('field', e.target.value)}
                  className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#0f62fe]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-[var(--cds-text-02)] block mb-1">
                    {isAr ? 'العملية' : 'Operator'}
                  </label>
                  <select
                    value={config.operator || 'not_equals'}
                    onChange={(e) => handleConfigChange('operator', e.target.value)}
                    className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-[#0f62fe]"
                  >
                    <option value="not_equals">{isAr ? 'لا يساوي (!=)' : 'Not Equals (!=)'}</option>
                    <option value="equals">{isAr ? 'يساوي (==)' : 'Equals (==)'}</option>
                    <option value="contains">{isAr ? 'يحتوي على' : 'Contains'}</option>
                    <option value="greater_than">{isAr ? 'أكبر من (&gt;)' : 'Greater Than (&gt;)'}</option>
                    <option value="less_than">{isAr ? 'أصغر من (&lt;)' : 'Less Than (&lt;)'}</option>
                    <option value="is_not_empty">{isAr ? 'غير فارغ' : 'Is Not Empty'}</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-[var(--cds-text-02)] block mb-1">
                    {isAr ? 'القيمة' : 'Value'}
                  </label>
                  <input
                    type="text"
                    value={config.value !== undefined ? config.value : 'cancelled'}
                    onChange={(e) => handleConfigChange('value', e.target.value)}
                    className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#0f62fe]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Condition settings */}
          {data.nodeType === 'condition_rule' && (
            <div className="space-y-2">
              <div>
                <label className="text-[11px] text-[var(--cds-text-02)] block mb-1">
                  {isAr ? 'معيار الفحص' : 'Validation Metric'}
                </label>
                <select
                  value={config.field || 'overallScore'}
                  onChange={(e) => handleConfigChange('field', e.target.value)}
                  className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#0f62fe]"
                >
                  <option value="overallScore">{isAr ? 'نسبة الجودة الكلية (Quality Score %)' : 'Overall Quality Score %'}</option>
                  <option value="anomaliesCount">{isAr ? 'عدد القيم الشاذة (Anomalies Count)' : 'Anomalies Count'}</option>
                  <option value="missingValuesPercentage">{isAr ? 'نسبة القيم المفقودة (Nulls %)' : 'Missing Values %'}</option>
                  <option value="rowCount">{isAr ? 'عدد السجلات الإجمالي (Row Count)' : 'Total Row Count'}</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-[var(--cds-text-02)] block mb-1">
                    {isAr ? 'الشرط' : 'Operator'}
                  </label>
                  <select
                    value={config.operator || 'gte'}
                    onChange={(e) => handleConfigChange('operator', e.target.value)}
                    className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#0f62fe]"
                  >
                    <option value="gte">&gt;= (أكبر من أو يساوي)</option>
                    <option value="gt">&gt; (أكبر من)</option>
                    <option value="lte">&lt;= (أصغر من أو يساوي)</option>
                    <option value="eq">== (يساوي تماماً)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-[var(--cds-text-02)] block mb-1">
                    {isAr ? 'القيمة الحدية' : 'Threshold'}
                  </label>
                  <input
                    type="number"
                    value={config.threshold !== undefined ? config.threshold : 80}
                    onChange={(e) => handleConfigChange('threshold', parseFloat(e.target.value))}
                    className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#0f62fe]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* AI Cleaner strategy */}
          {data.nodeType === 'ai_cleaner' && (
            <div className="space-y-2">
              <div>
                <label className="text-[11px] text-[var(--cds-text-02)] block mb-1">
                  {isAr ? 'استراتيجية معالجة القيم الفارغة' : 'Imputation Strategy'}
                </label>
                <select
                  value={config.cleanStrategy || 'smart_impute'}
                  onChange={(e) => handleConfigChange('cleanStrategy', e.target.value)}
                  className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#0f62fe]"
                >
                  <option value="smart_impute">{isAr ? 'تعويض ذكي (المتوسط / الوسيط الحسابي)' : 'Smart Impute (Mean/Median)'}</option>
                  <option value="drop_nulls">{isAr ? 'حذف الصفوف غير المكتملة' : 'Drop Incomplete Rows'}</option>
                  <option value="zero_fill">{isAr ? 'ملء بالأصفار أو قيم افتراضية' : 'Fill with Zero/Default'}</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-[var(--cds-text-02)] cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={config.removeDuplicates !== false}
                  onChange={(e) => handleConfigChange('removeDuplicates', e.target.checked)}
                  className="rounded border-[var(--cds-border-strong)] text-[#0f62fe] focus:ring-0"
                />
                <span>{isAr ? 'إزالة السجلات المكررة آلياً' : 'Automatically Remove Duplicate Rows'}</span>
              </label>
            </div>
          )}

          {/* AI Forecaster settings */}
          {data.nodeType === 'ai_forecast' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-[var(--cds-text-02)] block mb-1">
                    {isAr ? 'فترات التوقع القادمة' : 'Future Periods'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={config.periods || 3}
                    onChange={(e) => handleConfigChange('periods', parseInt(e.target.value))}
                    className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#0f62fe]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[var(--cds-text-02)] block mb-1">
                    {isAr ? 'نسبة الثقة %' : 'Confidence %'}
                  </label>
                  <input
                    type="number"
                    value={config.confidence || 95}
                    onChange={(e) => handleConfigChange('confidence', parseInt(e.target.value))}
                    className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#0f62fe]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Privacy Masker settings */}
          {data.nodeType === 'privacy_masker' && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[11px] text-[var(--cds-text-02)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.maskEmails !== false}
                  onChange={(e) => handleConfigChange('maskEmails', e.target.checked)}
                  className="rounded border-[var(--cds-border-strong)] text-[#009d9a]"
                />
                <span>{isAr ? 'تشفير عناوين البريد الإلكتروني' : 'Mask Email Addresses'}</span>
              </label>
              <label className="flex items-center gap-2 text-[11px] text-[var(--cds-text-02)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.maskPhoneNumbers !== false}
                  onChange={(e) => handleConfigChange('maskPhoneNumbers', e.target.checked)}
                  className="rounded border-[var(--cds-border-strong)] text-[#009d9a]"
                />
                <span>{isAr ? 'حجب أرقام الهواتف' : 'Mask Phone Numbers'}</span>
              </label>
              <label className="flex items-center gap-2 text-[11px] text-[var(--cds-text-02)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.maskNationalIds !== false}
                  onChange={(e) => handleConfigChange('maskNationalIds', e.target.checked)}
                  className="rounded border-[var(--cds-border-strong)] text-[#009d9a]"
                />
                <span>{isAr ? 'إخفاء أرقام الهويات الوطنية والبطاقات' : 'Mask National IDs & Cards'}</span>
              </label>
            </div>
          )}

          {/* Notification Action settings */}
          {data.nodeType === 'action_notify' && (
            <div className="space-y-2">
              <div>
                <label className="text-[11px] text-[var(--cds-text-02)] block mb-1">
                  {isAr ? 'قناة الإشعار' : 'Notification Channel'}
                </label>
                <select
                  value={config.channel || 'system_toast'}
                  onChange={(e) => handleConfigChange('channel', e.target.value)}
                  className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#0f62fe]"
                >
                  <option value="system_toast">{isAr ? 'إشعار النظام الفوري (In-App Toast)' : 'In-App Toast Notification'}</option>
                  <option value="audit_log">{isAr ? 'سجل التدقيق الأمني (Audit Log)' : 'Security Audit Log'}</option>
                  <option value="webhook">{isAr ? 'Webhook خارجي (Slack / Teams)' : 'External Webhook (Slack/Teams)'}</option>
                </select>
              </div>
            </div>
          )}

          {/* Export Dataset settings */}
          {data.nodeType === 'action_export_dataset' && (
            <div>
              <label className="text-[11px] text-[var(--cds-text-02)] block mb-1">
                {isAr ? 'اللاحقة المضافة لاسم الجدول' : 'Output Name Suffix'}
              </label>
              <input
                type="text"
                value={config.suffix || '_Auto_Cleaned'}
                onChange={(e) => handleConfigChange('suffix', e.target.value)}
                className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#0f62fe]"
              />
            </div>
          )}
        </div>

        {/* Last Output Inspection */}
        {data.lastOutput && (
          <div className="p-3 bg-[var(--cds-layer-02)] rounded-lg border border-[#24a148]/30 space-y-2">
            <h4 className="font-bold text-[#42be65] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {isAr ? 'آخر نتيجة معالجة' : 'Last Execution Output'}
            </h4>
            <pre className="text-[10px] font-mono text-[var(--cds-text-02)] bg-[var(--cds-layer-01)] p-2 rounded-lg max-h-32 overflow-y-auto whitespace-pre-wrap">
              {typeof data.lastOutput === 'string' ? data.lastOutput : JSON.stringify(data.lastOutput, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] flex items-center justify-between gap-2">
        <button
          onClick={() => onDeleteNode(node.id)}
          className="px-3 py-2 bg-[#da1e28]/20 hover:bg-[#da1e28]/30 text-[#fa4d56] border border-[#da1e28]/40 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>{isAr ? 'حذف العقدة' : 'Delete'}</span>
        </button>

        <button
          onClick={() => onTestNode(node)}
          disabled={isTesting}
          className="px-4 py-2 bg-[#0f62fe] hover:bg-[#0353e9] text-white rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Play className="w-3.5 h-3.5" />
          <span>{isTesting ? (isAr ? 'جاري الفحص...' : 'Testing...') : (isAr ? 'اختبار هذه العقدة' : 'Test Node')}</span>
        </button>
      </div>
    </div>
  );
};
