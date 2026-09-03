import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { 
  Bot, 
  Database, 
  Clock, 
  Webhook, 
  ShieldAlert, 
  Sparkles, 
  Filter, 
  Calculator, 
  Wand2, 
  Lock, 
  Bell, 
  FileSpreadsheet, 
  LayoutDashboard, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  GitBranch, 
  Settings2,
  Trash2,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';
import { WorkflowNodeData, WorkflowNodeCategory } from './types';

const CATEGORY_STYLES: Record<WorkflowNodeCategory, { border: string; bg: string; badgeBg: string; text: string; dot: string }> = {
  trigger: {
    border: 'border-[#0f62fe]',
    bg: 'bg-[#161616]',
    badgeBg: 'bg-[#0f62fe]/15 text-[#78a9ff] border-[#0f62fe]/30',
    text: 'text-[#78a9ff]',
    dot: 'bg-[#0f62fe]'
  },
  ai: {
    border: 'border-[#8a3ffc]',
    bg: 'bg-[#161616]',
    badgeBg: 'bg-[#8a3ffc]/15 text-[#be95ff] border-[#8a3ffc]/30',
    text: 'text-[#be95ff]',
    dot: 'bg-[#8a3ffc]'
  },
  logic: {
    border: 'border-[#009d9a]',
    bg: 'bg-[#161616]',
    badgeBg: 'bg-[#009d9a]/15 text-[#08bdba] border-[#009d9a]/30',
    text: 'text-[#08bdba]',
    dot: 'bg-[#009d9a]'
  },
  action: {
    border: 'border-[#24a148]',
    bg: 'bg-[#161616]',
    badgeBg: 'bg-[#24a148]/15 text-[#42be65] border-[#24a148]/30',
    text: 'text-[#42be65]',
    dot: 'bg-[#24a148]'
  }
};

const getNodeIcon = (nodeType: string) => {
  switch (nodeType) {
    case 'trigger_dataset': return <Database className="w-4 h-4 text-[#78a9ff]" />;
    case 'trigger_schedule': return <Clock className="w-4 h-4 text-[#78a9ff]" />;
    case 'trigger_webhook': return <Webhook className="w-4 h-4 text-[#78a9ff]" />;
    case 'trigger_quality': return <ShieldAlert className="w-4 h-4 text-[#78a9ff]" />;
    
    case 'ai_profiler': return <ShieldAlert className="w-4 h-4 text-[#be95ff]" />;
    case 'ai_cleaner': return <Wand2 className="w-4 h-4 text-[#be95ff]" />;
    case 'ai_enricher': return <Sparkles className="w-4 h-4 text-[#be95ff]" />;
    case 'ai_summarizer': return <Bot className="w-4 h-4 text-[#be95ff]" />;
    case 'ai_sql_transform': return <Sparkles className="w-4 h-4 text-[#be95ff]" />;
    case 'ai_forecast': return <TrendingUp className="w-4 h-4 text-[#be95ff]" />;
    case 'privacy_masker': return <Lock className="w-4 h-4 text-[#009d9a]" />;

    case 'condition_rule': return <GitBranch className="w-4 h-4 text-[#08bdba]" />;
    case 'aggregation_kpi': return <Calculator className="w-4 h-4 text-[#08bdba]" />;
    case 'filter_transform': return <Filter className="w-4 h-4 text-[#08bdba]" />;

    case 'action_notify': return <Bell className="w-4 h-4 text-[#42be65]" />;
    case 'action_export_dataset': return <FileSpreadsheet className="w-4 h-4 text-[#42be65]" />;
    case 'action_publish_widget': return <LayoutDashboard className="w-4 h-4 text-[#42be65]" />;
    case 'action_generate_report': return <FileText className="w-4 h-4 text-[#42be65]" />;

    default: return <Bot className="w-4 h-4 text-[#be95ff]" />;
  }
};

export const WorkflowCustomNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as WorkflowNodeData;
  const isArabic = document.documentElement.dir === 'rtl' || (typeof window !== 'undefined' && localStorage.getItem('carbon_language') === 'ar');

  const category = nodeData?.category || 'ai';
  const theme = CATEGORY_STYLES[category] || CATEGORY_STYLES.ai;
  const isCondition = nodeData?.nodeType === 'condition_rule';
  const isTrigger = category === 'trigger';

  const status = nodeData?.status || 'idle';

  return (
    <div
      id={`workflow-node-${id}`}
      className={`relative min-w-[260px] max-w-[320px] rounded-xl border-2 transition-all duration-200 shadow-lg ${
        selected ? 'ring-2 ring-white/80 scale-[1.02] shadow-2xl' : ''
      } ${
        status === 'running'
          ? 'border-[#0f62fe] shadow-[0_0_20px_rgba(15,98,254,0.4)] animate-pulse'
          : status === 'success'
          ? 'border-[#24a148]'
          : status === 'failed'
          ? 'border-[#da1e28]'
          : theme.border
      } ${theme.bg} text-white p-3.5`}
    >
      {/* Target Handle (Input) - not on trigger nodes */}
      {!isTrigger && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 flex flex-col items-center group/handle z-10">
          <Handle
            type="target"
            position={Position.Top}
            className="!w-4.5 !h-4.5 !bg-[#0f62fe] !border-2 !border-white hover:!bg-[#78a9ff] hover:!scale-130 transition-all !cursor-crosshair shadow-[0_0_8px_rgba(15,98,254,0.6)] !static !transform-none"
            title={isArabic ? 'منفذ الاستلام: اسحب رابطاً إلى هنا للتوصيل' : 'Input Port: Drop connection here'}
          />
          <span className="hidden group-hover/handle:block absolute -top-5 text-[9px] font-mono bg-[#161616] text-[#78a9ff] border border-[#0f62fe] px-1.5 py-0.5 rounded shadow whitespace-nowrap">
            {isArabic ? '📥 منفذ إدخال البيانات' : '📥 Input Port'}
          </span>
        </div>
      )}

      {/* Node Header */}
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-[#393939]/70">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-[#262626] border border-[#393939] shrink-0">
            {getNodeIcon(nodeData?.nodeType)}
          </div>
          <div className="min-w-0">
            <span className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border inline-block ${theme.badgeBg}`}>
              {category}
            </span>
          </div>
        </div>

        {/* Execution Status Badge */}
        <div className="shrink-0 flex items-center gap-1.5">
          {status === 'running' && (
            <span className="flex items-center gap-1 text-[11px] font-mono text-[#78a9ff] bg-[#0f62fe]/20 px-2 py-0.5 rounded-full border border-[#0f62fe]/40">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>جاري التنفيذ...</span>
            </span>
          )}
          {status === 'success' && (
            <span className="flex items-center gap-1 text-[11px] font-mono text-[#42be65] bg-[#24a148]/20 px-2 py-0.5 rounded-full border border-[#24a148]/40">
              <CheckCircle2 className="w-3 h-3" />
              <span>{nodeData?.executionTimeMs ? `${nodeData.executionTimeMs}ms` : 'ناجح'}</span>
            </span>
          )}
          {status === 'failed' && (
            <span className="flex items-center gap-1 text-[11px] font-mono text-[#fa4d56] bg-[#da1e28]/20 px-2 py-0.5 rounded-full border border-[#da1e28]/40">
              <XCircle className="w-3 h-3" />
              <span>فشل</span>
            </span>
          )}
          {status === 'idle' && (
            <span className="w-2 h-2 rounded-full bg-[#525252]" title="جاهز للتشغيل" />
          )}
        </div>
      </div>

      {/* Node Title & Description */}
      <div className="space-y-1 mb-2.5">
        <h4 className="text-xs font-bold text-[#f4f4f4] leading-tight truncate">
          {isArabic ? (nodeData?.labelAr || nodeData?.label) : (nodeData?.label || nodeData?.labelAr)}
        </h4>
        <p className="text-[11px] text-[#a8a8a8] line-clamp-2 leading-relaxed">
          {isArabic ? (nodeData?.descriptionAr || nodeData?.description) : (nodeData?.description || nodeData?.descriptionAr)}
        </p>
      </div>

      {/* Configuration Summary Pill */}
      {nodeData?.config && Object.keys(nodeData.config).length > 0 && (
        <div className="bg-[#262626]/80 rounded px-2 py-1 text-[10px] font-mono text-[#c6c6c6] border border-[#393939] flex items-center justify-between gap-1 mb-1 truncate">
          <span className="text-[#8d8d8d]">{isArabic ? 'الإعداد:' : 'Config:'}</span>
          <span className="truncate text-white">
            {nodeData.config.model || 
             nodeData.config.threshold !== undefined ? `Threshold: ${nodeData.config.threshold}` :
             nodeData.config.frequency || 
             nodeData.config.cleanStrategy || 
             nodeData.config.channel || 
             'مخصص'}
          </span>
        </div>
      )}

      {/* Error Message if Failed */}
      {status === 'failed' && nodeData?.errorMessage && (
        <div className="mt-2 p-1.5 rounded bg-[#da1e28]/15 border border-[#da1e28]/40 text-[10px] text-[#fa4d56] flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span className="truncate">{nodeData.errorMessage}</span>
        </div>
      )}

      {/* Output preview if completed */}
      {status === 'success' && nodeData?.lastOutput && (
        <div className="mt-2 p-1.5 rounded bg-[#24a148]/10 border border-[#24a148]/30 text-[10px] font-mono text-[#42be65] flex items-center justify-between">
          <span className="truncate">
            {typeof nodeData.lastOutput === 'string' ? nodeData.lastOutput : 'تمت المعالجة بنجاح'}
          </span>
          <CheckCircle2 className="w-3 h-3 shrink-0 text-[#24a148]" />
        </div>
      )}

      {/* Source Handles (Outputs) */}
      {isCondition ? (
        <div className="relative mt-3 pt-2.5 border-t border-[#393939] flex justify-between text-[9px] font-mono">
          <div className="flex items-center gap-1 text-[#42be65]">
            <span className="w-2 h-2 rounded-full bg-[#24a148] animate-pulse" />
            <span>ناجح / Pass</span>
          </div>
          <div className="flex items-center gap-1 text-[#fa4d56]">
            <span>فشل / Fail</span>
            <span className="w-2 h-2 rounded-full bg-[#da1e28] animate-pulse" />
          </div>

          <Handle
            id="pass"
            type="source"
            position={Position.Bottom}
            className="!w-4.5 !h-4.5 !bg-[#24a148] !border-2 !border-white hover:!scale-135 transition-all !cursor-crosshair shadow-[0_0_8px_rgba(36,161,72,0.7)] !-bottom-2.5 !left-[25%]"
            title={isArabic ? 'مخرج مسار النجاح: اسحب من هنا للتوصيل' : 'Pass Output: Drag to connect'}
          />
          <Handle
            id="fail"
            type="source"
            position={Position.Bottom}
            className="!w-4.5 !h-4.5 !bg-[#da1e28] !border-2 !border-white hover:!scale-135 transition-all !cursor-crosshair shadow-[0_0_8px_rgba(218,30,40,0.7)] !-bottom-2.5 !left-[75%]"
            title={isArabic ? 'مخرج مسار الفشل: اسحب من هنا للتوصيل' : 'Fail Output: Drag to connect'}
          />
        </div>
      ) : (
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center group/handle z-10">
          <Handle
            type="source"
            position={Position.Bottom}
            className="!w-4.5 !h-4.5 !bg-[#24a148] !border-2 !border-white hover:!bg-[#42be65] hover:!scale-135 transition-all !cursor-crosshair shadow-[0_0_8px_rgba(36,161,72,0.7)] !static !transform-none"
            title={isArabic ? 'منفذ الإخراج: اسحب هذا المخرج إلى العقدة التالية' : 'Output Port: Drag to next node'}
          />
          <span className="hidden group-hover/handle:block absolute -bottom-6 text-[9px] font-mono bg-[#161616] text-[#42be65] border border-[#24a148] px-1.5 py-0.5 rounded shadow whitespace-nowrap z-20">
            {isArabic ? '📤 اسحب هذا المنفذ للتوصيل' : '📤 Drag to Connect'}
          </span>
        </div>
      )}
    </div>
  );
};
