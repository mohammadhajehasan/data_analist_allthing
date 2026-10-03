import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { 
  ReactFlow, 
  Controls, 
  Background, 
  applyNodeChanges, 
  applyEdgeChanges,
  addEdge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  BackgroundVariant,
  MiniMap,
  Panel,
  Connection,
  Edge,
  ReactFlowProvider,
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useApp } from '../../context/AppContext';
import { 
  Workflow, 
  Play, 
  Save, 
  Plus, 
  Database, 
  Bot, 
  Bell, 
  ShieldAlert, 
  Clock, 
  Sparkles, 
  Calculator, 
  Filter, 
  Wand2, 
  Lock, 
  FileSpreadsheet, 
  LayoutDashboard, 
  FileText, 
  GitBranch, 
  Terminal, 
  CheckCircle2, 
  AlertCircle, 
  RotateCcw, 
  Trash2, 
  Download, 
  Upload, 
  Zap, 
  Activity, 
  Search,
  ChevronDown,
  Layers,
  HelpCircle,
  TrendingUp,
  Copy,
  Check,
  Move,
  BookOpen,
  ArrowRight,
  FilterX,
  BarChart3,
  History
} from 'lucide-react';
import { 
  CustomWorkflowNode, 
  WorkflowDefinition, 
  WorkflowExecutionLog, 
  ExecutionRunResult, 
  WorkflowNodeType,
  WorkflowNodeCategory,
  WorkflowVersion
} from './types';
import { WORKFLOW_TEMPLATES, WorkflowTemplateItem } from './WorkflowTemplates';
import { WorkflowCustomNode } from './WorkflowCustomNode';
import { WorkflowCustomEdge } from './WorkflowCustomEdge';
import { WorkflowConnectionLine } from './WorkflowConnectionLine';
import { OutputPanel } from './OutputPanel';
import { NodeConfigDrawer } from './NodeConfigDrawer';
import { WorkflowTemplateModal } from './WorkflowTemplateModal';
import { WorkflowGuideModal } from './WorkflowGuideModal';
import { WorkflowVersionHistoryDrawer } from './WorkflowVersionHistoryDrawer';
import { executeWorkflowPipeline } from './workflowExecutor';
import { checkAiAccess, aiAccessBlockMessage, fetchServerAiProviders } from '../../utils/aiAccessGuard';

const STORAGE_KEY = 'carbon_ai_workflows_v3';
const VERSIONS_STORAGE_KEY = 'carbon_workflow_versions_v1';

const getInitialVersions = (): WorkflowVersion[] => {
  return WORKFLOW_TEMPLATES.map((tpl, idx) => ({
    id: `ver_init_${tpl.id}`,
    workflowId: tpl.id,
    versionNumber: 1,
    name: tpl.nameAr ? `${tpl.nameAr} - نقطة البداية v1.0` : `${tpl.name} - Baseline v1.0`,
    nameAr: `${tpl.nameAr || tpl.name} - الإصدار التأسيسي`,
    description: tpl.descriptionAr || tpl.description,
    descriptionAr: tpl.descriptionAr || tpl.description,
    timestamp: tpl.createdAt || new Date(Date.now() - 3600000 * (idx + 1)).toISOString(),
    nodes: tpl.nodes,
    edges: tpl.edges,
    nodeCount: tpl.nodes.length,
    edgeCount: tpl.edges.length,
    createdReason: 'template_init',
    tag: 'stable',
  }));
};

interface PaletteItem {
  nodeType: WorkflowNodeType;
  category: WorkflowNodeCategory;
  label: string;
  labelAr: string;
  desc: string;
  descAr: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultConfig?: Record<string, any>;
}

const PALETTE_ITEMS: PaletteItem[] = [
  // 1. مصادر البيانات والمشغلات (Triggers & Sources)
  {
    nodeType: 'trigger_dataset',
    category: 'trigger',
    label: 'Dataset Source & Ingestion',
    labelAr: 'مصدر البيانات واستقبال الجداول',
    desc: 'Fires on dataset upload or active selection',
    descAr: 'يعمل عند رفع أو اختيار أي جدول بيانات',
    icon: Database,
    defaultConfig: { triggerMode: 'on_upload_or_edit' }
  },
  {
    nodeType: 'trigger_schedule',
    category: 'trigger',
    label: 'Scheduled Cron Trigger',
    labelAr: 'مشغّل دوري مجدول (ساعي / يومي / شهري)',
    desc: 'Runs on time-based intervals automatically',
    descAr: 'يعمل وفق جدول زمني محدد تلقائياً',
    icon: Clock,
    defaultConfig: { frequency: 'daily', time: '08:00' }
  },
  {
    nodeType: 'trigger_quality',
    category: 'trigger',
    label: 'Quality Threshold Trigger',
    labelAr: 'مشغّل هبوط الجودة والإنذار',
    desc: 'Fires when dataset health drops below limit',
    descAr: 'ينطلق عند انخفاض الجودة عن الحد المسموح',
    icon: ShieldAlert,
    defaultConfig: { minScore: 80 }
  },

  // 2. عوامل التصفية والشروط (Filters & Logic)
  {
    nodeType: 'filter_transform',
    category: 'logic',
    label: 'Filter & Subset Records',
    labelAr: 'عامل تصفية وتجزئة السجلات',
    desc: 'Filters rows by specific column criteria',
    descAr: 'يصفي السجلات وفق شروط ومعايير محددة',
    icon: Filter,
    defaultConfig: { field: 'status', operator: 'not_equals', value: 'cancelled' }
  },
  {
    nodeType: 'condition_rule',
    category: 'logic',
    label: 'Quality Gate (If / Else)',
    labelAr: 'شرط جودة وتحقق (بوابة If / Else)',
    desc: 'Branches pipeline to Pass / Fail pathways',
    descAr: 'يفرع المسار بحسب استيفاء معايير الجودة',
    icon: GitBranch,
    defaultConfig: { field: 'overallScore', operator: 'gte', threshold: 80 }
  },
  {
    nodeType: 'aggregation_kpi',
    category: 'logic',
    label: 'KPI & Math Aggregator',
    labelAr: 'حساب مؤشرات الأداء والمجاميع',
    desc: 'Computes metrics, sums, and averages',
    descAr: 'يحسب المجاميع والمتوسطات الإحصائية',
    icon: Calculator,
    defaultConfig: {}
  },

  // 3. تحويل وتنقية البيانات (Data Transform)
  {
    nodeType: 'ai_cleaner',
    category: 'ai',
    label: 'Auto Clean & Impute Nulls',
    labelAr: 'التنظيف الذاتي والتعويض الذكي',
    desc: 'Smart imputation and duplicate row removal',
    descAr: 'يعالج القيم الفارغة ويزيل السجلات المكررة',
    icon: Wand2,
    defaultConfig: { cleanStrategy: 'smart_impute', removeDuplicates: true }
  },
  {
    nodeType: 'privacy_masker',
    category: 'ai',
    label: 'Zero-Egress Privacy Masker',
    labelAr: 'حاجب البيانات الحساسة (Zero-Egress)',
    desc: 'Masks emails, IDs, and phone numbers locally',
    descAr: 'يحجب أرقام الهويات والبريد محلياً دون إرسال',
    icon: Lock,
    defaultConfig: { maskEmails: true, maskPhoneNumbers: true, maskNationalIds: true }
  },

  // 4. نماذج الذكاء الاصطناعي (AI Models & Insights)
  {
    nodeType: 'ai_profiler',
    category: 'ai',
    label: 'AI Quality & Outlier Scanner',
    labelAr: 'فاحص الجودة واكتشاف الشذوذ الذكي',
    desc: 'Scans null percentages and anomaly spikes',
    descAr: 'يفحص النواقص والقيم الشاذة إحصائياً',
    icon: Bot,
    defaultConfig: { model: 'gemini-3.8-flash', sensitivity: 'medium', detectOutliers: true }
  },
  {
    nodeType: 'ai_summarizer',
    category: 'ai',
    label: 'Gemini Executive Storyteller',
    labelAr: 'سارد الرؤى والملخص التنفيذي الذكي',
    desc: 'Translates data metrics into narrative insights',
    descAr: 'يحول الأرقام إلى سرد استراتيجي وتوصيات ذكية',
    icon: Sparkles,
    defaultConfig: { model: 'gemini-3.8-flash', tone: 'strategic' }
  },
  {
    nodeType: 'ai_forecast',
    category: 'ai',
    label: 'AI Predictive Trend Forecaster',
    labelAr: 'نموذج التنبؤ الذكي وتحليل الاتجاهات',
    desc: 'Projects forward regression growth estimates',
    descAr: 'يقدر خط الاتجاه العام وتوقعات النمو القادمة',
    icon: TrendingUp,
    defaultConfig: { periods: 3, confidence: 95 }
  },

  // 5. الإجراءات والمخرجات (Actions & Reports)
  {
    nodeType: 'action_export_dataset',
    category: 'action',
    label: 'Save & Export Cleaned Dataset',
    labelAr: 'حفظ وتصدير الجدول المعالج',
    desc: 'Stores new sanitized dataset in repository',
    descAr: 'يحفظ جدولاً جديداً في قائمة مجموعات البيانات',
    icon: FileSpreadsheet,
    defaultConfig: { suffix: '_Auto_Pipeline', tag: 'Automated-Workflow' }
  },
  {
    nodeType: 'action_generate_report',
    category: 'action',
    label: 'Publish Executive Brief Report',
    labelAr: 'نشر تقرير تنفيذي تفاعلي',
    desc: 'Publishes interactive report with charts',
    descAr: 'ينشر تقريراً تفاعلياً شاملاً في قسم التقارير',
    icon: FileText,
    defaultConfig: { autoPublish: true }
  },
  {
    nodeType: 'action_notify',
    category: 'action',
    label: 'Send Alert & Audit Notification',
    labelAr: 'إرسال إشعار وتوثيق التدقيق',
    desc: 'Dispatches in-app alerts and security logs',
    descAr: 'يرسل إشعاراً فورياً ويوثق العملية في التدقيق',
    icon: Bell,
    defaultConfig: { channel: 'system_toast', priority: 'high' }
  }
];

const WorkflowStudioContent: React.FC = () => {
  const { 
    language, 
    datasets, 
    activeDataset, 
    addDataset, 
    saveReport, 
    toast, 
    addAuditLog,
    aiSettings,
    user,
    workspace,
    setActiveTab
  } = useApp();
  const isAr = language === 'ar';
  const activeProviderConf = aiSettings.providers[aiSettings.activeProvider];
  const aiProviderConfig = {
    provider: aiSettings.activeProvider,
    model: aiSettings.activeModel,
    endpointUrl: activeProviderConf?.endpointUrl,
    apiKey: activeProviderConf?.apiKey,
  };

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  // Load workflows from storage or use templates
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return WORKFLOW_TEMPLATES;
  });

  const [activeWorkflowId, setActiveWorkflowId] = useState<string>(
    workflows[0]?.id || WORKFLOW_TEMPLATES[0].id
  );

  const activeWorkflow = useMemo(
    () => workflows.find((w) => w.id === activeWorkflowId) || workflows[0] || WORKFLOW_TEMPLATES[0],
    [workflows, activeWorkflowId]
  );

  const [nodes, setNodes] = useState<CustomWorkflowNode[]>(activeWorkflow.nodes);
  const [edges, setEdges] = useState<Edge[]>(activeWorkflow.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isTestingNode, setIsTestingNode] = useState<boolean>(false);
  const [logs, setLogs] = useState<WorkflowExecutionLog[]>([]);
  const [isLogsOpen, setIsLogsOpen] = useState<boolean>(false);
  const [isOutputPanelOpen, setIsOutputPanelOpen] = useState<boolean>(true);
  const [activeLogTab, setActiveLogTab] = useState<'logs' | 'results'>('logs');
  const [logFilterLevel, setLogFilterLevel] = useState<string>('all');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');
  const [lastRunResult, setLastRunResult] = useState<ExecutionRunResult | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState<boolean>(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState<boolean>(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState<boolean>(false);
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);

  // Workflow version history state
  const [versions, setVersions] = useState<WorkflowVersion[]>(() => {
    try {
      const saved = localStorage.getItem(VERSIONS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return getInitialVersions();
  });

  // Persist versions to localStorage
  const saveVersionsToStorage = (updatedVersions: WorkflowVersion[]) => {
    setVersions(updatedVersions);
    try {
      localStorage.setItem(VERSIONS_STORAGE_KEY, JSON.stringify(updatedVersions));
    } catch (e) {}
  };

  // Sync canvas nodes/edges when switching active workflow
  useEffect(() => {
    if (activeWorkflow) {
      setNodes(activeWorkflow.nodes);
      setEdges(
        activeWorkflow.edges.map((e) => ({
          ...e,
          type: e.type || 'workflowCustomEdge',
        }))
      );
      setSelectedNodeId(null);
    }
  }, [activeWorkflowId]);

  // Persist workflows to localStorage
  const saveCurrentWorkflows = (updatedWorkflows: WorkflowDefinition[]) => {
    setWorkflows(updatedWorkflows);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedWorkflows));
    } catch (e) {}
  };

  const nodeTypes = useMemo(() => ({ workflowCustom: WorkflowCustomNode }), []);
  const edgeTypes = useMemo(() => ({ workflowCustomEdge: WorkflowCustomEdge }), []);

  const onNodesChange: OnNodesChange<CustomWorkflowNode> = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      // Validate connection to prevent linking to same node
      if (params.source === params.target) {
        toast.warning(
          isAr ? 'تنبيه الربط' : 'Connection Warning',
          isAr ? 'لا يمكن ربط العقدة بنفسها مباشرة.' : 'Cannot connect a node to itself.'
        );
        return;
      }

      const isPassBranch = params.sourceHandle === 'pass';
      const isFailBranch = params.sourceHandle === 'fail';

      const edgeColor = isPassBranch ? '#24a148' : isFailBranch ? '#da1e28' : '#0f62fe';
      const edgeLabel = isPassBranch ? (isAr ? 'ناجح (Pass)' : 'Pass') : isFailBranch ? (isAr ? 'فشل (Fail)' : 'Fail') : undefined;

      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'workflowCustomEdge',
            animated: true,
            label: edgeLabel,
            style: { stroke: edgeColor, strokeWidth: 2.5 },
          } as Edge,
          eds
        )
      );

      toast.info(
        isAr ? 'تم ربط العقدتين' : 'Nodes Connected',
        isAr ? 'تم إنشاء مسار تدفق بيانات مرئي جديد بين العقدتين.' : 'New visual connection established between nodes.'
      );
    },
    [isAr, toast]
  );

  // Manual / 1-Click Connect handler
  const handleConnectNodes = useCallback(
    (sourceId: string, targetId: string, sourceHandle?: string) => {
      if (sourceId === targetId) {
        toast.warning(
          isAr ? 'تنبيه الربط' : 'Connection Warning',
          isAr ? 'لا يمكن ربط العقدة بنفسها.' : 'Cannot connect a node to itself.'
        );
        return;
      }

      const isPass = sourceHandle === 'pass';
      const isFail = sourceHandle === 'fail';
      const edgeColor = isPass ? '#24a148' : isFail ? '#da1e28' : '#0f62fe';
      const edgeLabel = isPass ? (isAr ? 'ناجح (Pass)' : 'Pass') : isFail ? (isAr ? 'فشل (Fail)' : 'Fail') : undefined;

      const newEdge: Edge = {
        id: `edge-${sourceId}-${targetId}-${sourceHandle || 'def'}-${Date.now()}`,
        source: sourceId,
        target: targetId,
        sourceHandle,
        type: 'workflowCustomEdge',
        animated: true,
        label: edgeLabel,
        style: { stroke: edgeColor, strokeWidth: 2.5 },
      };

      setEdges((eds) => [
        ...eds.filter((e) => !(e.source === sourceId && e.target === targetId && e.sourceHandle === sourceHandle)),
        newEdge,
      ]);

      toast.success(
        isAr ? 'تم ربط العقدتين بنجاح' : 'Nodes Connected',
        isAr ? 'تم إنشاء مسار الربط بين العقدتين.' : 'Connection created successfully.'
      );
    },
    [isAr, toast]
  );

  // Delete Edge handler
  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      toast.info(isAr ? 'تم فصل مسار التوصيل' : 'Connection Removed');
    },
    [isAr, toast]
  );

  // Drag & Drop Handlers from Palette onto Canvas
  const onDragStart = (event: React.DragEvent, item: PaletteItem) => {
    event.dataTransfer.setData('application/reactflow-node', JSON.stringify(item));
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const dataStr = event.dataTransfer.getData('application/reactflow-node');
      if (!dataStr) return;

      try {
        const item: PaletteItem = JSON.parse(dataStr);
        let position = { x: 250, y: 150 };

        if (screenToFlowPosition) {
          position = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });
        } else if (reactFlowWrapper.current) {
          const bounds = reactFlowWrapper.current.getBoundingClientRect();
          position = {
            x: event.clientX - bounds.left - 120,
            y: event.clientY - bounds.top - 40,
          };
        }

        const id = `node-${item.nodeType}-${Date.now()}`;
        const newNode: CustomWorkflowNode = {
          id,
          type: 'workflowCustom',
          position,
          data: {
            nodeType: item.nodeType,
            label: item.label,
            labelAr: item.labelAr,
            description: item.desc,
            descriptionAr: item.descAr,
            category: item.category,
            config: { ...item.defaultConfig },
            status: 'idle',
          },
        };

        setNodes((nds) => [...nds, newNode]);
        setSelectedNodeId(id);
        toast.success(
          isAr ? 'تمت إضافة العقدة بالسحب والإفلات' : 'Node Added (Drag & Drop)',
          isAr ? `تم إدراج [${item.labelAr}] في مساحة العمل.` : `Added ${item.label} to canvas.`
        );
      } catch (e) {}
    },
    [screenToFlowPosition, isAr, toast]
  );

  // Click to Add node alternative
  const handleAddNode = (item: PaletteItem) => {
    const id = `node-${item.nodeType}-${Date.now()}`;
    const xPos = 200 + Math.random() * 200;
    const yPos = 100 + Math.random() * 200;

    const newNode: CustomWorkflowNode = {
      id,
      type: 'workflowCustom',
      position: { x: xPos, y: yPos },
      data: {
        nodeType: item.nodeType,
        label: item.label,
        labelAr: item.labelAr,
        description: item.desc,
        descriptionAr: item.descAr,
        category: item.category,
        config: { ...item.defaultConfig },
        status: 'idle',
      },
    };

    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(id);
    toast.info(
      isAr ? 'تمت إضافة العقدة' : 'Node Added',
      isAr ? `تمت إضافة [${item.labelAr}] إلى مساحة العمل.` : `Added ${item.label} to canvas.`
    );
  };

  // Update node data from drawer
  const handleUpdateNodeData = (nodeId: string, updates: Record<string, any>) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === nodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              ...updates,
            },
          };
        }
        return n;
      })
    );
  };

  // Delete node
  const handleDeleteNode = (nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    toast.info(isAr ? 'تم حذف العقدة والروابط التابعة لها' : 'Node Deleted');
  };

  // Save current workflow and auto-create a version checkpoint
  const handleSaveWorkflow = () => {
    const updated = workflows.map((w) => {
      if (w.id === activeWorkflow.id) {
        return {
          ...w,
          nodes,
          edges,
          updatedAt: new Date().toISOString(),
        };
      }
      return w;
    });

    saveCurrentWorkflows(updated);

    // Also record a snapshot in version history
    const currentWfVersions = versions.filter((v) => v.workflowId === activeWorkflow.id);
    const nextVer = currentWfVersions.length > 0
      ? Math.max(...currentWfVersions.map((v) => v.versionNumber || 1)) + 1
      : 1;

    const autoSnapshot: WorkflowVersion = {
      id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      workflowId: activeWorkflow.id,
      versionNumber: nextVer,
      name: isAr ? `نسخة v${nextVer}.0 - حفظ يدوي` : `v${nextVer}.0 - Manual Save`,
      description: isAr ? `تم الحفظ في ${new Date().toLocaleTimeString('ar-SA')}` : `Saved at ${new Date().toLocaleTimeString()}`,
      timestamp: new Date().toISOString(),
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      createdReason: 'manual_save',
      tag: 'checkpoint',
    };

    saveVersionsToStorage([autoSnapshot, ...versions]);

    addAuditLog({
      userId: user.id,
      userName: user.name,
      workspaceId: workspace.id,
      action: 'update',
      resourceType: 'assistant_tool',
      resourceId: activeWorkflow.id,
      status: 'SUCCESS',
      durationMs: 100,
      payloadSummary: isAr 
        ? `تم حفظ سير العمل وتوثيق نقطة الإصدار v${nextVer}.0 (${activeWorkflow.nameAr || activeWorkflow.name}).`
        : `Saved workflow "${activeWorkflow.name}" and created version snapshot v${nextVer}.0.`,
      riskLevel: 'LOW',
    });

    toast.success(
      isAr ? 'تم حفظ سير العمل وتوثيق النسخة' : 'Workflow & Version Saved',
      isAr ? `تم حفظ "${activeWorkflow.nameAr || activeWorkflow.name}" وتسجيل نقطة الإصدار v${nextVer}.0.` : `Workflow "${activeWorkflow.name}" saved with checkpoint v${nextVer}.0.`
    );
  };

  // Custom named version snapshot creation from drawer
  const handleSaveVersionSnapshot = (name: string, description?: string, tag: string = 'checkpoint') => {
    const currentWfVersions = versions.filter((v) => v.workflowId === activeWorkflow.id);
    const nextVer = currentWfVersions.length > 0
      ? Math.max(...currentWfVersions.map((v) => v.versionNumber || 1)) + 1
      : 1;

    const newVersion: WorkflowVersion = {
      id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      workflowId: activeWorkflow.id,
      versionNumber: nextVer,
      name,
      description,
      timestamp: new Date().toISOString(),
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      createdReason: 'manual_save',
      tag,
    };

    const updated = [newVersion, ...versions];
    saveVersionsToStorage(updated);

    addAuditLog({
      userId: user.id,
      userName: user.name,
      workspaceId: workspace.id,
      action: 'create',
      resourceType: 'assistant_tool',
      resourceId: activeWorkflow.id,
      status: 'SUCCESS',
      durationMs: 100,
      payloadSummary: isAr 
        ? `تم إنشاء وتوثيق نسخة سير العمل (${name}) - الإصدار v${nextVer}.0.`
        : `Created workflow snapshot "${name}" (v${nextVer}.0).`,
      riskLevel: 'LOW',
    });

    toast.success(
      isAr ? 'تم حفظ نقطة النسخة بنجاح' : 'Version Snapshot Saved',
      isAr ? `تم تسجيل "${name}" في سجل النسخ والإصدارات.` : `Version "${name}" recorded in history.`
    );
  };

  // Revert / Restore workflow state to a previous version
  const handleRevertVersion = (version: WorkflowVersion) => {
    const restoredNodes = JSON.parse(JSON.stringify(version.nodes));
    const restoredEdges = JSON.parse(JSON.stringify(version.edges)).map((e: any) => ({
      ...e,
      type: e.type || 'workflowCustomEdge',
    }));

    setNodes(restoredNodes);
    setEdges(restoredEdges);
    setSelectedNodeId(null);

    // Also update current active workflow in memory & storage
    const updatedWorkflows = workflows.map((w) => {
      if (w.id === activeWorkflow.id) {
        return {
          ...w,
          nodes: restoredNodes,
          edges: restoredEdges,
          updatedAt: new Date().toISOString(),
        };
      }
      return w;
    });
    saveCurrentWorkflows(updatedWorkflows);

    addAuditLog({
      userId: user.id,
      userName: user.name,
      workspaceId: workspace.id,
      action: 'update',
      resourceType: 'assistant_tool',
      resourceId: activeWorkflow.id,
      status: 'SUCCESS',
      durationMs: 100,
      payloadSummary: isAr
        ? `تمت استعادة سير العمل إلى النسخة (${version.name} - v${version.versionNumber}).`
        : `Reverted workflow to version "${version.name}" (v${version.versionNumber}).`,
      riskLevel: 'LOW',
    });

    toast.success(
      isAr ? 'تمت استعادة النسخة بنجاح' : 'Version Restored',
      isAr ? `تم تطبيق المخطط من "${version.name}" (${version.nodeCount} عقدة).` : `Restored pipeline state from "${version.name}".`
    );
  };

  // Delete version snapshot
  const handleDeleteVersion = (versionId: string) => {
    const updated = versions.filter((v) => v.id !== versionId);
    saveVersionsToStorage(updated);
    toast.info(isAr ? 'تم حذف النسخة من السجل' : 'Version Deleted');
  };

  // Update version metadata
  const handleUpdateVersion = (versionId: string, updates: Partial<WorkflowVersion>) => {
    const updated = versions.map((v) => (v.id === versionId ? { ...v, ...updates } : v));
    saveVersionsToStorage(updated);
    toast.success(isAr ? 'تم تحديث معلومات النسخة' : 'Version Updated');
  };

  // Toggle Active Automation Deployment
  const handleToggleActive = () => {
    const nextActive = !activeWorkflow.isActive;
    const updated = workflows.map((w) => {
      if (w.id === activeWorkflow.id) {
        return {
          ...w,
          isActive: nextActive,
          updatedAt: new Date().toISOString(),
        };
      }
      return w;
    });

    saveCurrentWorkflows(updated);
    if (nextActive) {
      toast.success(
        isAr ? 'تم تفعيل الأتمتة التلقائية' : 'Automation Activated',
        isAr ? 'السلسلة تعمل الآن في الخلفية وتراقب تدفق البيانات فورياً.' : 'Workflow is now actively monitoring system events.'
      );
    } else {
      toast.info(
        isAr ? 'تم إيقاف الأتمتة مؤقتاً' : 'Automation Paused',
        isAr ? 'تم إيقاف تشغيل السلسلة في الخلفية.' : 'Workflow paused.'
      );
    }
  };

  // Select Template from Modal
  const handleSelectTemplate = (template: WorkflowTemplateItem) => {
    // Check if workflow exists in list, else add it
    const existingIndex = workflows.findIndex((w) => w.id === template.id);
    if (existingIndex === -1) {
      const updated = [template, ...workflows];
      saveCurrentWorkflows(updated);
    }
    setActiveWorkflowId(template.id);
    setNodes(template.nodes);
    setEdges(template.edges.map((e) => ({ ...e, type: e.type || 'workflowCustomEdge' })));
    setSelectedNodeId(null);
    toast.success(
      isAr ? 'تم تحميل القالب بنجاح' : 'Template Loaded',
      isAr ? `تم تطبيق قالب "${template.nameAr}" على مساحة العمل.` : `Loaded "${template.name}".`
    );
  };

  // Reset nodes to original template state
  const handleResetWorkflow = () => {
    const template = WORKFLOW_TEMPLATES.find((t) => t.id === activeWorkflow.id);
    if (template) {
      setNodes(template.nodes);
      setEdges(template.edges.map((e) => ({ ...e, type: e.type || 'workflowCustomEdge' })));
      setSelectedNodeId(null);
      toast.info(isAr ? 'تمت استعادة القالب الأصلي' : 'Reset to Template');
    }
  };

  // Run full workflow pipeline
  const handleRunWorkflow = async () => {
    if (isRunning) return;
    // الحرس: خطوات AI في سير العمل تستدعي المزود النشط — تأكد من المفتاح قبل الإطلاق
    const serverProviders = await fetchServerAiProviders();
    const wfAccess = checkAiAccess(aiSettings.activeProvider, activeProviderConf, serverProviders);
    if (!wfAccess.ok && nodes.some(n => String(n.data?.nodeType || '').startsWith('ai_'))) {
      const { title, description } = aiAccessBlockMessage(wfAccess.reason || 'no-key', isAr, activeProviderConf?.nameAr || activeProviderConf?.name || 'المزود النشط');
      toast.warning(title, description);
      setActiveTab('models');
      return;
    }
    setIsRunning(true);
    setIsLogsOpen(true);
    setActiveLogTab('logs');
    setLogs([]);

    // Reset nodes status
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          status: 'idle',
          errorMessage: undefined,
        },
      }))
    );

    try {
      const result = await executeWorkflowPipeline({
        nodes,
        edges,
        activeDataset,
        allDatasets: datasets,
        addDataset,
        saveReport,
        toast,
        addAuditLog,
        aiProviderConfig,
        isAr,
        onNodeStatusChange: (nodeId, status, duration, output, error, outputData) => {
          setNodes((nds) =>
            nds.map((n) => {
              if (n.id === nodeId) {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    status,
                    executionTimeMs: duration,
                    lastOutput: output ?? n.data.lastOutput,
                    errorMessage: error,
                    outputData: outputData ?? n.data.outputData,
                  },
                };
              }
              return n;
            })
          );
        },
        onLog: (logItem) => {
          setLogs((prev) => [...prev, logItem]);
        },
      });

      setLastRunResult(result);

      // Update run count
      const updated = workflows.map((w) => {
        if (w.id === activeWorkflow.id) {
          return {
            ...w,
            runCount: (w.runCount || 0) + 1,
            lastRunAt: new Date().toISOString(),
            lastRunStatus: result.status,
          };
        }
        return w;
      });

      saveCurrentWorkflows(updated);

      if (result.status === 'success') {
        toast.success(
          isAr ? 'اكتمل تنفيذ سير العمل بنجاح' : 'Workflow Execution Completed',
          isAr
            ? `تم تنفيذ ${result.nodesExecuted} خطوة في ${result.totalDurationMs}ms.`
            : `Executed ${result.nodesExecuted} nodes in ${result.totalDurationMs}ms.`
        );
      } else {
        toast.error(
          isAr ? 'تعثر تنفيذ بعض خطوات سير العمل' : 'Workflow Step Failed',
          isAr ? 'راجع سجل التشغيل لمعرفة تفاصيل الخطأ وتتبعه.' : 'Check execution logs for error details.'
        );
      }
    } catch (err: any) {
      toast.error(isAr ? 'خطأ في المحرك' : 'Execution Error', err?.message);
    } finally {
      setIsRunning(false);
    }
  };

  // Test single node
  const handleTestSingleNode = async (node: CustomWorkflowNode) => {
    setIsTestingNode(true);
    handleUpdateNodeData(node.id, { status: 'running' });
    setIsLogsOpen(true);
    setActiveLogTab('logs');

    try {
      const result = await executeWorkflowPipeline({
        nodes: [node],
        edges: [],
        activeDataset,
        allDatasets: datasets,
        addDataset,
        saveReport,
        toast,
        addAuditLog,
        aiProviderConfig,
        isAr,
        onNodeStatusChange: (nodeId, status, duration, output, error) => {
          handleUpdateNodeData(nodeId, {
            status,
            executionTimeMs: duration,
            lastOutput: output,
            errorMessage: error,
          });
        },
        onLog: (logItem) => {
          setLogs((prev) => [...prev, logItem]);
        },
      });

      setLastRunResult(result);
    } finally {
      setIsTestingNode(false);
    }
  };

  // Copy Logs to Clipboard
  const handleCopyLogs = () => {
    const text = logs.map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.nodeLabel ? `[${l.nodeLabel}] ` : ''}${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
    toast.info(isAr ? 'تم نسخ السجلات إلى الحافظة' : 'Logs Copied to Clipboard');
  };

  // Download Logs as JSON
  const handleDownloadLogs = () => {
    const blob = new Blob([JSON.stringify({ runResult: lastRunResult, logs }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow-execution-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const filteredPalette = useMemo(() => {
    return PALETTE_ITEMS.filter((item) => {
      const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
      const matchSearch =
        searchQuery === '' ||
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.labelAr.includes(searchQuery) ||
        item.descAr.includes(searchQuery);
      return matchCat && matchSearch;
    });
  }, [searchQuery, selectedCategory]);

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      const matchLevel = logFilterLevel === 'all' || l.level === logFilterLevel;
      const matchQuery =
        logSearchQuery === '' ||
        l.message.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
        (l.nodeLabel && l.nodeLabel.toLowerCase().includes(logSearchQuery.toLowerCase()));
      return matchLevel && matchQuery;
    });
  }, [logs, logFilterLevel, logSearchQuery]);

  return (
    <div className="h-full bg-[var(--cds-background)] flex flex-col animate-in fade-in duration-200 overflow-hidden select-none" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Top Studio Header */}
      <div className="bg-[var(--cds-layer-01)] border-b border-[var(--cds-border-subtle)] px-6 py-3.5 shrink-0 flex flex-wrap items-center justify-between gap-4 z-10 shadow-lg relative">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-[#0f62fe]/15 text-[#78a9ff] border border-[#0f62fe]/30">
            <Workflow className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-tight">
                {isAr ? 'استوديو أتمتة سير العمل بالذكاء الاصطناعي' : 'AI Workflow Automation Studio'}
              </h1>
              {/* Active / Paused Indicator Badge */}
              <button
                onClick={handleToggleActive}
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border transition-all cursor-pointer ${
                  activeWorkflow.isActive
                    ? 'bg-[#24a148]/15 text-[#42be65] border-[#24a148]/40 shadow-[0_0_10px_rgba(36,161,72,0.3)]'
                    : 'bg-[var(--cds-border-strong)]/20 text-[var(--cds-text-02)] border-[var(--cds-border-strong)]/40'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${activeWorkflow.isActive ? 'bg-[#24a148] animate-ping' : 'bg-[#a8a8a8]'}`} />
                <span>{activeWorkflow.isActive ? (isAr ? '🟢 نشط ويعمل تلقائياً' : '🟢 Active & Monitoring') : (isAr ? '⚪ متوقف مؤقتاً' : '⚪ Paused')}</span>
              </button>
            </div>
            <p className="text-xs text-[var(--cds-text-02)] mt-0.5">
              {isAr
                ? 'بناء وربط سلاسل الوكلاء والأدوات الذكية لمعالجة وتنظيف وفحص وتوليد التقارير تلقائياً'
                : 'Construct and connect agentic AI toolchains for automated data quality, cleaning & reporting'}
            </p>
          </div>
        </div>

        {/* Workflow Switcher & Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* User Guide Interactive Manual Button */}
          <button
            onClick={() => setIsGuideModalOpen(true)}
            className="px-3.5 py-1.5 bg-[#009d9a]/15 hover:bg-[#009d9a]/25 text-[#08bdba] border border-[#009d9a]/40 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            title={isAr ? 'فتح دليل الاستخدام المفصل وشرح كافة العناصر' : 'Open Comprehensive User Guide'}
          >
            <BookOpen className="w-3.5 h-3.5 text-[#08bdba]" />
            <span>{isAr ? 'دليل الاستخدام' : 'User Guide'}</span>
          </button>

          {/* Templates Gallery Button */}
          <button
            onClick={() => setIsTemplateModalOpen(true)}
            className="px-3.5 py-1.5 bg-[#8a3ffc]/15 hover:bg-[#8a3ffc]/25 text-[#be95ff] border border-[#8a3ffc]/40 rounded-lg text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isAr ? 'مكتبة القوالب الجاهزة' : 'Templates Library'}</span>
            <span className="px-1.5 py-0.2 bg-[#8a3ffc] text-white text-[10px] rounded-full">
              {WORKFLOW_TEMPLATES.length}
            </span>
          </button>

          {/* Workflow Selector Dropdown */}
          <div className="relative">
            <select
              value={activeWorkflowId}
              onChange={(e) => setActiveWorkflowId(e.target.value)}
              className="bg-[var(--cds-layer-02)] text-white border border-[var(--cds-border-strong)] rounded-lg px-3 py-1.5 text-xs font-mono font-bold appearance-none pr-8 focus:outline-none focus:border-[#0f62fe] cursor-pointer"
            >
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {isAr ? (w.nameAr || w.name) : w.name} ({w.nodes.length} {isAr ? 'عقدة' : 'nodes'})
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-[var(--cds-text-02)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Reset button */}
          <button
            onClick={handleResetWorkflow}
            title={isAr ? 'إعادة تعيين إلى القالب الأصلي' : 'Reset to template'}
            className="p-2 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-02)] hover:text-white rounded-lg border border-[var(--cds-border-subtle)] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Toggle Output Panel */}
          <button
            onClick={() => setIsOutputPanelOpen(!isOutputPanelOpen)}
            className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer ${
              isOutputPanelOpen
                ? 'bg-[#0f62fe]/20 text-[#78a9ff] border-[#0f62fe]/50 shadow-[0_0_12px_rgba(15,98,254,0.25)]'
                : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] border-[var(--cds-border-subtle)] hover:text-white'
            }`}
            title={isAr ? 'عرض / إخفاء لوحة معاينة المخرجات والنتائج' : 'Toggle Output Inspector Panel'}
          >
            <BarChart3 className="w-3.5 h-3.5 text-[#78a9ff]" />
            <span>{isAr ? 'لوحة المخرجات والنتائج' : 'Output Panel'}</span>
          </button>

          {/* Toggle Logs Console */}
          <button
            onClick={() => setIsLogsOpen(!isLogsOpen)}
            className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer ${
              isLogsOpen
                ? 'bg-[#0f62fe]/20 text-[#78a9ff] border-[#0f62fe]/50'
                : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] border-[var(--cds-border-subtle)] hover:text-white'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>{isAr ? 'سجل التشغيل' : 'Console'}</span>
            {logs.length > 0 && (
              <span className="px-1.5 py-0.2 bg-[#0f62fe] text-white text-[10px] rounded-full">
                {logs.length}
              </span>
            )}
          </button>

          {/* Version History Sidebar Toggle Button */}
          <button
            onClick={() => {
              setIsVersionHistoryOpen(!isVersionHistoryOpen);
              if (!isVersionHistoryOpen) {
                setSelectedNodeId(null);
              }
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm border ${
              isVersionHistoryOpen
                ? 'bg-[#0f62fe]/25 text-[#78a9ff] border-[#0f62fe]/60 shadow-[0_0_12px_rgba(15,98,254,0.3)]'
                : 'bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-02)] hover:text-white border-[var(--cds-border-strong)]'
            }`}
            title={isAr ? 'سجل النسخ والإصدارات واستعادة الحالات السابقة' : 'Pipeline Version History & Snapshots'}
          >
            <History className="w-3.5 h-3.5 text-[#78a9ff]" />
            <span>{isAr ? 'سجل النسخ' : 'Version History'}</span>
            <span className="px-1.5 py-0.2 bg-[var(--cds-layer-01)] text-[#78a9ff] text-[10px] rounded-full border border-[var(--cds-border-subtle)]">
              {versions.filter((v) => v.workflowId === activeWorkflow.id).length}
            </span>
          </button>

          {/* Save Workflow */}
          <button
            onClick={handleSaveWorkflow}
            className="px-3.5 py-1.5 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-01)] border border-[var(--cds-border-strong)] rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4 text-[#78a9ff]" />
            <span>{isAr ? 'حفظ السلسلة' : 'Save'}</span>
          </button>

          {/* Run Pipeline Now */}
          <button
            onClick={handleRunWorkflow}
            disabled={isRunning}
            className="px-4 py-1.5 bg-[#0f62fe] hover:bg-[#0353e9] active:bg-[#002d9c] text-white rounded-lg text-xs font-mono font-bold flex items-center gap-2 transition-all shadow-md disabled:opacity-50 cursor-pointer"
          >
            <Play className={`w-4 h-4 fill-current ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? (isAr ? 'جاري المعالجة...' : 'Running...') : (isAr ? 'تشغيل السلسلة الآن' : 'Run Pipeline')}</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Layout (Sidebar + Canvas + Drawer) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar: Node Library / Palette (Supports Drag & Drop) */}
        <div className="w-64 md:w-72 bg-[var(--cds-layer-01)] border-e border-[var(--cds-border-subtle)] flex flex-col shrink-0 z-10 shadow-md">
          <div className="p-3 border-b border-[var(--cds-border-subtle)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-[var(--cds-text-02)] uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#0f62fe]" />
                {isAr ? 'مكتبة الأدوات والعناصر' : 'Tool & Node Palette'}
              </span>
              <span className="text-[10px] text-[var(--cds-text-03)] font-mono">
                {filteredPalette.length} {isAr ? 'عنصر' : 'nodes'}
              </span>
            </div>

            <div className="p-1.5 rounded-lg bg-[#0f62fe]/10 border border-[#0f62fe]/20 text-[10px] text-[#78a9ff] flex items-center gap-1.5">
              <Move className="w-3.5 h-3.5 shrink-0" />
              <span>{isAr ? 'اسحب أي عنصر وأفلته في اللوحة مباشرة' : 'Drag & drop any node directly to canvas'}</span>
            </div>

            {/* Search filter */}
            <div className="relative">
              <Search className={`w-3.5 h-3.5 text-[var(--cds-text-03)] absolute top-1/2 -translate-y-1/2 ${isAr ? 'right-2.5' : 'left-2.5'}`} />
              <input
                type="text"
                placeholder={isAr ? 'بحث في الأدوات والعمليات...' : 'Search nodes...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg py-1.5 text-xs text-white placeholder-[#8d8d8d] focus:outline-none focus:border-[#0f62fe] ${
                  isAr ? 'pr-8 pl-2.5' : 'pl-8 pr-2.5'
                }`}
              />
            </div>

            {/* Category tabs */}
            <div className="grid grid-cols-4 gap-1 text-[10px] font-mono">
              {[
                { id: 'all', label: isAr ? 'الكل' : 'All' },
                { id: 'trigger', label: isAr ? 'مشغلات' : 'Trig' },
                { id: 'ai', label: isAr ? 'ذكاء' : 'AI' },
                { id: 'action', label: isAr ? 'إجراءات' : 'Act' },
              ].map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(c.id)}
                  className={`py-1 rounded-lg text-center transition-colors cursor-pointer ${
                    selectedCategory === c.id
                      ? 'bg-[#0f62fe] text-white font-bold'
                      : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] hover:text-white'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Node Items List (Draggable + Clickable) */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredPalette.map((item) => {
              const IconComp = item.icon;
              return (
                <div
                  key={item.nodeType}
                  draggable={true}
                  onDragStart={(e) => onDragStart(e, item)}
                  onClick={() => handleAddNode(item)}
                  className="group p-2.5 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] border border-[var(--cds-border-subtle)] hover:border-[#0f62fe] rounded-lg cursor-grab active:cursor-grabbing transition-all duration-150 flex items-start gap-2.5 shadow-sm select-none"
                  title={isAr ? 'اسحب إلى اللوحة أو انقر للإضافة' : 'Drag to canvas or click to add'}
                >
                  <div className="p-2 rounded-lg bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] group-hover:border-[#0f62fe] text-[#78a9ff] shrink-0">
                    <IconComp className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className="text-xs font-bold text-white truncate">
                        {isAr ? item.labelAr : item.label}
                      </h4>
                      <Plus className="w-3.5 h-3.5 text-[var(--cds-text-03)] group-hover:text-[#0f62fe] transition-colors shrink-0" />
                    </div>
                    <p className="text-[10px] text-[var(--cds-text-02)] line-clamp-2 mt-0.5 leading-tight">
                      {isAr ? item.descAr : item.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Stats Footer */}
          <div className="p-3 bg-[var(--cds-layer-01)] border-t border-[var(--cds-border-subtle)] text-[10px] font-mono text-[var(--cds-text-02)] space-y-1">
            <div className="flex justify-between">
              <span>{isAr ? 'إجمالي العقد على اللوحة:' : 'Total Nodes:'}</span>
              <span className="text-white font-bold">{nodes.length}</span>
            </div>
            <div className="flex justify-between">
              <span>{isAr ? 'الروابط النشطة:' : 'Active Links:'}</span>
              <span className="text-white font-bold">{edges.length}</span>
            </div>
            <div className="flex justify-between">
              <span>{isAr ? 'عدد مرات التشغيل:' : 'Run Count:'}</span>
              <span className="text-[#42be65] font-bold">{activeWorkflow.runCount || 0}</span>
            </div>
          </div>
        </div>

        {/* Center: React Flow Interactive Canvas (with Drag & Drop Dropzone) */}
        <div 
          ref={reactFlowWrapper}
          className="flex-1 relative bg-[var(--cds-background)] overflow-hidden flex flex-col"
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionLineComponent={WorkflowConnectionLine}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
            colorMode="dark"
            className="h-full w-full"
            connectionRadius={40}
            elevateEdgesOnSelect={true}
            defaultEdgeOptions={{
              type: 'workflowCustomEdge',
              animated: true,
              style: { strokeWidth: 2.5, stroke: '#0f62fe' },
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1.2} color="#333333" />
            <Controls className="!bg-[var(--cds-layer-02)] !border-[var(--cds-border-subtle)] !text-white !rounded-lg !shadow-xl" />
            <MiniMap
              className="!bg-[var(--cds-layer-01)] !border-[var(--cds-border-subtle)] !rounded-lg overflow-hidden"
              nodeColor={(n) => {
                const cat = (n.data as any)?.category;
                if (cat === 'trigger') return '#0f62fe';
                if (cat === 'ai') return '#8a3ffc';
                if (cat === 'logic') return '#009d9a';
                if (cat === 'action') return '#24a148';
                return '#525252';
              }}
              maskColor="rgba(0, 0, 0, 0.7)"
            />

            {/* Floating Quick Helper Banner */}
            <Panel position="top-right" className="bg-[var(--cds-layer-01)]/90 backdrop-blur border border-[var(--cds-border-subtle)] rounded-lg p-2.5 text-xs text-[var(--cds-text-02)] shadow-xl flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-[#78a9ff] font-mono text-[11px]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isAr ? '🔗 اسحب المنافذ للتوصيل أو انقر على العقدة للربط والمعاينة' : '🔗 Drag ports to connect or click a node for inspector'}</span>
              </div>
            </Panel>
          </ReactFlow>

          {/* Interactive Output Panel Inspector */}
          <OutputPanel
            nodes={nodes}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            lastRunResult={lastRunResult}
            isOpen={isOutputPanelOpen}
            onClose={() => setIsOutputPanelOpen(false)}
            isAr={isAr}
          />

          {/* Bottom Execution Logs & Results Console Drawer */}
          {isLogsOpen && (
            <div className="h-72 bg-[var(--cds-layer-01)] border-t border-[var(--cds-border-subtle)] flex flex-col z-20 shadow-2xl animate-in slide-in-from-bottom duration-200">
              {/* Console Header */}
              <div className="p-2.5 bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)] flex flex-wrap items-center justify-between px-4 gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-white font-mono text-xs font-bold">
                    <Terminal className="w-4 h-4 text-[#78a9ff]" />
                    <span>{isAr ? 'سجل تشغيل ومراقبة المراحل (Execution Logs)' : 'Workflow Execution Console'}</span>
                  </div>

                  {/* Main Tab Switcher */}
                  <div className="flex gap-1 bg-[var(--cds-layer-01)] p-0.5 rounded-lg border border-[var(--cds-border-subtle)] text-[11px] font-mono">
                    <button
                      onClick={() => setActiveLogTab('logs')}
                      className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                        activeLogTab === 'logs'
                          ? 'bg-[#0f62fe] text-white font-bold'
                          : 'text-[var(--cds-text-02)] hover:text-white'
                      }`}
                    >
                      {isAr ? 'سجل الأحداث' : 'Logs'} ({filteredLogs.length})
                    </button>
                    <button
                      onClick={() => setActiveLogTab('results')}
                      className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                        activeLogTab === 'results'
                          ? 'bg-[#0f62fe] text-white font-bold'
                          : 'text-[var(--cds-text-02)] hover:text-white'
                      }`}
                    >
                      {isAr ? 'المخرجات والنتائج' : 'Output Summary'}
                    </button>
                  </div>

                  {/* Log Filter Pills (when on logs tab) */}
                  {activeLogTab === 'logs' && (
                    <div className="flex items-center gap-1 text-[10px] font-mono">
                      {[
                        { id: 'all', label: isAr ? 'الكل' : 'All' },
                        { id: 'error', label: isAr ? 'الأخطاء ❌' : 'Errors' },
                        { id: 'warning', label: isAr ? 'تحذيرات ⚠️' : 'Warnings' },
                        { id: 'success', label: isAr ? 'ناجح ✅' : 'Success' },
                      ].map((lvl) => (
                        <button
                          key={lvl.id}
                          onClick={() => setLogFilterLevel(lvl.id)}
                          className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                            logFilterLevel === lvl.id
                              ? 'bg-[var(--cds-layer-03)] text-white font-bold border border-[var(--cds-border-strong)]'
                              : 'text-[var(--cds-text-03)] hover:text-white'
                          }`}
                        >
                          {lvl.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Console Action Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyLogs}
                    className="p-1.5 bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-02)] hover:text-white rounded-lg border border-[var(--cds-border-subtle)] text-xs flex items-center gap-1 font-mono transition-colors cursor-pointer"
                    title={isAr ? 'نسخ السجلات' : 'Copy Logs'}
                  >
                    {copiedLogs ? <Check className="w-3.5 h-3.5 text-[#42be65]" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{isAr ? 'نسخ' : 'Copy'}</span>
                  </button>

                  <button
                    onClick={handleDownloadLogs}
                    className="p-1.5 bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-02)] hover:text-white rounded-lg border border-[var(--cds-border-subtle)] text-xs flex items-center gap-1 font-mono transition-colors cursor-pointer"
                    title={isAr ? 'تحميل كملف JSON' : 'Export JSON'}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isAr ? 'تصدير' : 'Export'}</span>
                  </button>

                  <button
                    onClick={() => setIsLogsOpen(false)}
                    className="text-xs text-[var(--cds-text-02)] hover:text-white px-2.5 py-1 bg-[var(--cds-layer-01)] rounded-lg border border-[var(--cds-border-subtle)] cursor-pointer"
                  >
                    {isAr ? 'إغلاق ✕' : 'Close ✕'}
                  </button>
                </div>
              </div>

              {/* Console Body */}
              <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] space-y-1.5 bg-[var(--cds-background)]">
                {activeLogTab === 'logs' ? (
                  filteredLogs.length === 0 ? (
                    <div className="text-center py-10 text-[var(--cds-text-03)] space-y-1">
                      <Terminal className="w-6 h-6 mx-auto opacity-30 text-[#0f62fe]" />
                      <p>{isAr ? 'لا توجد سجلات تطابق البحث. انقر على "تشغيل السلسلة الآن" لبدء التنفيذ.' : 'No logs yet. Click "Run Pipeline" to execute.'}</p>
                    </div>
                  ) : (
                    filteredLogs.map((log) => (
                      <div
                        key={log.id}
                        className={`p-2 rounded-lg flex items-start gap-2 border transition-all ${
                          log.level === 'error'
                            ? 'bg-[#da1e28]/10 border-[#da1e28]/30 text-[#fa4d56]'
                            : log.level === 'warning'
                            ? 'bg-[#f1c21b]/10 border-[#f1c21b]/30 text-[#f1c21b]'
                            : log.level === 'success'
                            ? 'bg-[#24a148]/10 border-[#24a148]/30 text-[#42be65]'
                            : 'bg-[var(--cds-layer-02)]/40 border-[var(--cds-border-subtle)] text-[var(--cds-text-02)]'
                        }`}
                      >
                        <span className="text-[var(--cds-text-03)] shrink-0 text-[10px]">{log.timestamp}</span>
                        {log.nodeLabel && (
                          <span className="px-1.5 py-0.2 rounded bg-[var(--cds-layer-02)] border border-[var(--cds-border-strong)] text-white font-bold shrink-0">
                            {log.nodeLabel}
                          </span>
                        )}
                        <span className="flex-1">{log.message}</span>
                        {log.details && (
                          <span className="text-[10px] text-[var(--cds-text-03)] bg-[var(--cds-layer-01)] px-1.5 py-0.5 rounded border border-[var(--cds-border-subtle)] shrink-0">
                            {JSON.stringify(log.details).substring(0, 35)}...
                          </span>
                        )}
                      </div>
                    ))
                  )
                ) : (
                  // Results Tab
                  <div className="p-2 space-y-3">
                    {lastRunResult ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="p-3 bg-[var(--cds-layer-01)] rounded-lg border border-[var(--cds-border-subtle)]">
                          <span className="text-[var(--cds-text-02)] text-[10px] block">{isAr ? 'حالة السلسلة الكلية' : 'Execution Status'}</span>
                          <span className={`text-base font-bold ${lastRunResult.status === 'success' ? 'text-[#42be65]' : 'text-[#fa4d56]'}`}>
                            {lastRunResult.status === 'success' ? (isAr ? 'ناجح 100% ✅' : 'Success') : (isAr ? 'تعثر في التنفيذ ❌' : 'Failed')}
                          </span>
                          <span className="text-[10px] text-[var(--cds-text-03)] block mt-1">
                            {isAr ? 'المدة الزمنية:' : 'Duration:'} {lastRunResult.totalDurationMs}ms
                          </span>
                        </div>

                        {lastRunResult.producedOutputs.cleanedDatasetName && (
                          <div className="p-3 bg-[var(--cds-layer-01)] rounded-lg border border-[#24a148]/40">
                            <span className="text-[#42be65] text-[10px] block">{isAr ? 'الجدول المنشأ تلقائياً' : 'Created Dataset'}</span>
                            <span className="text-xs font-bold text-white block truncate">
                              {lastRunResult.producedOutputs.cleanedDatasetName}
                            </span>
                            <span className="text-[10px] text-[var(--cds-text-03)] block mt-1">
                              {isAr ? 'أضيف إلى قائمة المجموعات' : 'Added to active datasets'}
                            </span>
                          </div>
                        )}

                        {lastRunResult.producedOutputs.aiSummary && (
                          <div className="p-3 bg-[var(--cds-layer-01)] rounded-lg border border-[#8a3ffc]/40 md:col-span-3">
                            <span className="text-[#be95ff] text-[10px] block font-bold mb-1">{isAr ? 'الرؤى والتحليل الذكي المستخلص' : 'AI Generated Insights'}</span>
                            <p className="text-xs text-[var(--cds-text-01)] leading-relaxed whitespace-pre-wrap">
                              {lastRunResult.producedOutputs.aiSummary}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-[var(--cds-text-03)]">
                        {isAr ? 'لم يتم تشغيل السلسلة بعد.' : 'No run results available.'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Node Properties Drawer */}
        {selectedNode && (
          <NodeConfigDrawer
            node={selectedNode}
            allNodes={nodes}
            edges={edges}
            onClose={() => setSelectedNodeId(null)}
            onUpdateNodeData={handleUpdateNodeData}
            onDeleteNode={handleDeleteNode}
            onTestNode={handleTestSingleNode}
            onConnectNodes={handleConnectNodes}
            onDeleteEdge={handleDeleteEdge}
            isTesting={isTestingNode}
          />
        )}

        {/* Right: Pipeline Version History Drawer */}
        <WorkflowVersionHistoryDrawer
          isOpen={isVersionHistoryOpen}
          onClose={() => setIsVersionHistoryOpen(false)}
          workflowId={activeWorkflow.id}
          workflowName={activeWorkflow.name}
          workflowNameAr={activeWorkflow.nameAr}
          currentNodes={nodes}
          currentEdges={edges}
          versions={versions}
          onSaveVersion={handleSaveVersionSnapshot}
          onRevertVersion={handleRevertVersion}
          onDeleteVersion={handleDeleteVersion}
          onUpdateVersion={handleUpdateVersion}
          isAr={isAr}
        />
      </div>

      {/* Templates Gallery Modal */}
      <WorkflowTemplateModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        onSelectTemplate={handleSelectTemplate}
        activeTemplateId={activeWorkflowId}
        isAr={isAr}
      />

      {/* Comprehensive Workflow Studio User Guide Modal */}
      <WorkflowGuideModal
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
        isAr={isAr}
      />
    </div>
  );
};

export const WorkflowStudio: React.FC = () => {
  return (
    <ReactFlowProvider>
      <WorkflowStudioContent />
    </ReactFlowProvider>
  );
};
